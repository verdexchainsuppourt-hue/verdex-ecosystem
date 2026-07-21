const { jsonResponse, setCORS } = require('../lib/api-lib');
const { verifyMainnetConfig } = require('../lib/mainnet');

module.exports = async (req, res) => {
  setCORS(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return jsonResponse(res, 405, { error: 'GET only' });

  try {
    const verification = await verifyMainnetConfig();

    if (verification.ready) {
      const blockNum = verification.blockNumber
        ? (typeof verification.blockNumber === 'number'
            ? verification.blockNumber
            : parseInt(verification.blockNumber, 16))
        : 1; // Config-only mode: genesis block exists

      return jsonResponse(res, 200, {
        success: true,
        data: {
          height: blockNum,
          totalTransactions: null,
          tps: null,
          live: true,
          chainId: verification.config.chainId,
          contracts: verification.config.contracts,
        }
      });
    }

    return jsonResponse(res, 200, {
      success: true,
      data: {
        height: 0,
        totalTransactions: 0,
        tps: 0,
        live: false,
        message: 'Mainnet pending launch. Chain stats will appear here after verification.'
      }
    });
  } catch (err) {
    return jsonResponse(res, 200, {
      success: true,
      data: {
        height: 0,
        totalTransactions: 0,
        tps: 0,
        live: false,
        error: 'Stats temporarily unavailable'
      }
    });
  }
};
