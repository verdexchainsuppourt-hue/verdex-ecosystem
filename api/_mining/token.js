// /api/mining/token — generate a device API token for the CLI
// User must be authenticated via Supabase JWT. The CLI calls this via device auth flow.
const { verifyUser, getSupabase, jsonResponse, handleError, setCORS, logAudit, registerDevice, checkRateLimit } = require('../../lib/api-lib');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

module.exports = async (req, res) => {
  setCORS(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return jsonResponse(res, 405, { error: 'Method not allowed' });

  try {
    const user = await verifyUser(req);
    if (!user) return jsonResponse(res, 401, { error: 'Not authenticated' });

    // Rate limit: max 5 token generations per hour
    const rl = checkRateLimit(`token:${user.id}`, 5, 3600000);
    if (!rl.allowed) {
      return jsonResponse(res, 429, { error: 'Too many token requests. Try again later.' });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const deviceName = body.device_name || 'Unknown Device';
    const deviceFingerprint = body.device_fingerprint;
    const deviceOs = body.device_os;
    const deviceArch = body.device_arch;
    const cliVersion = body.cli_version;

    if (!deviceFingerprint) {
      return jsonResponse(res, 400, { error: 'Device fingerprint required' });
    }

    const supabase = getSupabase();

    // Register/verify the device
    const device = await registerDevice(deviceFingerprint, user.id, { os: deviceOs, arch: deviceArch });
    
    // Check if device is banned
    if (device?.is_banned) {
      await logAudit(user.id, 'token_generated', { success: false, error_message: 'Device banned', metadata: { reason: device.ban_reason } });
      return jsonResponse(res, 403, { error: 'This device has been banned.', reason: device.ban_reason });
    }

    // Check for existing active sessions on this device
    const { data: existingSessions } = await supabase
      .from('mining_sessions')
      .select('id')
      .eq('device_fingerprint', deviceFingerprint)
      .eq('status', 'active');
    
    // Terminate existing sessions on this device (1 active per device)
    if (existingSessions && existingSessions.length > 0) {
      await supabase
        .from('mining_sessions')
        .update({ status: 'terminated', ended_at: new Date().toISOString() })
        .eq('device_fingerprint', deviceFingerprint)
        .eq('status', 'active');
    }

    // Generate a secure random token
    const rawToken = 'vdxt_' + crypto.randomBytes(32).toString('hex');
    const tokenPrefix = rawToken.slice(0, 12);
    const tokenHash = await bcrypt.hash(rawToken, 12);
    const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1 year

    // Store the hashed token
    const { data: tokenRecord, error: tokenError } = await supabase
      .from('api_tokens')
      .insert({
        user_id: user.id,
        token_hash: tokenHash,
        token_prefix: tokenPrefix,
        name: deviceName,
        scope: ['mining'],
        expires_at: expiresAt.toISOString(),
        device_fingerprint: deviceFingerprint,
        device_name: deviceName,
        is_active: true
      })
      .select('id')
      .single();

    if (tokenError) throw tokenError;

    // Create a new mining session
    const { data: session, error: sessionError } = await supabase
      .from('mining_sessions')
      .insert({
        user_id: user.id,
        status: 'paused',
        device_fingerprint: deviceFingerprint,
        device_name: deviceName,
        device_os: deviceOs,
        device_arch: deviceArch,
        cli_version: cliVersion,
        api_token_id: tokenRecord.id,
        started_at: new Date().toISOString()
      })
      .select('id')
      .single();

    if (sessionError) throw sessionError;

    // Audit log
    await logAudit(user.id, 'token_generated', {
      resource_type: 'api_token',
      resource_id: tokenRecord.id,
      ip_address: req.headers['x-forwarded-for']?.split(',')[0],
      user_agent: req.headers['user-agent'],
      metadata: { device_name: deviceName, session_id: session.id }
    });

    // Return the raw token (only shown ONCE) + session ID
    return jsonResponse(res, 200, {
      success: true,
      token: rawToken,
      token_prefix: tokenPrefix,
      session_id: session.id,
      expires_at: expiresAt.toISOString()
    });
  } catch (err) {
    return handleError(res, err, 'mining/token');
  }
};
