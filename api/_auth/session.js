/**
 * GET /api/auth?action=session
 *
 * Returns current authenticated user info with session metadata:
 *  - User profile (id, email, name, avatar)
 *  - Session age + expiry
 *  - KYC status (without sensitive data)
 *  - Custodial wallet status
 *  - Account security flags (2FA eligible, verified)
 */
const { verifyUser, getSupabase, jsonResponse, handleError, setCORS } = require('../../lib/api-lib');

module.exports = async (req, res) => {
  setCORS(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return jsonResponse(res, 405, { error: 'Method not allowed' });

  try {
    const user = await verifyUser(req);
    if (!user) return jsonResponse(res, 401, { error: 'Not authenticated', authenticated: false });

    const supabase = getSupabase();

    // Fetch KYC status (non-sensitive fields only).
    let kycStatus = 'not_started';
    try {
      const { data: kyc } = await supabase
        .from('verdex_kyc_cases')
        .select('status, expires_at')
        .eq('subject_user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (kyc) {
        kycStatus = kyc.expires_at && new Date(kyc.expires_at) < new Date() ? 'expired' : kyc.status;
      }
    } catch (_) {}

    // Fetch custodial wallet status.
    let hasCustodialWallet = false;
    try {
      const { data: wallet } = await supabase
        .from('verdex_custodial_wallets')
        .select('id, status')
        .eq('user_id', user.id)
        .maybeSingle();
      hasCustodialWallet = !!wallet;
    } catch (_) {}

    // Compute session metadata.
    const issuedAt = user.user_metadata?.verification_code_at
      ? null
      : (user.last_sign_in_at || user.created_at);
    const sessionAgeMs = issuedAt ? Date.now() - new Date(issuedAt).getTime() : null;
    const sessionMaxMs = 90 * 24 * 60 * 60 * 1000; // 90 days
    const sessionExpiresAt = issuedAt
      ? new Date(new Date(issuedAt).getTime() + sessionMaxMs).toISOString()
      : null;

    // Check if email is verified.
    const emailVerified = !!user.email_confirmed_at || user.user_metadata?.is_verified === true;

    return jsonResponse(res, 200, {
      authenticated: true,
      user: {
        id: user.id,
        email: user.email,
        full_name: user.user_metadata?.full_name || user.user_metadata?.username || null,
        avatar_url: user.user_metadata?.avatar_url || null,
        username: user.user_metadata?.username || null,
        email_verified: emailVerified,
        created_at: user.created_at,
        last_sign_in_at: user.last_sign_in_at,
      },
      session: {
        issued_at: issuedAt,
        expires_at: sessionExpiresAt,
        age_days: sessionAgeMs ? Math.floor(sessionAgeMs / (24 * 60 * 60 * 1000)) : null,
        max_days: 90,
        expired: sessionAgeMs ? sessionAgeMs > sessionMaxMs : false,
      },
      kyc: {
        status: kycStatus,
      },
      wallet: {
        has_custodial: hasCustodialWallet,
      },
      security: {
        two_factor_enabled: false, // Future: implement 2FA
        email_verified: emailVerified,
        session_active: true,
      },
    });
  } catch (err) {
    return handleError(res, err, 'auth/session');
  }
};
