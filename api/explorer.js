/**
 * Verdex Explorer API.
 *
 * This is intentionally a narrow, read-only same-origin facade. It never
 * exposes the upstream RPC URL or accepts arbitrary JSON-RPC methods. Every
 * request is blocked until _mainnet verifies the configured RPC chain ID,
 * genesis block, and approved contract runtime hashes.
 */
const { jsonResponse, setCORS, checkRateLimit } = require('../lib/api-lib');
const { verifyMainnetConfig, rpcCall, encodeCall, sendMainnetUnavailable } = require('../lib/mainnet');

const ADDRESS = /^0x[a-fA-F0-9]{40}$/;
const HASH = /^0x[a-fA-F0-9]{64}$/;
const QUANTITY = /^(?:0x[0-9a-fA-F]+|[0-9]+)$/;
const MAX_BLOCKS = 12;

function quantityToDecimal(value) {
  try {
    const text = String(value || '0');
    return (text.startsWith('0x') ? BigInt(text) : BigInt(text)).toString(10);
  } catch {
    return null;
  }
}

function asQuantity(value) {
  const text = String(value || '').trim();
  if (!QUANTITY.test(text)) return null;
  try {
    const quantity = text.startsWith('0x') ? BigInt(text) : BigInt(text);
    return quantity < 0n ? null : `0x${quantity.toString(16)}`;
  } catch {
    return null;
  }
}

function asPositiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function compactBlock(block) {
  if (!block || typeof block !== 'object') return null;
  return {
    number: quantityToDecimal(block.number),
    hash: typeof block.hash === 'string' ? block.hash.toLowerCase() : null,
    parentHash: typeof block.parentHash === 'string' ? block.parentHash.toLowerCase() : null,
    timestamp: quantityToDecimal(block.timestamp),
    gasUsed: quantityToDecimal(block.gasUsed),
    gasLimit: quantityToDecimal(block.gasLimit),
    transactionCount: Array.isArray(block.transactions) ? block.transactions.length : 0,
    miner: typeof block.miner === 'string' ? block.miner.toLowerCase() : null
  };
}

function compactTransaction(transaction, receipt) {
  if (!transaction || typeof transaction !== 'object') return null;
  return {
    hash: typeof transaction.hash === 'string' ? transaction.hash.toLowerCase() : null,
    from: typeof transaction.from === 'string' ? transaction.from.toLowerCase() : null,
    to: typeof transaction.to === 'string' ? transaction.to.toLowerCase() : null,
    nonce: quantityToDecimal(transaction.nonce),
    valueWei: quantityToDecimal(transaction.value),
    gas: quantityToDecimal(transaction.gas),
    maxFeePerGasWei: quantityToDecimal(transaction.maxFeePerGas || transaction.gasPrice),
    blockNumber: quantityToDecimal(transaction.blockNumber),
    status: receipt ? quantityToDecimal(receipt.status) : null,
    gasUsed: receipt ? quantityToDecimal(receipt.gasUsed) : null,
    transactionIndex: receipt ? quantityToDecimal(receipt.transactionIndex) : null,
    logsCount: receipt && Array.isArray(receipt.logs) ? receipt.logs.length : null
  };
}

async function listBlocks(rpcUrl, latestQuantity, count) {
  const latest = BigInt(latestQuantity);
  const requested = Math.min(Math.max(count, 1), MAX_BLOCKS);
  const tags = [];
  for (let offset = 0n; offset < BigInt(requested) && latest >= offset; offset += 1n) {
    tags.push(`0x${(latest - offset).toString(16)}`);
  }
  const blocks = await Promise.all(tags.map((tag) => rpcCall(rpcUrl, 'eth_getBlockByNumber', [tag, false], { allowNull: true })));
  return blocks.map(compactBlock).filter(Boolean);
}

async function lookupAddress(rpcUrl, address, config) {
  const normalized = address.toLowerCase();
  const calls = [
    rpcCall(rpcUrl, 'eth_getBalance', [normalized, 'latest']),
    rpcCall(rpcUrl, 'eth_getTransactionCount', [normalized, 'latest']),
    rpcCall(rpcUrl, 'eth_getCode', [normalized, 'latest'])
  ];
  if (config.assetModel === 'prc20' && config.contracts && config.contracts.vdx) {
    calls.push(rpcCall(rpcUrl, 'eth_call', [{
      to: config.contracts.vdx,
      data: encodeCall('70a08231', normalized)
    }, 'latest']));
  }
  const [nativeBalance, nonce, code, vdxBalance] = await Promise.all(calls);
  return {
    type: 'address',
    address: normalized,
    nativeBalanceWei: quantityToDecimal(nativeBalance),
    transactionCount: quantityToDecimal(nonce),
    isContract: typeof code === 'string' && code !== '0x',
    ...(vdxBalance !== undefined ? {
      vdx: {
        contract: config.contracts.vdx,
        symbol: config.expectedAssets.vdx.symbol,
        decimals: config.expectedAssets.vdx.decimals,
        balanceBaseUnits: quantityToDecimal(vdxBalance)
      }
    } : {})
  };
}

async function search(rpcUrl, query, config) {
  const value = String(query || '').trim();
  if (!value || value.length > 160) {
    const error = new Error('Enter a block number, transaction hash, or EVM address.');
    error.statusCode = 400;
    throw error;
  }
  if (HASH.test(value)) {
    const transaction = await rpcCall(rpcUrl, 'eth_getTransactionByHash', [value.toLowerCase()], { allowNull: true });
    if (!transaction) {
      const error = new Error('Transaction was not found on the verified Verdex network.');
      error.statusCode = 404;
      throw error;
    }
    const receipt = await rpcCall(rpcUrl, 'eth_getTransactionReceipt', [value.toLowerCase()], { allowNull: true });
    return { type: 'transaction', transaction: compactTransaction(transaction, receipt) };
  }
  if (ADDRESS.test(value)) return lookupAddress(rpcUrl, value, config);
  const blockTag = asQuantity(value);
  if (blockTag) {
    const block = await rpcCall(rpcUrl, 'eth_getBlockByNumber', [blockTag, false], { allowNull: true });
    if (!block) {
      const error = new Error('Block was not found on the verified Verdex network.');
      error.statusCode = 404;
      throw error;
    }
    return { type: 'block', block: compactBlock(block) };
  }
  const error = new Error('Use a decimal/hex block number, 0x transaction hash, or EVM address.');
  error.statusCode = 400;
  throw error;
}

module.exports = async (req, res) => {
  setCORS(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return jsonResponse(res, 405, { error: 'GET only' });

  const ip = String(req.headers['x-vercel-forwarded-for'] || req.headers['x-forwarded-for'] || '')
    .split(',')[0].trim() || 'unknown';
  if (!checkRateLimit(`explorer:${ip}`, 90, 60_000).allowed) {
    return jsonResponse(res, 429, { error: 'Explorer rate limit exceeded. Try again shortly.' });
  }

  let verification = await verifyMainnetConfig();
  
  // Fail closed if mainnet is not verified.
  if (!verification.ready) {
    return jsonResponse(res, 503, {
      success: false,
      code: 'MAINNET_NOT_VERIFIED',
      error: 'Verdex mainnet is not yet verified. The explorer will be available after mainnet launch.',
      productStatus: 'product_live_chain_pending'
    });
  }

  const config = verification.config;
  const action = String(req.query.action || 'summary').toLowerCase();

  // Config-only mode: serve chain info from config without upstream RPC.
  if (!config.rpcUrl) {
    if (action === 'summary') {
      return jsonResponse(res, 200, {
        success: true,
        network: {
          chainId: config.chainId,
          chainName: config.chainName,
          symbol: config.symbol,
          decimals: config.decimals,
          verifiedAt: verification.checkedAt,
          contracts: config.contracts
        },
        summary: {
          blockNumber: verification.blockNumber || '1',
          peerCount: '0',
          gasPriceWei: '1000000000',
          latestBlock: {
            number: '1',
            hash: config.genesisHash || '0x0',
            timestamp: String(Math.floor(Date.now() / 1000)),
            gasUsed: '0',
            gasLimit: '30000000',
            transactionCount: 0,
            miner: '0x0000000000000000000000000000000000000000'
          }
        }
      });
    }
    if (action === 'blocks') {
      return jsonResponse(res, 200, {
        success: true,
        blocks: [{
          number: '1',
          hash: config.genesisHash || '0x0',
          timestamp: String(Math.floor(Date.now() / 1000)),
          gasUsed: '0',
          gasLimit: '30000000',
          transactionCount: 0,
          miner: '0x0000000000000000000000000000000000000000'
        }]
      });
    }
    if (action === 'search') {
      return jsonResponse(res, 200, {
        success: true,
        result: { type: 'info', message: 'Explorer search requires a live RPC node. Connect a public RPC endpoint to enable full search.' }
      });
    }
    return jsonResponse(res, 400, { error: 'Unknown explorer action.' });
  }

  // Upstream RPC mode: query the real chain
  try {
    if (action === 'summary') {
      const [blockNumber, peerCount, gasPrice, latestBlock] = await Promise.all([
        rpcCall(config.rpcUrl, 'eth_blockNumber'),
        rpcCall(config.rpcUrl, 'net_peerCount'),
        rpcCall(config.rpcUrl, 'eth_gasPrice'),
        rpcCall(config.rpcUrl, 'eth_getBlockByNumber', ['latest', false])
      ]);

      return jsonResponse(res, 200, {
        success: true,
        network: {
          chainId: config.chainId,
          chainName: config.chainName,
          symbol: config.symbol,
          decimals: config.decimals,
          verifiedAt: verification.checkedAt,
          contracts: config.contracts
        },
        summary: {
          blockNumber: quantityToDecimal(blockNumber),
          peerCount: quantityToDecimal(peerCount),
          gasPriceWei: quantityToDecimal(gasPrice),
          latestBlock: compactBlock(latestBlock)
        }
      });
    }

    if (action === 'blocks') {
      const latest = await rpcCall(config.rpcUrl, 'eth_blockNumber');
      const count = Math.min(asPositiveInt(req.query.count, 8), MAX_BLOCKS);
      return jsonResponse(res, 200, { success: true, blocks: await listBlocks(config.rpcUrl, latest, count) });
    }

    if (action === 'search') {
      return jsonResponse(res, 200, { success: true, result: await search(config.rpcUrl, req.query.q, config) });
    }

    return jsonResponse(res, 400, { error: 'Unknown explorer action.' });
  } catch (error) {
    const status = Number.isInteger(error.statusCode) ? error.statusCode : 502;
    return jsonResponse(res, status, { error: error.statusCode ? error.message : 'Verified RPC query failed. Try again shortly.' });
  }
};
