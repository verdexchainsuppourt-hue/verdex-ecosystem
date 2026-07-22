const {
  setCORS,
  jsonResponse,
  verifyUser,
  apiError,
  getTraceId,
  getSupabase
} = require('./lib');

module.exports = async (req, res) => {
  setCORS(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return apiError(res, 405, 'METHOD_NOT_ALLOWED', 'GET only');

  try {
    const user = await verifyUser(req);
    if (!user) return apiError(res, 401, 'UNAUTHORIZED', 'Authentication required');

    const supabase = getSupabase();

    // Check user's latest KYC case from DB
    let kycCase = null;
    try {
      const { data, error } = await supabase
        .from('verdex_kyc_cases')
        .select('*')
        .eq('subject_user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) {
        console.error('Database error in KYC check:', error);
      } else {
        kycCase = data;
      }
    } catch (e) {
      console.error('Error fetching KYC case:', e);
    }

    // Check user's profile KYC status
    let profile = null;
    try {
      const { data } = await supabase
        .from('profiles')
        .select('kyc_status, kyc_tier')
        .eq('id', user.id)
        .maybeSingle();
      profile = data;
    } catch (_) {}

    // Compute REAL status from DB records
    let rawStatus = kycCase?.status || profile?.kyc_status || 'unverified';
    if (!rawStatus || rawStatus === 'none' || rawStatus === 'unsubmitted') {
      rawStatus = 'unverified';
    }

    const isApproved = rawStatus === 'approved';
    const isPending = rawStatus === 'pending_review' || rawStatus === 'submitted' || rawStatus === 'in_review';
    const isRejected = rawStatus === 'rejected';

    const kycStatus = isApproved ? 'approved' : (isPending ? 'pending_review' : (isRejected ? 'rejected' : 'unverified'));
    const tier = isApproved ? 2 : 0;
    const p2pUnlocked = isApproved;
    const p2pEligible = isApproved;

    // Use DB expires_at or calculate 24h fallback from submitted_at / created_at
    const submittedTime = kycCase?.submitted_at || kycCase?.created_at || new Date().toISOString();
    const reviewDeadline = kycCase?.expires_at || new Date(new Date(submittedTime).getTime() + 24 * 60 * 60 * 1000).toISOString();

    return jsonResponse(res, 200, {
      success: true,
      data: {
        status: kycStatus,
        kyc_status: kycStatus,
        kycStatus: kycStatus,
        verification_level: isApproved ? 'tier2_p2p' : 'none',
        p2p_unlocked: p2pUnlocked,
        p2p_eligible: p2pEligible,
        is_poster: isApproved,
        tier: tier,
        case_id: kycCase?.id || null,
        submitted_at: submittedTime,
        review_deadline: reviewDeadline
      },
      status: kycStatus,
      kyc_status: kycStatus,
      p2p_eligible: p2pEligible,
      tier: tier,
      email_hint: user.email ? user.email.replace(/(.{2}).+(@.+)/, '$1***$2') : null,
      trace_id: getTraceId(req)
    });
  } catch (err) {
    console.error('KYC /me endpoint error:', err);
    return jsonResponse(res, 200, {
      success: true,
      data: {
        status: 'unverified',
        kyc_status: 'unverified',
        p2p_unlocked: false,
        p2p_eligible: false,
        tier: 0
      },
      status: 'unverified',
      kyc_status: 'unverified',
      p2p_eligible: false,
      tier: 0
    });
  }
};
