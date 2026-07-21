const {
  setCORS,
  jsonResponse,
  handleError,
  verifyUser,
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
  normalizeDocumentType,
  requiredEvidenceKinds,
  enqueueNotification
} = require('./lib');

module.exports = async (req, res) => {
  setCORS(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return apiError(res, 405, 'METHOD_NOT_ALLOWED', 'POST only');

  try {
    const user = await verifyUser(req);
    if (!user) return apiError(res, 401, 'UNAUTHORIZED', 'Authentication required');
    if (!requireAuthRate(req, res, user.id, 20, 60000)) return;

    const caseId = req.query.id || req.query.case_id;
    if (!caseId) return apiError(res, 400, 'CASE_ID_REQUIRED', 'case id is required');

    const body = parseBody(req);
    const traceId = getTraceId(req);
    const idemKey = getIdempotencyKey(req);
    const reqHash = hashRequestBody(body);
    const idem = await beginIdempotency(user.id, 'kyc.submit', idemKey, reqHash);
    if (idem.mode === 'conflict') {
      return apiError(res, 409, 'IDEMPOTENCY_KEY_REUSE', 'Idempotency key reused with different body');
    }
    if (idem.mode === 'replay') return jsonResponse(res, idem.status, idem.body);
    if (idem.mode === 'in_progress') {
      return apiError(res, 409, 'IDEMPOTENCY_IN_PROGRESS', 'Request already in progress', { retryable: true });
    }

    const supabase = getSupabase();
    const { data: kycCase, error } = await supabase
      .from('verdex_kyc_cases')
      .select('*')
      .eq('id', caseId)
      .eq('subject_user_id', user.id)
      .single();
    if (error || !kycCase) return apiError(res, 404, 'CASE_NOT_FOUND', 'KYC case not found');
    if (!['draft', 'collecting', 'needs_resubmission'].includes(kycCase.status)) {
      return apiError(res, 409, 'CASE_NOT_SUBMITTABLE', 'Case cannot be submitted in current state');
    }

    const evidence = await getEvidenceForCase(caseId);
    // Infer document type from evidence presence
    const hasBack = evidence.some((e) => e.evidence_kind === 'identity_document_back');
    const hasFront = evidence.some((e) => e.evidence_kind === 'identity_document_front');
    const hasSelfie = evidence.some((e) => e.evidence_kind === 'selfie_image');
    if (!hasFront || !hasSelfie) {
      return apiError(res, 400, 'EVIDENCE_INCOMPLETE', 'Document front and live selfie are required.');
    }

    const docType = normalizeDocumentType(body.document_type) || (hasBack ? 'national_id' : 'passport');
    const missing = requiredEvidenceKinds(docType).filter(
      (k) => !evidence.some((e) => e.evidence_kind === k)
    );
    if (missing.length) {
      return apiError(res, 400, 'EVIDENCE_INCOMPLETE', 'Missing required evidence.', {
        fields: { missing }
      });
    }

    const selfie = evidence.find((e) => e.evidence_kind === 'selfie_image');
    if (selfie && selfie.capture_metadata && selfie.capture_metadata.liveness_completed !== true) {
      return apiError(res, 400, 'LIVENESS_REQUIRED', 'Live selfie challenge was not completed.');
    }

    const now = new Date().toISOString();
    const { error: updErr } = await supabase
      .from('verdex_kyc_cases')
      .update({
        status: 'submitted',
        submitted_at: now
      })
      .eq('id', caseId)
      .eq('subject_user_id', user.id);
    if (updErr) throw updErr;

    // Start AML screening row (manual internal)
    await supabase.from('verdex_aml_screenings').insert({
      subject_user_id: user.id,
      kyc_case_id: caseId,
      screening_purpose: 'onboarding',
      status: 'pending',
      provider_name: 'manual_internal'
    });

    await enqueueNotification({
      recipientUserId: user.id,
      channel: 'in_app',
      templateKey: 'kyc-submitted-v1',
      dedupeKey: `kyc-submitted:${caseId}`,
      payload: { case_id: caseId }
    });

    await recordAudit({
      actorUserId: user.id,
      actorKind: 'user',
      action: 'kyc.case.submitted',
      resourceType: 'verdex_kyc_cases',
      resourceId: caseId,
      subjectUserId: user.id,
      requestId: traceId,
      req,
      metadata: { evidence_count: evidence.length, document_type: docType }
    });

    // Run AI verification pipeline — compute confidence scores.
    try {
      const aiVerify = require('./ai-verify');
      const docFront = evidence.find(e => e.evidence_kind === 'identity_document_front');
      const selfie = evidence.find(e => e.evidence_kind === 'selfie_image');
      const docMeta = docFront?.capture_metadata || {};
      const selfieMeta = selfie?.capture_metadata || {};

      // Fetch device fingerprint for fraud check.
      let deviceFp = null;
      try {
        const { data: dev } = await supabase
          .from('device_fingerprints')
          .select('user_count, is_banned')
          .contains('known_user_ids', [user.id])
          .limit(1)
          .maybeSingle();
        if (dev) deviceFp = dev;
      } catch (_) {}

      // Fetch prior KYC history.
      let priorCases = [];
      try {
        const { data: prior } = await supabase
          .from('verdex_kyc_cases')
          .select('status')
          .eq('subject_user_id', user.id)
          .neq('id', caseId);
        priorCases = prior || [];
      } catch (_) {}

      const aiResult = aiVerify.generateVerificationPackage({
        documentMetadata: docMeta,
        selfieMetadata: selfieMeta,
        evidence,
        userMetadata: {},
        deviceFingerprint: deviceFp,
        caseHistory: priorCases,
      });

      // Store AI scores in the review_actions table as a preliminary assessment.
      await supabase.from('verdex_kyc_review_actions').insert({
        case_id: caseId,
        reviewer_user_id: null, // AI-generated, no human reviewer yet
        action: 'ai_assessment',
        from_status: 'collecting',
        to_status: 'submitted',
        document_confidence: aiResult.breakdown.document_quality.score / 100,
        face_match_confidence: aiResult.breakdown.face_match.score / 100,
        liveness_confidence: aiResult.breakdown.liveness.score / 100,
        reason_code: aiResult.recommendation,
        metadata: {
          overall_score: aiResult.overallScore,
          recommendation: aiResult.recommendation,
          fraud_indicators: aiResult.breakdown.fraud_check.indicators,
          fraud_risk_level: aiResult.breakdown.fraud_check.riskLevel,
          fraud_risk_score: aiResult.breakdown.fraud_check.riskScore,
          factors: {
            document_quality: aiResult.breakdown.document_quality.factors,
            face_match: aiResult.breakdown.face_match.factors,
            liveness: aiResult.breakdown.liveness.factors,
          },
          ai_timestamp: aiResult.timestamp,
        },
      });

      // Also update the case risk_tier based on AI fraud assessment.
      if (aiResult.breakdown.fraud_check.riskLevel === 'high') {
        await supabase.from('verdex_kyc_cases')
          .update({ risk_tier: 'high' })
          .eq('id', caseId);
      } else if (aiResult.breakdown.fraud_check.riskLevel === 'medium') {
        await supabase.from('verdex_kyc_cases')
          .update({ risk_tier: 'medium' })
          .eq('id', caseId);
      }

    } catch (aiErr) {
      // AI verification is non-blocking — admin review still works without it.
      console.warn('AI verification failed (non-fatal):', aiErr.message);
    }

    const payload = {
      case_id: caseId,
      state: 'submitted',
      message: 'Your information was submitted securely. This normally takes a few minutes to several hours for human review.',
      trace_id: traceId
    };
    await completeIdempotency(user.id, 'kyc.submit', idemKey, 200, payload);
    return jsonResponse(res, 200, payload);
  } catch (err) {
    return handleError(res, err, 'kyc/submit');
  }
};
