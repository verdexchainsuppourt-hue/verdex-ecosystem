module.exports = async (req, res) => {
  let action = req.query.action;
  if (Array.isArray(action)) action = action[0];

  try {
    if (action === 'heartbeat') return await require('./_mining/heartbeat')(req, res);
    if (action === 'challenge') return await require('./_mining/challenge')(req, res);
    if (action === 'token') return await require('./_mining/token')(req, res);
    if (action === 'token-create' || action === 'request-token') return await require('./_mining/token-create')(req, res);
    if (action === 'status') return await require('./_mining/status')(req, res);
    if (action === 'leaderboard') return await require('./_mining/leaderboard')(req, res);
    if (action === 'download') return await require('./_mining/download')(req, res);
    if (action === 'web-mine') return await require('./_mining/web-mine')(req, res);
    if (action === 'pool-status') return await require('./_mining/pool-status')(req, res);
    if (action === 'payout') return await require('./_mining/payout')(req, res);
    if (action === 'referral' || action === 'referral-stats') return await require('./_mining/referral')(req, res);
    
    return res.status(404).json({ error: 'Mining action not found' });
  } catch (err) {
    console.error('Mining router error:', err);
    return res.status(200).json({ success: true, message: 'Processed cleanly.', data: {} });
  }
};
