/** GET /api/network — public, fail-closed Verdex mainnet discovery. */
const { jsonResponse, setCORS, checkRateLimit } = require('../lib/api-lib');
const { verifyMainnetConfig } = require('../lib/mainnet');

function publicRpcUrl() {
  const siteUrl = String(process.env.SITE_URL || 'https://verdexswap.site')
    .replace(/\/$/, '');
  return `${siteUrl}/api/rpc`;
}

module.exports = async (req, res) => {
  setCORS(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return jsonResponse(res, 405, { error: 'GET only' });
  const ip = String(req.headers['x-vercel-forwarded-for'] || req.headers['x-forwarded-for'] || '')
    .split(',')[0].trim() || 'unknown';
  if (!checkRateLimit(`mainnet-network:${ip}`, 60, 60_000).allowed) {
    return jsonResponse(res, 429, { success: false, error: 'Mainnet discovery rate limit exceeded.' });
  }

  let verification = await verifyMainnetConfig();
  // No fake fallback — if mainnet is not verified, return honest "not ready" status.
  const network = verification.config;
  return jsonResponse(res, 200, {
    success: true,
    brand: 'Verdex',
    network: verification.ready ? {
      chainId: network.chainId,
      chainIdHex: network.chainIdHex,
      chainName: network.chainName,
      networkKey: network.networkKey,
      genesisHash: network.genesisHash,
      protocolVersion: network.protocolVersion,
      assetModel: network.assetModel,
      symbol: network.symbol,
      decimals: network.decimals,
      // This is the constrained same-origin bridge, never the private upstream
      // RPC endpoint stored in Vercel configuration.
      rpcUrl: publicRpcUrl(),
      explorerUrl: network.explorerUrl,
      contracts: network.contracts,
      verifiedAt: verification.checkedAt
    } : {
      chainName: 'Verdex Mainnet',
      networkKey: 'verdex-mainnet',
      symbol: 'VDX',
      decimals: 18,
      status: 'not_ready'
    },
    productStatus: {
      websiteMining: 'apps_live_rewards_server_enforced',
      testnet: 'removed',
      mainnet: verification.ready ? 'verified' : 'product_live_chain_pending',
      p2p: 'marketplace_api_live_escrow_gated_until_contract_verify',
      kyc: 'schema_and_api_live',
      explorer: 'live_read_only_facade',
      proposedChainId: 72010,
      registry: '/public-network.json'
    },
    apps: {
      android: { version: '1.15.1-build65.apk' },
      windows: { version: '4.0.2', url: '/updates/Verdex-Miner-Setup-4.0.2.exe' }
    },
    links: {
      p2p: '/p2p',
      explorer: '/explorer',
      dashboard: '/dashboard',
      kycModeration: '/kyc-moderation',
      updates: '/updates/version.json'
    },
    ...(verification.ready ? {} : { code: 'MAINNET_NOT_READY', message: 'Product surface is live. On-chain RPC/contracts await release verification.' })
  });
};
