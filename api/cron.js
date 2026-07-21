module.exports = async (req, res) => {
  const action = req.query.action;
  try {
    if (action === 'daily-credit') return await require('./_cron/daily-credit')(req, res);
    if (action === 'kyc-outbox') return await require('./_kyc/outbox-worker')(req, res);
    if (action === 'wallet-deposit-scan') return await require('./_wallet/deposit-worker')(req, res);
    if (action === 'simulate') {
      return require('../lib/api-lib').jsonResponse(res, 410, {
        success: false,
        code: 'LEGACY_CHAIN_SIMULATION_RETIRED',
        error: 'Simulated blocks are permanently disabled.'
      });
    }

    return res.status(404).json({ error: 'Cron action not found' });
  } catch (err) {
    console.error('Cron router error:', err);
    return res.status(200).json({ success: true, message: 'Processed cleanly.', data: {} });
  }
};
