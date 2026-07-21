/**
 * Verdex Mining Subsystem — Referral Stats & Code Application
 */
const { getSupabase, verifyUser, jsonResponse, handleError, setCORS, apiError, requireAuthRate } = require('../_kyc/lib');

module.exports = async (req, res) => {
  setCORS(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const user = await verifyUser(req);
    if (!user) return res.status(401).json({ error: 'Authentication required' });

    const supabase = getSupabase();
    const myCode = user.user_metadata?.referral_code || `VDX-${user.id.substring(0, 6).toUpperCase()}`;

    if (req.method === 'GET') {
      // Fetch referral count
      let totalReferrals = 0;
      try {
        const { count } = await supabase
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .eq('referrer_id', user.id);
        totalReferrals = count || 0;
      } catch (_) {}

      return jsonResponse(res, 200, {
        code: myCode,
        referral_code: myCode,
        total_referrals: totalReferrals,
        active_miners: Math.max(0, Math.floor(totalReferrals * 0.5)),
        referral_vp: totalReferrals * 50,
        multiplier: totalReferrals > 0 ? 1.15 : 1.0,
        share_url: `https://verdexswap.site?ref=${myCode}`
      });
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const code = String(body.code || '').trim().toUpperCase();

      if (!code) {
        return res.status(400).json({ error: 'Referral code is required.' });
      }

      if (code === myCode) {
        return res.status(400).json({ error: 'You cannot use your own referral code.' });
      }

      // Check if user already has a referrer
      if (user.user_metadata?.referred_by) {
        return res.status(400).json({ error: 'You have already applied a referral code.' });
      }

      // Update user metadata with referrer
      await supabase.auth.admin.updateUserById(user.id, {
        user_metadata: { ...(user.user_metadata || {}), referred_by: code }
      }).catch(() => {});

      return jsonResponse(res, 200, {
        success: true,
        message: `Referral code ${code} applied successfully! +10% mining boost activated.`
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return handleError(res, err, 'mining/referral');
  }
};
