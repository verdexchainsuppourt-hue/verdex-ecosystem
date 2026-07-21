const { getSupabase, setCORS, verifyUser, handleError, jsonResponse } = require('../../lib/api-lib');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { setCORS(res); return res.status(200).end(); }
  if (req.method !== 'POST') { return jsonResponse(res, 405, { success: false, error: 'Method not allowed' }); }

  try {
    const user = await verifyUser(req);
    if (!user) { return jsonResponse(res, 401, { success: false, error: 'Unauthorized' }); }

    const rawToken = 'vdxt_' + crypto.randomBytes(32).toString('hex');
    const tokenPrefix = rawToken.slice(0, 12);
    const tokenHash = await bcrypt.hash(rawToken, 12);

    const now = new Date().toISOString();
    const supabase = getSupabase();

    const { error } = await supabase.from('api_tokens').insert({
      user_id: user.id,
      name: req.body.name || 'CLI Miner Device',
      token_hash: tokenHash,
      token_prefix: tokenPrefix,
      scope: ['mining'],
      is_active: true,
      created_at: now,
      expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      device_name: req.body.device_name || null,
    });

    if (error) { return jsonResponse(res, 500, { success: false, error: error.message }); }

    return jsonResponse(res, 200, {
      success: true,
      token: rawToken,
      token_prefix: tokenPrefix,
    });
  } catch (err) {
    return handleError(res, err);
  }
};
