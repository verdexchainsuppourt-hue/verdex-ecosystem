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
  countryConfig,
  getActiveCase,
  getLatestCase,
  getSupabase,
  parseBody,
  requireAuthRate,
  KYC_POLICY_VERSION,
  KYC_CONSENT_VERSION,
  redactedCaseStatus,
  getEntitlement,
  getEvidenceForCase
} = require('./lib');

module.exports = async (req, res) => {
  setCORS(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const user = await verifyUser(req);
    if (!user) return apiError(res, 401, 'UNAUTHORIZED', 'Authentication required');
    if (!requireAuthRate(req, res, user.id, 30, 60000)) return;
    const traceId = getTraceId(req);

    if (req.method === 'GET') {
      const kycCase = await getLatestCase(user.id);
      const entitlement = await getEntitlement(user.id);
      const evidence = kycCase ? await getEvidenceForCase(kycCase.id) : [];
      return jsonResponse(res, 200, {
        case: redactedCaseStatus(kycCase, entitlement, evidence),
        trace_id: traceId
      });
    }

    if (req.method !== 'POST') return apiError(res, 405, 'METHOD_NOT_ALLOWED', 'GET or POST');

    const body = parseBody(req);
    const idemKey = getIdempotencyKey(req);
    const reqHash = hashRequestBody(body);
    const idem = await beginIdempotency(user.id, 'kyc.cases.create', idemKey, reqHash);
    if (idem.mode === 'conflict') {
      return apiError(res, 409, 'IDEMPOTENCY_KEY_REUSE', 'Idempotency key reused with different body');
    }
    if (idem.mode === 'replay') return jsonResponse(res, idem.status, idem.body);
    if (idem.mode === 'in_progress') {
      return apiError(res, 409, 'IDEMPOTENCY_IN_PROGRESS', 'Request already in progress', { retryable: true });
    }

    const countryCode = String(body.country_code || '').toUpperCase();
    const country = countryConfig(countryCode);
    if (!country) {
      return apiError(res, 400, 'COUNTRY_NOT_SUPPORTED', 'Selected country is not available for verification.');
    }

    if (body.consent_version !== KYC_CONSENT_VERSION) {
      return apiError(res, 400, 'CONSENT_VERSION_MISMATCH', 'Accept the current identity-verification terms.');
    }
    if (body.age_attested !== true) {
      return apiError(res, 400, 'AGE_ATTESTATION_REQUIRED', 'You must confirm you meet the minimum age.');
    }
    if (body.privacy_accepted !== true) {
      return apiError(res, 400, 'PRIVACY_ACCEPTANCE_REQUIRED', 'You must accept the privacy terms.');
    }

    const existing = await getActiveCase(user.id);
    if (existing) {
      const entitlement = await getEntitlement(user.id);
      const evidence = await getEvidenceForCase(existing.id);
      const payload = {
        case_id: existing.id,
        state: existing.status,
        resumed: true,
        required_steps: ['profile', 'documents', 'liveness', 'submit'],
        policy_version: KYC_POLICY_VERSION,
        status: redactedCaseStatus(existing, entitlement, evidence),
        trace_id: traceId
      };
      await completeIdempotency(user.id, 'kyc.cases.create', idemKey, 200, payload);
      return jsonResponse(res, 200, payload);
    }

    const supabase = getSupabase();
    const insert = {
      subject_user_id: user.id,
      status: 'draft',
      country_code: countryCode,
      verification_level: 'standard',
      provider_name: 'manual_internal',
      risk_tier: 'unassessed'
    };

    // Optional metadata column may not exist until additive migration — try with metadata first
    const withMeta = {
      ...insert,
      // stored only if column exists via ignore; primary path uses decision fields
    };

    let created;
    let error;
    ({ data: created, error } = await supabase
      .from('verdex_kyc_cases')
      .insert(withMeta)
      .select('*')
      .single());

    if (error) {
      // Retry without unknown columns
      ({ data: created, error } = await supabase
        .from('verdex_kyc_cases')
        .insert(insert)
        .select('*')
        .single());
    }
    if (error) throw error;

    // Store profile draft fields on a side table if present; else review_actions note
    const { data: existingEnt } = await supabase
      .from('verdex_p2p_entitlements')
      .select('user_id, state')
      .eq('user_id', user.id)
      .maybeSingle();
    if (!existingEnt) {
      await supabase.from('verdex_p2p_entitlements').insert({
        user_id: user.id,
        state: 'pending',
        kyc_case_id: created.id,
        decision_reason_code: 'kyc_in_progress'
      });
    } else if (existingEnt.state === 'not_eligible' || existingEnt.state === 'pending') {
      await supabase
        .from('verdex_p2p_entitlements')
        .update({
          state: 'pending',
          kyc_case_id: created.id,
          decision_reason_code: 'kyc_in_progress',
          decided_at: null,
          decided_by: null
        })
        .eq('user_id', user.id);
    }

    await recordAudit({
      actorUserId: user.id,
      actorKind: 'user',
      action: 'kyc.case.created',
      resourceType: 'verdex_kyc_cases',
      resourceId: created.id,
      subjectUserId: user.id,
      requestId: traceId,
      req,
      metadata: {
        country_code: countryCode,
        policy_version: KYC_POLICY_VERSION,
        consent_version: KYC_CONSENT_VERSION,
        google_prefill: !!(body.google_prefill && body.google_prefill.subject)
      }
    });

    const payload = {
      case_id: created.id,
      state: created.status,
      resumed: false,
      required_steps: ['profile', 'documents', 'liveness', 'submit'],
      country: { code: country.code, name: country.name, documents: country.documents, min_age: country.min_age },
      policy_version: KYC_POLICY_VERSION,
      trace_id: traceId
    };
    await completeIdempotency(user.id, 'kyc.cases.create', idemKey, 201, payload);
    return jsonResponse(res, 201, payload);
  } catch (err) {
    return handleError(res, err, 'kyc/cases');
  }
};
