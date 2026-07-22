/**
 * Verdex KYC/AML API router (mounted under /api/auth?ns=kyc to stay within Hobby function limits)
 */
const { setCORS, jsonResponse, verifyUser } = require('./lib');

module.exports = async (req, res) => {
  setCORS(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const action = req.query.action || 'me';
  try {
    if (action === 'config') return await require('./config')(req, res);
    if (action === 'countries') return await require('./config')(req, res);
    if (action === 'me' || action === 'status') return await require('./me')(req, res);
    if (action === 'cases') return await require('./cases')(req, res);
    if (action === 'profile') return await require('./profile')(req, res);
    if (action === 'uploads') return await require('./uploads')(req, res);
    if (action === 'submit') return await require('./submit')(req, res);
    if (action === 'admin-queue' || action === 'queue') return await require('./admin-queue')(req, res);
    if (action === 'admin-case') return await require('./admin-case')(req, res);
    if (action === 'review') return await require('./admin-case')(req, res);
    if (action === 'outbox') return await require('./outbox-worker')(req, res);

    // Prefill — return user's existing profile data for KYC form pre-population
    if (action === 'prefill') {
      const user = await verifyUser(req);
      if (!user) return jsonResponse(res, 401, { error: 'Authentication required' });
      return jsonResponse(res, 200, {
        success: true,
        data: {
          full_name: user.user_metadata?.full_name || '',
          email: user.email || '',
          country_code: user.user_metadata?.country_code || 'PK',
          date_of_birth: user.user_metadata?.date_of_birth || '',
          id_type: 'national_id'
        }
      });
    }

    // Liveness challenge — return a simple challenge for selfie verification
    if (action === 'liveness-challenge') {
      const user = await verifyUser(req);
      if (!user) return jsonResponse(res, 401, { error: 'Authentication required' });
      const gestures = ['smile', 'blink', 'turn_left', 'turn_right', 'nod'];
      const gesture = gestures[Math.floor(Math.random() * gestures.length)];
      return jsonResponse(res, 200, {
        success: true,
        data: {
          challenge_id: `liveness_${Date.now()}`,
          gesture: gesture,
          instruction: `Please ${gesture.replace('_', ' ')} for the camera`,
          expires_in: 120
        }
      });
    }

    return res.status(404).json({
      error: { code: 'KYC_ACTION_NOT_FOUND', message: `Unknown KYC action: ${action}` }
    });
  } catch (err) {
    console.error('KYC router error:', err);
    return jsonResponse(res, 500, {
      success: false,
      status: 'unverified',
      kyc_status: 'unverified',
      p2p_eligible: false,
      error: { code: 'KYC_ROUTER_ERROR', message: err.message || 'Internal KYC service error' }
    });
  }
};
