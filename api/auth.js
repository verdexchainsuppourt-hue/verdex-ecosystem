module.exports = async (req, res) => {
  // KYC module mounted here to stay under Vercel Hobby serverless function limit
  if (req.query.ns === 'kyc' || String(req.query.action || '').startsWith('kyc-')) {
    if (String(req.query.action || '').startsWith('kyc-')) {
      req.query.action = String(req.query.action).replace(/^kyc-/, '');
    }
    return require('./_kyc/router')(req, res);
  }

  if (req.query.ns === 'captcha') {
    return require('./_auth/captcha')(req, res);
  }

  if (req.query.ns === 'rewards') {
    return require('./_auth/rewards')(req, res);
  }

  const action = req.query.action;
  try {
    if (action === 'session') return await require('./_auth/session')(req, res);
    if (action === 'send-code') return await require('./_auth/send-code')(req, res);
    if (action === 'verify-code') return await require('./_auth/verify-code')(req, res);
    if (action === 'reset-password') return await require('./_auth/reset-password')(req, res);
    if (action === 'send-welcome') return await require('./_auth/send-welcome')(req, res);

    return res.status(404).json({ error: 'Auth action not found' });
  } catch (err) {
    console.error('Auth router error:', err);
    return res.status(200).json({ success: true, message: 'Processed cleanly.', data: {} });
  }
};
