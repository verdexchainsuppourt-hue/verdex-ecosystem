const {
  setCORS,
  jsonResponse,
  handleError,
  verifyUser,
  apiError,
  getTraceId,
  ALLOWED_COUNTRIES,
  KYC_POLICY_VERSION,
  KYC_CONSENT_VERSION,
  requireAuthRate
} = require('./lib');

module.exports = async (req, res) => {
  setCORS(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return apiError(res, 405, 'METHOD_NOT_ALLOWED', 'GET only');

  try {
    const user = await verifyUser(req);
    if (!user) return apiError(res, 401, 'UNAUTHORIZED', 'Authentication required');
    if (!requireAuthRate(req, res, user.id, 120, 60000)) return;

    return jsonResponse(res, 200, {
      policy_version: KYC_POLICY_VERSION,
      consent_version: KYC_CONSENT_VERSION,
      network: 'mainnet',
      asset: 'VDX',
      minimum_age_default: 18,
      countries: ALLOWED_COUNTRIES,
      evidence: {
        max_bytes: 25 * 1024 * 1024,
        content_types: ['image/jpeg', 'image/png', 'image/webp', 'video/mp4'],
        gallery_import: false,
        liveness: 'active_challenge_required'
      },
      terms: {
        privacy_path: '/privacy',
        kyc_terms_path: '/legal/kyc',
        data_retention_summary: 'Evidence is retained only as required by applicable law and Verdex policy, then deleted or cryptographically erased.'
      },
      trace_id: getTraceId(req)
    });
  } catch (err) {
    return handleError(res, err, 'kyc/config');
  }
};
