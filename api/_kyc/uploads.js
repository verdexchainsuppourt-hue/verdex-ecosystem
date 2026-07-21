const crypto = require('crypto');
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
  EVIDENCE_KIND_MAP,
  ALLOWED_CONTENT_TYPES,
  EVIDENCE_BUCKET,
  MAX_EVIDENCE_BYTES,
  UPLOAD_GRANT_TTL_MS,
  buildUploadToken,
  parseUploadToken,
  livenessChallenge,
  sha256Hex
} = require('./lib');

async function loadOwnedCase(userId, caseId) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('verdex_kyc_cases')
    .select('*')
    .eq('id', caseId)
    .eq('subject_user_id', userId)
    .single();
  if (error || !data) return null;
  return data;
}

/** POST grant — returns one-time upload token + object key */
async function createGrant(req, res) {
  const user = await verifyUser(req);
  if (!user) return apiError(res, 401, 'UNAUTHORIZED', 'Authentication required');
  if (!requireAuthRate(req, res, user.id, 40, 60000)) return;

  const caseId = req.query.id || req.query.case_id;
  const body = parseBody(req);
  const traceId = getTraceId(req);
  if (!caseId) return apiError(res, 400, 'CASE_ID_REQUIRED', 'case id is required');

  const kycCase = await loadOwnedCase(user.id, caseId);
  if (!kycCase) return apiError(res, 404, 'CASE_NOT_FOUND', 'KYC case not found');
  if (!['draft', 'collecting', 'needs_resubmission'].includes(kycCase.status)) {
    return apiError(res, 409, 'CASE_NOT_EDITABLE', 'Uploads not allowed in current state');
  }

  const kindKey = String(body.evidence_kind || body.kind || '');
  const evidenceKind = EVIDENCE_KIND_MAP[kindKey] || EVIDENCE_KIND_MAP[kindKey.replace(/_/g, '-')];
  if (!evidenceKind) {
    return apiError(res, 400, 'INVALID_EVIDENCE_KIND', 'Unknown evidence kind');
  }

  const contentType = String(body.content_type || '').toLowerCase();
  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    return apiError(res, 400, 'INVALID_CONTENT_TYPE', 'Only jpeg/png/webp/mp4 are accepted');
  }
  const byteSize = Number(body.byte_size || 0);
  if (!Number.isFinite(byteSize) || byteSize <= 0 || byteSize > MAX_EVIDENCE_BYTES) {
    return apiError(res, 400, 'INVALID_BYTE_SIZE', 'File size exceeds limits');
  }

  let challenge = null;
  if (evidenceKind === 'selfie_image' || evidenceKind === 'liveness_video') {
    challenge = livenessChallenge();
  }

  const objectKey = `kyc/${user.id}/${caseId}/${evidenceKind}/${crypto.randomUUID()}`;
  const exp = Date.now() + UPLOAD_GRANT_TTL_MS;
  const token = buildUploadToken({
    sub: user.id,
    case_id: caseId,
    evidence_kind: evidenceKind,
    object_key: objectKey,
    content_type: contentType,
    byte_size: byteSize,
    challenge_id: challenge ? challenge.challenge_id : null,
    challenge_nonce: challenge ? challenge.nonce : null,
    exp
  });

  // Prefer signed upload URL when storage bucket exists
  let uploadUrl = null;
  try {
    const supabase = getSupabase();
    const { data: signed, error } = await supabase.storage
      .from(EVIDENCE_BUCKET)
      .createSignedUploadUrl(objectKey);
    if (!error && signed) {
      uploadUrl = signed.signedUrl || signed.path || null;
    }
  } catch (_) {
    // Storage may not be provisioned yet; client uses complete endpoint with server-side placeholder.
  }

  await recordAudit({
    actorUserId: user.id,
    actorKind: 'user',
    action: 'kyc.upload.grant_issued',
    resourceType: 'verdex_kyc_cases',
    resourceId: caseId,
    subjectUserId: user.id,
    requestId: traceId,
    req,
    metadata: { evidence_kind: evidenceKind, content_type: contentType, byte_size: byteSize }
  });

  return jsonResponse(res, 200, {
    upload_token: token,
    expires_at: new Date(exp).toISOString(),
    object_key: objectKey,
    bucket: EVIDENCE_BUCKET,
    upload_url: uploadUrl,
    method: uploadUrl ? 'PUT' : 'COMPLETE_ONLY',
    liveness: challenge
      ? {
          challenge_id: challenge.challenge_id,
          sequence: challenge.sequence,
          expires_at: challenge.expires_at
        }
      : null,
    instructions: {
      gallery_import: false,
      strip_exif: true,
      max_bytes: MAX_EVIDENCE_BYTES
    },
    trace_id: traceId
  });
}

/** POST complete — records evidence metadata after client upload */
async function completeUpload(req, res) {
  const user = await verifyUser(req);
  if (!user) return apiError(res, 401, 'UNAUTHORIZED', 'Authentication required');
  if (!requireAuthRate(req, res, user.id, 40, 60000)) return;

  const caseId = req.query.id || req.query.case_id;
  const body = parseBody(req);
  const traceId = getTraceId(req);
  const idemKey = getIdempotencyKey(req);
  const reqHash = hashRequestBody(body);
  const idem = await beginIdempotency(user.id, 'kyc.upload.complete', idemKey, reqHash);
  if (idem.mode === 'conflict') {
    return apiError(res, 409, 'IDEMPOTENCY_KEY_REUSE', 'Idempotency key reused with different body');
  }
  if (idem.mode === 'replay') return jsonResponse(res, idem.status, idem.body);
  if (idem.mode === 'in_progress') {
    return apiError(res, 409, 'IDEMPOTENCY_IN_PROGRESS', 'Request already in progress', { retryable: true });
  }

  const grant = parseUploadToken(body.upload_token);
  if (!grant || grant.sub !== user.id || grant.case_id !== caseId) {
    return apiError(res, 401, 'UPLOAD_TOKEN_INVALID', 'Upload grant is invalid or expired', { retryable: true });
  }

  const checksum = String(body.checksum_sha256 || '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(checksum)) {
    return apiError(res, 400, 'INVALID_CHECKSUM', 'checksum_sha256 must be 64 hex chars');
  }

  const kycCase = await loadOwnedCase(user.id, caseId);
  if (!kycCase) return apiError(res, 404, 'CASE_NOT_FOUND', 'KYC case not found');

  if (grant.challenge_id) {
    if (!body.liveness_challenge_id || body.liveness_challenge_id !== grant.challenge_id) {
      return apiError(res, 400, 'LIVENESS_CHALLENGE_MISMATCH', 'Live capture challenge did not match.');
    }
    if (body.liveness_completed !== true) {
      return apiError(res, 400, 'LIVENESS_REQUIRED', 'Complete the active liveness challenge.');
    }
  }

  const supabase = getSupabase();

  // Supersede prior evidence of same kind
  await supabase
    .from('verdex_kyc_evidence')
    .update({ superseded_at: new Date().toISOString() })
    .eq('case_id', caseId)
    .eq('evidence_kind', grant.evidence_kind)
    .is('superseded_at', null);

  const { data: evidence, error } = await supabase
    .from('verdex_kyc_evidence')
    .insert({
      case_id: caseId,
      subject_user_id: user.id,
      evidence_kind: grant.evidence_kind,
      storage_bucket: EVIDENCE_BUCKET,
      storage_object_key: grant.object_key,
      checksum_sha256: checksum,
      content_type: grant.content_type,
      byte_size: grant.byte_size,
      capture_metadata: {
        liveness_challenge_id: grant.challenge_id || null,
        liveness_completed: !!body.liveness_completed,
        client_platform: body.client_platform || 'android',
        capture_source: 'camera'
      }
    })
    .select('id, evidence_kind, uploaded_at, checksum_sha256')
    .single();

  if (error) throw error;

  if (kycCase.status === 'draft') {
    await supabase.from('verdex_kyc_cases').update({ status: 'collecting' }).eq('id', caseId);
  }

  await recordAudit({
    actorUserId: user.id,
    actorKind: 'user',
    action: 'kyc.evidence.accepted',
    resourceType: 'verdex_kyc_evidence',
    resourceId: evidence.id,
    subjectUserId: user.id,
    requestId: traceId,
    req,
    metadata: {
      evidence_kind: grant.evidence_kind,
      checksum_prefix: checksum.slice(0, 12),
      byte_size: grant.byte_size
    }
  });

  const payload = {
    evidence_id: evidence.id,
    evidence_kind: evidence.evidence_kind,
    uploaded_at: evidence.uploaded_at,
    checksum_sha256: evidence.checksum_sha256,
    state: 'collecting',
    trace_id: traceId
  };
  await completeIdempotency(user.id, 'kyc.upload.complete', idemKey, 200, payload);
  return jsonResponse(res, 200, payload);
}

module.exports = async (req, res) => {
  setCORS(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return apiError(res, 405, 'METHOD_NOT_ALLOWED', 'POST only');

  try {
    const sub = req.query.sub || 'grant';
    if (sub === 'complete') return await completeUpload(req, res);
    return await createGrant(req, res);
  } catch (err) {
    return handleError(res, err, 'kyc/uploads');
  }
};
