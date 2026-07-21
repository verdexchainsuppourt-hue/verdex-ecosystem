/** Mainnet chain status endpoint. The legacy simulated chain has been removed. */
const { jsonResponse, setCORS, checkRateLimit } = require('../lib/api-lib');
const { verifyMainnetConfig, sendMainnetUnavailable } = require('../lib/mainnet');
const l1Facade = require('../lib/l1-facade');

module.exports = async (req, res) => {
  // `/api/l1?path=...` is rewritten here so the typed mobile facade shares
  // this serverless function on the Vercel Hobby plan. The helper remains
  // internal and cannot become a second public function route.
  if (req.query?.path) return l1Facade(req, res);
  setCORS(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return jsonResponse(res, 405, { error: 'GET only' });
  const ip = String(req.headers['x-vercel-forwarded-for'] || req.headers['x-forwarded-for'] || '')
    .split(',')[0].trim() || 'unknown';
  if (!checkRateLimit(`mainnet-chain:${ip}`, 60, 60_000).allowed) {
    return jsonResponse(res, 429, { success: false, error: 'Mainnet chain-status rate limit exceeded.' });
  }
  const verification = await verifyMainnetConfig();
  if (!verification.ready) return sendMainnetUnavailable(res, jsonResponse);
  const network = verification.config;
  return jsonResponse(res, 200, {
    success: true,
    data: {
      chainId: network.chainId,
      chainIdHex: network.chainIdHex,
      name: network.chainName,
      networkKey: network.networkKey,
      genesisHash: network.genesisHash,
      protocolVersion: network.protocolVersion,
      assetModel: network.assetModel,
      symbol: network.symbol,
      decimals: network.decimals,
      explorerUrl: network.explorerUrl,
      contracts: network.contracts,
      verifiedAt: verification.checkedAt
    }
  });
};
