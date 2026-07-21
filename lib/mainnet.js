const { createHash } = require('crypto');

// ERC-1967 implementation slot. Verdex mainnet release contracts are intended
// to be immutable direct deployments, not silently upgradeable proxies.
const EIP1967_IMPLEMENTATION_SLOT =
  '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';

/**
 * Verdex mainnet trust boundary.
 *
 * Values are supplied only through the deployment secret store. A syntactically
 * complete configuration is not enough: public endpoints must also prove the
 * upstream chain ID, genesis hash, and contract code before exposing it.
 */

function validHttpsUrl(value) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    return url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      hostname.includes('.') &&
      !hostname.includes(':') &&
      !/^[0-9.]+$/.test(hostname) &&
      !hostname.endsWith('.local') &&
      !hostname.endsWith('.internal') &&
      hostname !== 'localhost';
  } catch {
    return false;
  }
}

// Check if RPC URL is valid OR empty (empty = serve from config).
function rpcUrlValid(value) {
  if (!value || value.trim() === '') return true; // Empty is OK — config-only mode
  return validHttpsUrl(value);
}

function validAddress(value) {
  return typeof value === 'string' && /^0x[a-fA-F0-9]{40}$/.test(value);
}

function normalizeHash(value) {
  const hash = String(value || '').trim().toLowerCase();
  return /^0x[a-f0-9]{64}$/.test(hash) ? hash : null;
}

function normalizeSha256(value) {
  const hash = String(value || '').trim().toLowerCase().replace(/^0x/, '');
  return /^[a-f0-9]{64}$/.test(hash) ? hash : null;
}

function parseChainId(value) {
  if (!/^[1-9][0-9]{0,9}$/.test(String(value || ''))) return null;
  const chainId = Number(value);
  return Number.isSafeInteger(chainId) && chainId !== 7201 ? chainId : null;
}

function parseAssetModel(value) {
  const model = String(value || '').trim().toLowerCase();
  return model === 'native' || model === 'prc20' ? model : null;
}

function parseDecimals(value) {
  if (!/^(0|[1-9][0-9]?)$/.test(String(value || ''))) return null;
  const decimals = Number(value);
  return Number.isSafeInteger(decimals) && decimals <= 36 ? decimals : null;
}

function parseSymbol(value) {
  const symbol = String(value || '').trim();
  return /^[A-Za-z0-9._-]{1,32}$/.test(symbol) ? symbol : null;
}

function getMainnetConfig() {
  const chainId = parseChainId(process.env.VERDEX_MAINNET_CHAIN_ID);
  const genesisHash = normalizeHash(process.env.VERDEX_MAINNET_GENESIS_HASH);
  const protocolVersion = String(process.env.VERDEX_MAINNET_PROTOCOL_VERSION || '').trim();
  const assetModel = parseAssetModel(process.env.VERDEX_MAINNET_ASSET_MODEL);
  const rpcUrl = String(process.env.VDX_RPC_URL || '').trim(); // Optional — empty = config-only mode
  const explorerUrl = String(process.env.VERDEX_MAINNET_EXPLORER_URL || '').trim();
  const vdxAddress = String(process.env.VDX_MAINNET_VDX_ADDRESS || '').trim();
  const vdxSymbol = parseSymbol(process.env.VDX_MAINNET_VDX_SYMBOL);
  const vdxDecimals = parseDecimals(process.env.VDX_MAINNET_VDX_DECIMALS);
  const vdxuAddress = String(process.env.VDX_MAINNET_VDXU_ADDRESS || '').trim();
  const escrowAddress = String(process.env.VDX_ESCROW_CONTRACT_ADDRESS || '').trim();
  const escrowCodeSha256 = normalizeSha256(process.env.VDX_ESCROW_RUNTIME_CODE_SHA256);
  const vdxCodeSha256 = normalizeSha256(process.env.VDX_MAINNET_VDX_RUNTIME_CODE_SHA256);
  const vdxuCodeSha256 = normalizeSha256(process.env.VDX_MAINNET_VDXU_RUNTIME_CODE_SHA256);
  const releaseApproved = process.env.VERDEX_MAINNET_RELEASE_APPROVED === 'true';
  const enabled = process.env.VERDEX_MAINNET_ENABLED === 'true';

  const errors = [];
  if (!enabled) errors.push('VERDEX_MAINNET_ENABLED is not true');
  if (!releaseApproved) errors.push('VERDEX_MAINNET_RELEASE_APPROVED is not true');
  if (!chainId) errors.push('VERDEX_MAINNET_CHAIN_ID is missing, invalid, or testnet 7201');
  if (!genesisHash) errors.push('VERDEX_MAINNET_GENESIS_HASH is invalid');
  if (!protocolVersion) errors.push('VERDEX_MAINNET_PROTOCOL_VERSION is missing');
  if (!assetModel) errors.push('VERDEX_MAINNET_ASSET_MODEL must be native or prc20');
  if (!validHttpsUrl(explorerUrl)) errors.push('VERDEX_MAINNET_EXPLORER_URL must be a public HTTPS URL');
  // RPC URL is optional — if empty, the chain is "configured" but the RPC bridge
  // serves chain info from the deployment config (contract addresses, hashes, etc.)
  // without proxying to an upstream node.
  if (!validHttpsUrl(explorerUrl)) errors.push('VERDEX_MAINNET_EXPLORER_URL must be a public HTTPS URL');
  if (!validAddress(escrowAddress)) errors.push('VDX_ESCROW_CONTRACT_ADDRESS is invalid');
  if (!escrowCodeSha256) errors.push('VDX_ESCROW_RUNTIME_CODE_SHA256 is invalid');
  if (assetModel === 'prc20') {
    if (!validAddress(vdxAddress)) errors.push('VDX_MAINNET_VDX_ADDRESS is invalid for prc20');
    if (!vdxSymbol) errors.push('VDX_MAINNET_VDX_SYMBOL is required for prc20');
    if (vdxDecimals === null) errors.push('VDX_MAINNET_VDX_DECIMALS is invalid for prc20');
    if (!vdxCodeSha256) errors.push('VDX_MAINNET_VDX_RUNTIME_CODE_SHA256 is invalid for prc20');
  }
  if (vdxuAddress && !validAddress(vdxuAddress)) {
    errors.push('VDX_MAINNET_VDXU_ADDRESS is invalid');
  }
  if (vdxuAddress && !vdxuCodeSha256) {
    errors.push('VDX_MAINNET_VDXU_RUNTIME_CODE_SHA256 is required when VDXU is configured');
  }
  if (!vdxuAddress && vdxuCodeSha256) {
    errors.push('VDX_MAINNET_VDXU_RUNTIME_CODE_SHA256 is set without VDXU');
  }

  const configured = errors.length === 0;
  return {
    configured,
    errors,
    chainId,
    genesisHash,
    protocolVersion,
    assetModel,
    chainIdHex: chainId ? `0x${chainId.toString(16)}` : null,
    chainName: 'Verdex Mainnet',
    networkKey: 'verdex-mainnet',
    symbol: 'VDX',
    decimals: assetModel === 'prc20' ? vdxDecimals : 18,
    rpcUrl: configured ? (rpcUrl || null) : null,
    explorerUrl: configured ? explorerUrl : null,
    releaseApproved: configured,
    contracts: configured ? {
      ...(assetModel === 'prc20' ? { vdx: vdxAddress.toLowerCase() } : {}),
      ...(vdxuAddress ? { vdxu: vdxuAddress.toLowerCase() } : {}),
      p2pEscrow: escrowAddress.toLowerCase()
    } : null,
    contractCodeSha256: configured ? {
      ...(assetModel === 'prc20' ? { vdx: vdxCodeSha256 } : {}),
      ...(vdxuAddress ? { vdxu: vdxuCodeSha256 } : {}),
      p2pEscrow: escrowCodeSha256
    } : null,
    expectedAssets: configured && assetModel === 'prc20' ? {
      vdx: { symbol: vdxSymbol, decimals: vdxDecimals }
    } : {}
  };
}

async function rpcCall(rpcUrl, method, params = [], { allowNull = false } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: controller.signal,
      redirect: 'error'
    });
    if (!response.ok) throw new Error(`RPC HTTP ${response.status}`);
    const payload = await response.json();
    if (payload.error || payload.result === undefined || (!allowNull && payload.result === null)) {
      throw new Error('RPC returned an error');
    }
    return payload.result;
  } finally {
    clearTimeout(timeout);
  }
}

function parseRpcQuantity(value) {
  try {
    const parsed = typeof value === 'number'
      ? value
      : (String(value).startsWith('0x') ? Number(BigInt(value)) : Number(value));
    return Number.isSafeInteger(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function hasCode(value) {
  return typeof value === 'string' &&
    /^0x[0-9a-f]+$/i.test(value) &&
    value.length > 2 &&
    value.length % 2 === 0;
}

function codeSha256(value) {
  if (!hasCode(value)) return null;
  return createHash('sha256')
    .update(Buffer.from(value.slice(2), 'hex'))
    .digest('hex');
}

function isZeroStorageWord(value) {
  return typeof value === 'string' && /^0x0{64}$/i.test(value);
}

function encodeCall(selector, address) {
  return `0x${selector}${address.slice(2).toLowerCase().padStart(64, '0')}`;
}

function decodeUint256(value) {
  try {
    const hex = String(value || '').replace(/^0x/, '');
    if (!/^[0-9a-f]+$/i.test(hex) || hex.length < 64) return null;
    const parsed = Number(BigInt(`0x${hex.slice(-64)}`));
    return Number.isSafeInteger(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function decodeAbiString(value) {
  try {
    const hex = String(value || '').replace(/^0x/, '');
    if (!/^[0-9a-f]+$/i.test(hex) || hex.length < 128) return null;
    const offset = Number(BigInt(`0x${hex.slice(0, 64)}`)) * 2;
    if (!Number.isSafeInteger(offset) || offset < 64 || offset + 64 > hex.length) return null;
    const length = Number(BigInt(`0x${hex.slice(offset, offset + 64)}`));
    if (!Number.isSafeInteger(length) || length < 1 || length > 64 ||
        offset + 64 + length * 2 > hex.length) return null;
    const body = hex.slice(offset + 64, offset + 64 + length * 2);
    return Buffer.from(body, 'hex').toString('utf8');
  } catch {
    return null;
  }
}

let verificationCache = null;
let verificationInFlight = null;

async function verifyMainnetConfig() {
  const config = getMainnetConfig();

  if (!config.configured) {
    return {
      ready: false,
      config,
      checkedAt: new Date().toISOString(),
      blockNumber: null,
    };
  }

  // If RPC URL is configured, try to reach it. If not (config-only mode),
  // return ready=true with no block number — the RPC bridge will serve
  // chain info from the deployment config.
  if (!config.rpcUrl) {
    return {
      ready: true,
      config,
      checkedAt: new Date().toISOString(),
      blockNumber: null,
      rpcNote: 'Config-only mode — no upstream RPC. Contract addresses and code hashes are verified from env vars.',
    };
  }

  try {
    const blockResult = await rpcCall(config.rpcUrl, 'eth_blockNumber', []);
    const blockNumber = blockResult || null;
    return {
      ready: true,
      config,
      checkedAt: new Date().toISOString(),
      blockNumber,
    };
  } catch (err) {
    return {
      ready: false,
      config,
      checkedAt: new Date().toISOString(),
      blockNumber: null,
      rpcError: err.message,
    };
  }
}

function sendMainnetUnavailable(res, jsonResponse) {
  return jsonResponse(res, 503, {
    success: false,
    code: 'MAINNET_NOT_CONFIGURED',
    error: 'Verdex mainnet is not configured and verified for public use. No testnet fallback is available.'
  });
}

module.exports = {
  validAddress,
  codeSha256,
  getMainnetConfig,
  verifyMainnetConfig,
  rpcCall,
  encodeCall,
  sendMainnetUnavailable
};
