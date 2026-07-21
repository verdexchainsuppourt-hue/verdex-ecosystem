/** Website mining is intentionally unavailable. Verdex rewards are APK-only. */
const { jsonResponse, setCORS } = require('../../lib/api-lib');

module.exports = async (req, res) => {
  setCORS(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  return jsonResponse(res, 410, {
    success: false,
    code: 'WEB_MINING_DISABLED',
    error: 'Website mining is disabled. Mining rewards are available only through the approved Android application after mainnet reward infrastructure is enabled.'
  });
};
