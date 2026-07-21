const {
  setCORS,
  jsonResponse,
  handleError,
  verifyModerator,
  apiError,
  getTraceId,
  getSupabase,
  requireAuthRate,
  REVIEW_QUEUE_STATUSES
} = require('./lib');

module.exports = async (req, res) => {
  setCORS(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return apiError(res, 405, 'METHOD_NOT_ALLOWED', 'GET only');

  try {
    const mod = await verifyModerator(req);
    if (!mod) return apiError(res, 403, 'FORBIDDEN', 'Moderator access required');
    if (!requireAuthRate(req, res, mod.id, 120, 60000)) return;

    const supabase = getSupabase();
    const status = req.query.status;
    const statuses = status ? [status] : REVIEW_QUEUE_STATUSES;
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
    const offset = parseInt(req.query.offset, 10) || 0;

    let query = supabase
      .from('verdex_kyc_cases')
      .select(
        'id, subject_user_id, status, country_code, verification_level, risk_tier, submitted_at, review_started_at, created_at, updated_at, version',
        { count: 'exact' }
      )
      .in('status', statuses)
      .order('submitted_at', { ascending: true, nullsFirst: false })
      .range(offset, offset + limit - 1);

    if (req.query.country) query = query.eq('country_code', String(req.query.country).toUpperCase());

    const { data, count, error } = await query;
    if (error) throw error;

    // Attach latest review scores if any
    const caseIds = (data || []).map((c) => c.id);
    let scoresByCase = {};
    if (caseIds.length) {
      const { data: actions } = await supabase
        .from('verdex_kyc_review_actions')
        .select('case_id, document_confidence, face_match_confidence, liveness_confidence, created_at, action')
        .in('case_id', caseIds)
        .order('created_at', { ascending: false });
      for (const a of actions || []) {
        if (!scoresByCase[a.case_id]) scoresByCase[a.case_id] = a;
      }
    }

    const items = (data || []).map((c) => {
      const s = scoresByCase[c.id] || {};
      const submittedAt = c.submitted_at ? new Date(c.submitted_at).getTime() : null;
      const slaMinutes = submittedAt ? Math.floor((Date.now() - submittedAt) / 60000) : null;
      return {
        case_id: c.id,
        subject_user_id: c.subject_user_id,
        status: c.status,
        country_code: c.country_code,
        risk_tier: c.risk_tier,
        verification_level: c.verification_level,
        submitted_at: c.submitted_at,
        sla_minutes: slaMinutes,
        scores: {
          document: s.document_confidence != null ? Number(s.document_confidence) : null,
          face_match: s.face_match_confidence != null ? Number(s.face_match_confidence) : null,
          liveness: s.liveness_confidence != null ? Number(s.liveness_confidence) : null
        },
        version: c.version
      };
    });

    return jsonResponse(res, 200, {
      items,
      total: count || items.length,
      offset,
      limit,
      trace_id: getTraceId(req)
    });
  } catch (err) {
    return handleError(res, err, 'kyc/admin-queue');
  }
};
