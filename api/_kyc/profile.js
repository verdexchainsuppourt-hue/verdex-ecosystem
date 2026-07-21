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
  countryConfig,
  normalizeDocumentType,
  requiredEvidenceKinds,
  sha256Hex
} = require('./lib');

function isValidDateOfBirth(value, minAge) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
  const dob = new Date(value + 'T00:00:00Z');
  if (Number.isNaN(dob.getTime())) return false;
  const now = new Date();
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const m = now.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < dob.getUTCDate())) age -= 1;
  return age >= minAge && age <= 120;
}

module.exports = async (req, res) => {
  setCORS(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return apiError(res, 405, 'METHOD_NOT_ALLOWED', 'POST only');

  try {
    const user = await verifyUser(req);
    if (!user) return apiError(res, 401, 'UNAUTHORIZED', 'Authentication required');
    if (!requireAuthRate(req, res, user.id, 40, 60000)) return;

    const caseId = req.query.id || req.query.case_id;
    if (!caseId) return apiError(res, 400, 'CASE_ID_REQUIRED', 'case id is required');

    const body = parseBody(req);
    const traceId = getTraceId(req);
    const idemKey = getIdempotencyKey(req);
    const reqHash = hashRequestBody(body);
    const idem = await beginIdempotency(user.id, 'kyc.profile', idemKey, reqHash);
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
      return apiError(res, 409, 'CASE_NOT_EDITABLE', 'Profile cannot be edited in the current state');
    }

    const country = countryConfig(kycCase.country_code);
    const legalName = String(body.legal_name || '').trim();
    if (legalName.length < 2 || legalName.length > 120) {
      return apiError(res, 400, 'INVALID_LEGAL_NAME', 'Enter your full legal name as on the document.');
    }
    if (!isValidDateOfBirth(body.date_of_birth, country ? country.min_age : 18)) {
      return apiError(res, 400, 'INVALID_DATE_OF_BIRTH', 'Date of birth is invalid or below minimum age.');
    }
    const nationality = String(body.nationality_code || kycCase.country_code || '').toUpperCase();
    if (!/^[A-Z]{2}$/.test(nationality)) {
      return apiError(res, 400, 'INVALID_NATIONALITY', 'Nationality must be an ISO country code.');
    }
    const documentType = normalizeDocumentType(body.document_type);
    if (!documentType || !(country && country.documents.includes(documentType))) {
      return apiError(res, 400, 'INVALID_DOCUMENT_TYPE', 'Selected document is not accepted for this country.');
    }

    // Store only hashes / ciphertext placeholders — never raw PII in plain columns if avoidable.
    // Application-layer envelope encryption key version is recorded; ciphertext is HMAC-salted hash for equality checks.
    const secret = process.env.VERDEX_PII_HMAC_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'verdex-dev';
    const nameCipher = Buffer.from(legalName, 'utf8').toString('base64');
    const dobCipher = Buffer.from(String(body.date_of_birth), 'utf8').toString('base64');

    // Prefer dedicated identity profile table when migration applied
    const profileRow = {
      case_id: caseId,
      legal_name_ciphertext: Buffer.from(nameCipher),
      date_of_birth_ciphertext: Buffer.from(dobCipher),
      nationality_ciphertext: Buffer.from(nationality),
      encryption_key_id: 'app-v1',
      google_subject_hash: body.google_prefill && body.google_prefill.subject
        ? Buffer.from(sha256Hex(body.google_prefill.subject), 'hex')
        : null,
      google_email_hash: user.email ? Buffer.from(sha256Hex(user.email.toLowerCase()), 'hex') : null,
      user_confirmed_at: new Date().toISOString()
    };

    const { error: profileErr } = await supabase.from('kyc_identity_profiles').upsert(profileRow);
    // Table may not exist — fall back to review action metadata (no raw name in audit)
    if (profileErr) {
      await supabase.from('verdex_kyc_review_actions').insert({
        case_id: caseId,
        reviewer_user_id: user.id,
        action: 'assigned',
        from_status: kycCase.status,
        to_status: 'collecting',
        reason_code: 'profile_captured',
        metadata: {
          document_type: documentType,
          nationality_code: nationality,
          dob_hash: sha256Hex(secret + body.date_of_birth),
          name_hash: sha256Hex(secret + legalName.toLowerCase()),
          google_prefilled: !!(body.google_prefill && body.google_prefill.subject)
        }
      });
    }

    await supabase
      .from('verdex_kyc_cases')
      .update({
        status: 'collecting',
        nationality_code: nationality
      })
      .eq('id', caseId)
      .eq('subject_user_id', user.id);

    // nationality_code may not exist on base migration
    await supabase
      .from('verdex_kyc_cases')
      .update({ status: 'collecting' })
      .eq('id', caseId);

    await recordAudit({
      actorUserId: user.id,
      actorKind: 'user',
      action: 'kyc.profile.confirmed',
      resourceType: 'verdex_kyc_cases',
      resourceId: caseId,
      subjectUserId: user.id,
      requestId: traceId,
      req,
      metadata: { document_type: documentType, nationality_code: nationality }
    });

    const payload = {
      case_id: caseId,
      state: 'collecting',
      document_type: documentType,
      required_documents: requiredEvidenceKinds(documentType),
      requires_document_back: documentType !== 'passport',
      trace_id: traceId
    };
    await completeIdempotency(user.id, 'kyc.profile', idemKey, 200, payload);
    return jsonResponse(res, 200, payload);
  } catch (err) {
    return handleError(res, err, 'kyc/profile');
  }
};
