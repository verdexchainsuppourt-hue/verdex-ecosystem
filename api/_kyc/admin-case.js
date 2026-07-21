const {
  setCORS,
  jsonResponse,
  handleError,
  verifyModerator,
  apiError,
  getTraceId,
  getIdempotencyKey,
  hashRequestBody,
  beginIdempotency,
  completeIdempotency,
  recordAudit,
  getSupabase,
  parseBody,
  requireAuthRate,
  getEvidenceForCase,
  EVIDENCE_BUCKET,
  EVIDENCE_URL_TTL_SEC,
  grantP2pOnApproval,
  rejectCase
} = require('./lib');

async function getCase(caseId) {
  const supabase = getSupabase();
  const { data, error } = await supabase.from('verdex_kyc_cases').select('*').eq('id', caseId).single();
  if (error || !data) return null;
  return data;
}

module.exports = async (req, res) => {
  setCORS(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const mod = await verifyModerator(req);
    if (!mod) return apiError(res, 403, 'FORBIDDEN', 'Moderator access required');
    if (!requireAuthRate(req, res, mod.id, 120, 60000)) return;

    const caseId = req.query.id || req.query.case_id;
    if (!caseId) return apiError(res, 400, 'CASE_ID_REQUIRED', 'case id is required');
    const traceId = getTraceId(req);
    const sub = req.query.sub || 'detail';

    if (req.method === 'GET' && sub === 'detail') {
      const kycCase = await getCase(caseId);
      if (!kycCase) return apiError(res, 404, 'CASE_NOT_FOUND', 'Case not found');
      const evidence = await getEvidenceForCase(caseId);
      const supabase = getSupabase();
      const { data: actions } = await supabase
        .from('verdex_kyc_review_actions')
        .select('id, action, from_status, to_status, document_confidence, face_match_confidence, liveness_confidence, reason_code, created_at, reviewer_user_id')
        .eq('case_id', caseId)
        .order('created_at', { ascending: true });
      const { data: aml } = await supabase
        .from('verdex_aml_screenings')
        .select('id, status, risk_score, match_confidence, reason_code, screened_at, expires_at, screening_purpose')
        .eq('kyc_case_id', caseId)
        .order('created_at', { ascending: false });

      return jsonResponse(res, 200, {
        case: {
          id: kycCase.id,
          subject_user_id: kycCase.subject_user_id,
          status: kycCase.status,
          country_code: kycCase.country_code,
          risk_tier: kycCase.risk_tier,
          verification_level: kycCase.verification_level,
          submitted_at: kycCase.submitted_at,
          review_started_at: kycCase.review_started_at,
          reviewed_at: kycCase.reviewed_at,
          reviewer_user_id: kycCase.reviewer_user_id,
          decision_reason_code: kycCase.decision_reason_code,
          expires_at: kycCase.expires_at,
          version: kycCase.version
        },
        evidence: evidence.map((e) => ({
          id: e.id,
          kind: e.evidence_kind,
          content_type: e.content_type,
          byte_size: e.byte_size,
          checksum_sha256: e.checksum_sha256,
          uploaded_at: e.uploaded_at,
          liveness_completed: !!(e.capture_metadata && e.capture_metadata.liveness_completed)
        })),
        review_actions: actions || [],
        aml_screenings: aml || [],
        trace_id: traceId
      });
    }

    if (req.method === 'POST' && sub === 'claim') {
      const kycCase = await getCase(caseId);
      if (!kycCase) return apiError(res, 404, 'CASE_NOT_FOUND', 'Case not found');
      if (!['submitted', 'in_review', 'needs_resubmission'].includes(kycCase.status)) {
        return apiError(res, 409, 'CASE_NOT_CLAIMABLE', 'Case is not in the review queue');
      }
      const supabase = getSupabase();
      const now = new Date().toISOString();
      await supabase
        .from('verdex_kyc_cases')
        .update({
          status: 'in_review',
          review_started_at: kycCase.review_started_at || now,
          reviewer_user_id: mod.id
        })
        .eq('id', caseId);
      await supabase.from('verdex_kyc_review_actions').insert({
        case_id: caseId,
        reviewer_user_id: mod.id,
        action: 'assigned',
        from_status: kycCase.status,
        to_status: 'in_review',
        reason_code: 'moderator_claim'
      });
      await recordAudit({
        actorUserId: mod.id,
        actorKind: 'staff',
        action: 'kyc.case.claimed',
        resourceType: 'verdex_kyc_cases',
        resourceId: caseId,
        subjectUserId: kycCase.subject_user_id,
        requestId: traceId,
        req
      });
      return jsonResponse(res, 200, { case_id: caseId, status: 'in_review', trace_id: traceId });
    }

    if (req.method === 'POST' && sub === 'evidence-url') {
      const body = parseBody(req);
      const evidenceId = body.evidence_id;
      if (!evidenceId) return apiError(res, 400, 'EVIDENCE_ID_REQUIRED', 'evidence_id required');
      const supabase = getSupabase();
      const { data: ev, error } = await supabase
        .from('verdex_kyc_evidence')
        .select('*')
        .eq('id', evidenceId)
        .eq('case_id', caseId)
        .single();
      if (error || !ev) return apiError(res, 404, 'EVIDENCE_NOT_FOUND', 'Evidence not found');

      let signedUrl = null;
      try {
        const { data: signed, error: sErr } = await supabase.storage
          .from(ev.storage_bucket || EVIDENCE_BUCKET)
          .createSignedUrl(ev.storage_object_key, EVIDENCE_URL_TTL_SEC);
        if (!sErr && signed) signedUrl = signed.signedUrl;
      } catch (_) {
        signedUrl = null;
      }

      await recordAudit({
        actorUserId: mod.id,
        actorKind: 'staff',
        action: 'kyc.evidence.url_issued',
        resourceType: 'verdex_kyc_evidence',
        resourceId: evidenceId,
        subjectUserId: ev.subject_user_id,
        requestId: traceId,
        req,
        metadata: { ttl_sec: EVIDENCE_URL_TTL_SEC, kind: ev.evidence_kind }
      });

      if (!signedUrl) {
        return apiError(res, 503, 'EVIDENCE_STORAGE_UNAVAILABLE', 'Private evidence storage is not configured yet.', {
          retryable: true
        });
      }

      return jsonResponse(res, 200, {
        url: signedUrl,
        expires_in_sec: EVIDENCE_URL_TTL_SEC,
        evidence_id: evidenceId,
        trace_id: traceId
      });
    }

    if (req.method === 'POST' && sub === 'decision') {
      const body = parseBody(req);
      const idemKey = getIdempotencyKey(req);
      const reqHash = hashRequestBody(body);
      const idem = await beginIdempotency(mod.id, 'kyc.admin.decision', idemKey, reqHash);
      if (idem.mode === 'conflict') {
        return apiError(res, 409, 'IDEMPOTENCY_KEY_REUSE', 'Idempotency key reused with different body');
      }
      if (idem.mode === 'replay') return jsonResponse(res, idem.status, idem.body);
      if (idem.mode === 'in_progress') {
        return apiError(res, 409, 'IDEMPOTENCY_IN_PROGRESS', 'Request already in progress', { retryable: true });
      }

      const decision = String(body.decision || '').toLowerCase();
      if (!['approve', 'reject', 'request_resubmission', 'aml_hold'].includes(decision)) {
        return apiError(res, 400, 'INVALID_DECISION', 'decision must be approve|reject|request_resubmission|aml_hold');
      }
      if (!body.reason_code || String(body.reason_code).length < 2) {
        return apiError(res, 400, 'REASON_REQUIRED', 'reason_code is required');
      }

      const doc = body.document_confidence != null ? Number(body.document_confidence) : null;
      const face = body.face_match_confidence != null ? Number(body.face_match_confidence) : null;
      const live = body.liveness_confidence != null ? Number(body.liveness_confidence) : null;
      for (const [label, val] of [
        ['document_confidence', doc],
        ['face_match_confidence', face],
        ['liveness_confidence', live]
      ]) {
        if (val != null && (val < 0 || val > 1)) {
          return apiError(res, 400, 'INVALID_SCORE', `${label} must be between 0 and 1`);
        }
      }

      const kycCase = await getCase(caseId);
      if (!kycCase) return apiError(res, 404, 'CASE_NOT_FOUND', 'Case not found');
      if (!['submitted', 'in_review', 'needs_resubmission'].includes(kycCase.status)) {
        return apiError(res, 409, 'CASE_NOT_DECIDABLE', 'Case is not awaiting a decision');
      }

      // Self-approval guard: cannot approve own subject account
      if (kycCase.subject_user_id === mod.id) {
        return apiError(res, 403, 'SELF_REVIEW_FORBIDDEN', 'You cannot decide your own KYC case');
      }

      const supabase = getSupabase();

      // DB trigger only allows approved/rejected from in_review — claim implicitly if needed
      if (kycCase.status === 'submitted' || kycCase.status === 'needs_resubmission') {
        await supabase
          .from('verdex_kyc_cases')
          .update({
            status: 'in_review',
            review_started_at: kycCase.review_started_at || new Date().toISOString(),
            reviewer_user_id: mod.id
          })
          .eq('id', caseId);
        kycCase.status = 'in_review';
      }

      const actionMap = {
        approve: 'approved',
        reject: 'rejected',
        request_resubmission: 'requested_resubmission',
        aml_hold: 'assigned'
      };

      await supabase.from('verdex_kyc_review_actions').insert({
        case_id: caseId,
        reviewer_user_id: mod.id,
        action: actionMap[decision],
        from_status: kycCase.status,
        to_status:
          decision === 'approve'
            ? 'approved'
            : decision === 'reject'
              ? 'rejected'
              : decision === 'request_resubmission'
                ? 'needs_resubmission'
                : 'in_review',
        document_confidence: doc,
        face_match_confidence: face,
        liveness_confidence: live,
        reason_code: body.reason_code,
        metadata: { notes_present: !!body.notes, aml_clear: body.aml_clear === true }
      });

      let payload;

      if (decision === 'approve') {
        if (body.aml_clear !== true) {
          return apiError(res, 400, 'AML_CLEAR_REQUIRED', 'Set aml_clear=true after completing AML checks.');
        }
        // High-risk dual control: if any score below threshold, require second_approver flag from different admin path
        const lowConfidence =
          (doc != null && doc < 0.9) || (face != null && face < 0.88) || (live != null && live < 0.92);
        if (lowConfidence && body.second_approval !== true) {
          return apiError(
            res,
            409,
            'SECOND_APPROVAL_REQUIRED',
            'Low confidence scores require second_approval=true from an independent reviewer workflow.'
          );
        }

        let amlId = null;
        const { data: amlRow } = await supabase
          .from('verdex_aml_screenings')
          .insert({
            subject_user_id: kycCase.subject_user_id,
            kyc_case_id: caseId,
            screening_purpose: 'onboarding',
            status: 'clear',
            provider_name: 'manual_internal',
            risk_score: body.aml_risk_score != null ? Number(body.aml_risk_score) : 0,
            reviewed_by: mod.id,
            screened_at: new Date().toISOString(),
            reviewed_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 365 * 86400000).toISOString(),
            reason_code: 'manual_clear'
          })
          .select('id')
          .single();
        amlId = amlRow && amlRow.id;

        await grantP2pOnApproval({
          userId: kycCase.subject_user_id,
          caseId,
          amlScreeningId: amlId,
          decidedBy: mod.id,
          req,
          traceId
        });

        payload = {
          case_id: caseId,
          status: 'approved',
          p2p_eligible: true,
          message: 'Case approved. P2P entitlement granted and confirmation email queued.',
          trace_id: traceId
        };
      } else if (decision === 'reject') {
        await rejectCase({
          caseId,
          userId: kycCase.subject_user_id,
          decidedBy: mod.id,
          reasonCode: body.reason_code,
          req,
          traceId
        });
        payload = { case_id: caseId, status: 'rejected', p2p_eligible: false, trace_id: traceId };
      } else if (decision === 'request_resubmission') {
        await supabase
          .from('verdex_kyc_cases')
          .update({
            status: 'needs_resubmission',
            decision_reason_code: body.reason_code,
            reviewer_user_id: mod.id
          })
          .eq('id', caseId);
        payload = { case_id: caseId, status: 'needs_resubmission', trace_id: traceId };
      } else {
        await supabase
          .from('verdex_aml_screenings')
          .insert({
            subject_user_id: kycCase.subject_user_id,
            kyc_case_id: caseId,
            screening_purpose: 'manual_review',
            status: 'review_required',
            provider_name: 'manual_internal',
            reviewed_by: mod.id,
            reason_code: body.reason_code,
            screened_at: new Date().toISOString()
          });
        const holdAt = new Date().toISOString();
        const { data: holdEnt } = await supabase
          .from('verdex_p2p_entitlements')
          .select('user_id')
          .eq('user_id', kycCase.subject_user_id)
          .maybeSingle();
        const holdRow = {
          user_id: kycCase.subject_user_id,
          state: 'suspended',
          kyc_case_id: caseId,
          decision_reason_code: 'aml_hold',
          decided_by: mod.id,
          decided_at: holdAt,
          suspended_at: holdAt
        };
        if (holdEnt) {
          await supabase
            .from('verdex_p2p_entitlements')
            .update(holdRow)
            .eq('user_id', kycCase.subject_user_id);
        } else {
          await supabase.from('verdex_p2p_entitlements').insert(holdRow);
        }
        payload = { case_id: caseId, status: 'in_review', aml: 'review_required', trace_id: traceId };
      }

      await completeIdempotency(mod.id, 'kyc.admin.decision', idemKey, 200, payload);
      return jsonResponse(res, 200, payload);
    }

    return apiError(res, 404, 'NOT_FOUND', 'Unknown admin case action');
  } catch (err) {
    return handleError(res, err, 'kyc/admin-case');
  }
};
