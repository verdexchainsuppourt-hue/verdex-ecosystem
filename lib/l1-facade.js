/**
 * Typed Verdex mainnet facade for mobile clients.
 *
 * This is deliberately not a generic upstream proxy. Every response is bound
 * to a runtime-verified chain identity, and unsupported legacy/testnet routes
 * fail closed.
 */
const { jsonResponse, checkRateLimit, setCORS } = require('./api-lib');
const { validAddress, verifyMainnetConfig, rpcCall, encodeCall } = require('./mainnet');

function requestPath(req) {
  const raw = Array.isArray(req.query?.path) ? req.query.path[0] : req.query?.path;
  if (typeof raw !== 'string' || !raw) return '';
  try {
    const decoded = decodeURIComponent(raw);
    return decoded.startsWith('/') ? decoded.split('?')[0] : `/${decoded.split('?')[0]}`;
  } catch {
    return '';
  }
}

function decimal(value) {
  try {
    const raw = String(value ?? '').trim();
    if (!/^(?:0x[0-9a-fA-F]+|[0-9]+)$/.test(raw)) return null;
    return BigInt(raw).toString();
  } catch {
    return null;
  }
}

function integer(value) {
  try {
    const raw = String(value ?? '').trim();
    if (!/^(?:0x[0-9a-fA-F]+|[0-9]+)$/.test(raw)) return null;
    const parsed = Number(BigInt(raw));
    return Number.isSafeInteger(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'object') return req.body;
  try {
    return JSON.parse(req.body);
  } catch {
    return {};
  }
}

function normalizeTransaction(tx, receipt) {
  if (!tx) return null;
  const value = decimal(tx.value);
  const nonce = integer(tx.nonce);
  if (value === null || nonce === null) {
    throw new Error('Mainnet RPC returned an invalid transaction quantity');
  }
  return {
    hash: tx.hash,
    from: tx.from,
    to: tx.to,
    value,
    nonce,
    blockNumber: tx.blockNumber ? integer(tx.blockNumber) : null,
    status: receipt?.status ? integer(receipt.status) : null,
    gas: tx.gas ? decimal(tx.gas) : null,
    gasPrice: tx.gasPrice ? decimal(tx.gasPrice) : null
  };
}

async function verifiedOrUnavailable(res) {
  const verification = await verifyMainnetConfig();
  if (verification.ready) return verification;
  jsonResponse(res, 503, {
    success: false,
    code: 'MAINNET_NOT_READY',
    error: 'Verdex mainnet is not configured and runtime-verified for this release.'
  });
  return null;
}

async function chainInfo(verification) {
  const { config } = verification;
  const gasPrice = await rpcCall(config.rpcUrl, 'eth_gasPrice').catch(() => null);
  return {
    chainId: config.chainId,
    chainIdHex: config.chainIdHex,
    chainName: config.chainName,
    networkKey: config.networkKey,
    releaseApproved: true,
    genesisHash: config.genesisHash,
    protocolVersion: config.protocolVersion,
    assetModel: config.assetModel,
    symbol: config.symbol,
    decimals: config.decimals,
    contracts: config.contracts,
    gasPrice,
    verifiedAt: verification.checkedAt
  };
}

module.exports = async (req, res) => {
  setCORS(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (!checkRateLimit(`l1-facade:${ip}`, 120, 60_000).allowed) {
    return jsonResponse(res, 429, { success: false, error: 'Mainnet request rate limit exceeded.' });
  }

  const path = requestPath(req);
  if (!path) return jsonResponse(res, 400, { success: false, error: 'A supported L1 path is required.' });
  if (/\/api\/(?:faucet|testnet)/i.test(path)) {
    return jsonResponse(res, 410, { success: false, code: 'DISABLED', error: 'Testnet and faucet routes are permanently disabled.' });
  }
  if (path === '/api/tx/send') {
    return jsonResponse(res, 410, {
      success: false,
      code: 'RAW_TRANSACTION_REQUIRED',
      error: 'Legacy transaction submission is disabled. Use a verified EIP-155 raw-transaction flow.'
    });
  }

  const verification = await verifiedOrUnavailable(res);
  if (!verification) return undefined;
  const { config } = verification;

  try {
    if (req.method === 'GET' && path === '/api/chain/info') {
      return jsonResponse(res, 200, { success: true, data: await chainInfo(verification) });
    }

    if (req.method === 'GET' && path === '/api/stats') {
      const [blockNumber, gasPrice] = await Promise.all([
        rpcCall(config.rpcUrl, 'eth_blockNumber'),
        rpcCall(config.rpcUrl, 'eth_gasPrice')
      ]);
      return jsonResponse(res, 200, {
        success: true,
        data: {
          chainId: config.chainId,
          blockNumber: integer(blockNumber),
          gasPrice,
          verifiedAt: verification.checkedAt
        }
      });
    }

    const balanceMatch = path.match(/^\/api\/account\/(0x[a-fA-F0-9]{40})\/balance$/);
    if (req.method === 'GET' && balanceMatch) {
      const address = balanceMatch[1].toLowerCase();
      const result = config.assetModel === 'native'
        ? await rpcCall(config.rpcUrl, 'eth_getBalance', [address, 'latest'])
        : await rpcCall(config.rpcUrl, 'eth_call', [{
          to: config.contracts.vdx,
          data: encodeCall('70a08231', address)
        }, 'latest']);
      const balance = decimal(result);
      if (balance === null) throw new Error('Invalid balance quantity from mainnet RPC');
      return jsonResponse(res, 200, { success: true, data: { balance } });
    }

    const nonceMatch = path.match(/^\/api\/account\/(0x[a-fA-F0-9]{40})\/nonce$/);
    if (req.method === 'GET' && nonceMatch) {
      const nonce = await rpcCall(config.rpcUrl, 'eth_getTransactionCount', [nonceMatch[1], 'pending']);
      return jsonResponse(res, 200, { success: true, data: { nonce: integer(nonce) ?? 0 } });
    }

    const accountTxMatch = path.match(/^\/api\/account\/(0x[a-fA-F0-9]{40})\/txs$/);
    if (req.method === 'GET' && accountTxMatch) {
      return jsonResponse(res, 200, {
        success: true,
        data: { transactions: [], indexed: false, message: 'Account history indexer is not configured.' }
      });
    }

    const txMatch = path.match(/^\/api\/tx\/(0x[a-fA-F0-9]{64})$/);
    if (req.method === 'GET' && txMatch) {
      const [tx, receipt] = await Promise.all([
        rpcCall(config.rpcUrl, 'eth_getTransactionByHash', [txMatch[1]], { allowNull: true }),
        rpcCall(config.rpcUrl, 'eth_getTransactionReceipt', [txMatch[1]], { allowNull: true })
      ]);
      if (!tx) {
        return jsonResponse(res, 200, {
          success: true,
          data: { found: false, transaction: null, receipt: receipt ? { found: true } : null }
        });
      }
      return jsonResponse(res, 200, {
        success: true,
        data: { found: true, ...normalizeTransaction(tx, receipt) }
      });
    }

    const recentMatch = path.match(/^\/api\/blocks\/recent\/([0-9]{1,2})$/);
    if (req.method === 'GET' && recentMatch) {
      const count = Math.min(Math.max(Number(recentMatch[1]), 1), 30);
      const head = integer(await rpcCall(config.rpcUrl, 'eth_blockNumber'));
      if (head === null) throw new Error('Invalid head block number');
      const blocks = await Promise.all(Array.from({ length: Math.min(count, head + 1) }, async (_, index) => {
        const number = head - index;
        const block = await rpcCall(config.rpcUrl, 'eth_getBlockByNumber', [`0x${number.toString(16)}`, false]);
        return {
          number,
          hash: block.hash,
          parentHash: block.parentHash,
          timestamp: integer(block.timestamp),
          transactionCount: Array.isArray(block.transactions) ? block.transactions.length : 0
        };
      }));
      return jsonResponse(res, 200, { success: true, data: { blocks } });
    }

    if (req.method === 'GET' && /^\/api\/validators(?:\/detailed)?$/.test(path)) {
      return jsonResponse(res, 503, {
        success: false,
        code: 'VALIDATOR_REGISTRY_NOT_READY',
        error: 'The public validator registry is not configured for this release.'
      });
    }

    if (req.method === 'POST' && path === '/api/contract/call') {
      const body = parseBody(req);
      const requested = String(body.contractAddress || '').toLowerCase();
      const target = config.contracts.vdxu;
      const holder = Array.isArray(body.args) ? body.args[0] : null;
      if (!target || requested !== target || body.method !== 'balanceOf' || !validAddress(holder)) {
        return jsonResponse(res, 403, { success: false, error: 'Only the verified VDXU balance call is allowed.' });
      }
      const result = await rpcCall(config.rpcUrl, 'eth_call', [{
        to: target,
        data: encodeCall('70a08231', holder)
      }, 'latest']);
      const balance = decimal(result);
      if (balance === null) throw new Error('Invalid VDXU balance quantity from mainnet RPC');
      return jsonResponse(res, 200, { success: true, data: { result: balance } });
    }

    return jsonResponse(res, 404, { success: false, error: 'Unsupported verified mainnet facade path.' });
  } catch {
    return jsonResponse(res, 502, { success: false, error: 'Verified mainnet RPC request failed.' });
  }
};
