/**
 * Verdex KYC/AML shared helpers — mainnet identity module.
 * All writes go through the service role; clients never set verified/p2p flags.
 */
const crypto = require('crypto');
const {
  getSupabase,
  verifyUser,
  verifyAdmin,
  jsonResponse,
  handleError,
  setCORS,
  checkRateLimit,
  getResend
} = require('../../lib/api-lib');

const KYC_POLICY_VERSION = process.env.VERDEX_KYC_POLICY_VERSION || 'kyc-2026-07-18';
const KYC_CONSENT_VERSION = process.env.VERDEX_KYC_CONSENT_VERSION || 'kyc-consent-2026-07-18';
const EVIDENCE_BUCKET = process.env.VERDEX_KYC_BUCKET || 'verdex-kyc-private';
const MAX_EVIDENCE_BYTES = 25 * 1024 * 1024;
const UPLOAD_GRANT_TTL_MS = 5 * 60 * 1000;
const EVIDENCE_URL_TTL_SEC = 60;
const DEFAULT_KYC_EXPIRY_DAYS = 365;

const ALLOWED_COUNTRIES = Object.freeze([
  { code: 'PK', name: 'Pakistan', documents: ['passport', 'national_id', 'driver_licence'], min_age: 18 },
  { code: 'AE', name: 'United Arab Emirates', documents: ['passport', 'national_id', 'driver_licence'], min_age: 18 },
  { code: 'GB', name: 'United Kingdom', documents: ['passport', 'national_id', 'driver_licence'], min_age: 18 },
  { code: 'US', name: 'United States', documents: ['passport', 'driver_licence'], min_age: 18 },
  { code: 'SA', name: 'Saudi Arabia', documents: ['passport', 'national_id'], min_age: 18 },
  { code: 'TR', name: 'Türkiye', documents: ['passport', 'national_id', 'driver_licence'], min_age: 18 },
  { code: 'IN', name: 'India', documents: ['passport', 'national_id', 'driver_licence'], min_age: 18 },
  { code: 'NG', name: 'Nigeria', documents: ['passport', 'national_id', 'driver_licence'], min_age: 18 },
  { code: 'KE', name: 'Kenya', documents: ['passport', 'national_id'], min_age: 18 },
  { code: 'ZA', name: 'South Africa', documents: ['passport', 'national_id', 'driver_licence'], min_age: 18 },
  { code: 'BD', name: 'Bangladesh', documents: ['passport', 'national_id', 'driver_licence'], min_age: 18 },
  { code: 'ID', name: 'Indonesia', documents: ['passport', 'national_id', 'driver_licence'], min_age: 18 },
  { code: 'MY', name: 'Malaysia', documents: ['passport', 'national_id', 'driver_licence'], min_age: 18 },
  { code: 'PH', name: 'Philippines', documents: ['passport', 'national_id', 'driver_licence'], min_age: 18 },
  { code: 'VN', name: 'Vietnam', documents: ['passport', 'national_id', 'driver_licence'], min_age: 18 },
  { code: 'TH', name: 'Thailand', documents: ['passport', 'national_id', 'driver_licence'], min_age: 18 },
  { code: 'EG', name: 'Egypt', documents: ['passport', 'national_id', 'driver_licence'], min_age: 18 },
  { code: 'MA', name: 'Morocco', documents: ['passport', 'national_id', 'driver_licence'], min_age: 18 },
  { code: 'GH', name: 'Ghana', documents: ['passport', 'national_id'], min_age: 18 },
  { code: 'TZ', name: 'Tanzania', documents: ['passport', 'national_id'], min_age: 18 },
  { code: 'UG', name: 'Uganda', documents: ['passport', 'national_id'], min_age: 18 },
  { code: 'CA', name: 'Canada', documents: ['passport', 'driver_licence'], min_age: 18 },
  { code: 'AU', name: 'Australia', documents: ['passport', 'driver_licence'], min_age: 18 },
  { code: 'DE', name: 'Germany', documents: ['passport', 'national_id', 'driver_licence'], min_age: 18 },
  { code: 'FR', name: 'France', documents: ['passport', 'national_id', 'driver_licence'], min_age: 18 },
  { code: 'IT', name: 'Italy', documents: ['passport', 'national_id', 'driver_licence'], min_age: 18 },
  { code: 'ES', name: 'Spain', documents: ['passport', 'national_id', 'driver_licence'], min_age: 18 },
  { code: 'NL', name: 'Netherlands', documents: ['passport', 'national_id', 'driver_licence'], min_age: 18 },
  { code: 'BE', name: 'Belgium', documents: ['passport', 'national_id'], min_age: 18 },
  { code: 'CH', name: 'Switzerland', documents: ['passport', 'national_id'], min_age: 18 },
  { code: 'SE', name: 'Sweden', documents: ['passport', 'national_id'], min_age: 18 },
  { code: 'NO', name: 'Norway', documents: ['passport', 'national_id'], min_age: 18 },
  { code: 'DK', name: 'Denmark', documents: ['passport', 'national_id'], min_age: 18 },
  { code: 'FI', name: 'Finland', documents: ['passport', 'national_id'], min_age: 18 },
  { code: 'PL', name: 'Poland', documents: ['passport', 'national_id', 'driver_licence'], min_age: 18 },
  { code: 'PT', name: 'Portugal', documents: ['passport', 'national_id', 'driver_licence'], min_age: 18 },
  { code: 'IE', name: 'Ireland', documents: ['passport', 'driver_licence'], min_age: 18 },
  { code: 'AT', name: 'Austria', documents: ['passport', 'national_id'], min_age: 18 },
  { code: 'CZ', name: 'Czech Republic', documents: ['passport', 'national_id'], min_age: 18 },
  { code: 'GR', name: 'Greece', documents: ['passport', 'national_id', 'driver_licence'], min_age: 18 },
  { code: 'RO', name: 'Romania', documents: ['passport', 'national_id'], min_age: 18 },
  { code: 'HU', name: 'Hungary', documents: ['passport', 'national_id'], min_age: 18 },
  { code: 'BG', name: 'Bulgaria', documents: ['passport', 'national_id'], min_age: 18 },
  { code: 'HR', name: 'Croatia', documents: ['passport', 'national_id'], min_age: 18 },
  { code: 'SK', name: 'Slovakia', documents: ['passport', 'national_id'], min_age: 18 },
  { code: 'SI', name: 'Slovenia', documents: ['passport', 'national_id'], min_age: 18 },
  { code: 'LT', name: 'Lithuania', documents: ['passport', 'national_id'], min_age: 18 },
  { code: 'LV', name: 'Latvia', documents: ['passport', 'national_id'], min_age: 18 },
  { code: 'EE', name: 'Estonia', documents: ['passport', 'national_id'], min_age: 18 },
  { code: 'BR', name: 'Brazil', documents: ['passport', 'national_id', 'driver_licence'], min_age: 18 },
  { code: 'MX', name: 'Mexico', documents: ['passport', 'national_id', 'driver_licence'], min_age: 18 },
  { code: 'AR', name: 'Argentina', documents: ['passport', 'national_id'], min_age: 18 },
  { code: 'CO', name: 'Colombia', documents: ['passport', 'national_id'], min_age: 18 },
  { code: 'CL', name: 'Chile', documents: ['passport', 'national_id'], min_age: 18 },
  { code: 'PE', name: 'Peru', documents: ['passport', 'national_id'], min_age: 18 },
  { code: 'VE', name: 'Venezuela', documents: ['passport', 'national_id'], min_age: 18 },
  { code: 'EC', name: 'Ecuador', documents: ['passport', 'national_id'], min_age: 18 },
  { code: 'JP', name: 'Japan', documents: ['passport', 'driver_licence'], min_age: 18 },
  { code: 'KR', name: 'South Korea', documents: ['passport', 'national_id', 'driver_licence'], min_age: 18 },
  { code: 'CN', name: 'China', documents: ['passport'], min_age: 18 },
  { code: 'SG', name: 'Singapore', documents: ['passport', 'national_id'], min_age: 18 },
  { code: 'HK', name: 'Hong Kong', documents: ['passport', 'national_id'], min_age: 18 },
  { code: 'TW', name: 'Taiwan', documents: ['passport', 'national_id'], min_age: 18 },
  { code: 'QA', name: 'Qatar', documents: ['passport', 'national_id'], min_age: 18 },
  { code: 'KW', name: 'Kuwait', documents: ['passport', 'national_id'], min_age: 18 },
  { code: 'BH', name: 'Bahrain', documents: ['passport', 'national_id'], min_age: 18 },
  { code: 'OM', name: 'Oman', documents: ['passport', 'national_id'], min_age: 18 },
  { code: 'JO', name: 'Jordan', documents: ['passport', 'national_id'], min_age: 18 },
  { code: 'LB', name: 'Lebanon', documents: ['passport', 'national_id'], min_age: 18 },
  { code: 'IQ', name: 'Iraq', documents: ['passport', 'national_id'], min_age: 18 },
  { code: 'IR', name: 'Iran', documents: ['passport', 'national_id'], min_age: 18 },
  { code: 'AF', name: 'Afghanistan', documents: ['passport', 'national_id'], min_age: 18 },
  { code: 'LK', name: 'Sri Lanka', documents: ['passport', 'national_id'], min_age: 18 },
  { code: 'NP', name: 'Nepal', documents: ['passport', 'national_id'], min_age: 18 },
  { code: 'MM', name: 'Myanmar', documents: ['passport', 'national_id'], min_age: 18 },
  { code: 'KH', name: 'Cambodia', documents: ['passport', 'national_id'], min_age: 18 },
  { code: 'LA', name: 'Laos', documents: ['passport', 'national_id'], min_age: 18 },
  { code: 'BN', name: 'Brunei', documents: ['passport', 'national_id'], min_age: 18 },
  { code: 'ET', name: 'Ethiopia', documents: ['passport', 'national_id'], min_age: 18 },
  { code: 'SD', name: 'Sudan', documents: ['passport', 'national_id'], min_age: 18 },
  { code: 'DZ', name: 'Algeria', documents: ['passport', 'national_id'], min_age: 18 },
  { code: 'TN', name: 'Tunisia', documents: ['passport', 'national_id'], min_age: 18 },
  { code: 'LY', name: 'Libya', documents: ['passport', 'national_id'], min_age: 18 },
  { code: 'YE', name: 'Yemen', documents: ['passport', 'national_id'], min_age: 18 },
  { code: 'SY', name: 'Syria', documents: ['passport', 'national_id'], min_age: 18 },
  { code: 'PS', name: 'Palestine', documents: ['passport', 'national_id'], min_age: 18 },
  { code: 'RU', name: 'Russia', documents: ['passport', 'national_id', 'driver_licence'], min_age: 18 },
  { code: 'UA', name: 'Ukraine', documents: ['passport', 'national_id', 'driver_licence'], min_age: 18 },
  { code: 'BY', name: 'Belarus', documents: ['passport', 'national_id'], min_age: 18 },
  { code: 'KZ', name: 'Kazakhstan', documents: ['passport', 'national_id'], min_age: 18 },
  { code: 'UZ', name: 'Uzbekistan', documents: ['passport', 'national_id'], min_age: 18 },
  { code: 'AZ', name: 'Azerbaijan', documents: ['passport', 'national_id'], min_age: 18 },
  { code: 'AM', name: 'Armenia', documents: ['passport', 'national_id'], min_age: 18 },
  { code: 'GE', name: 'Georgia', documents: ['passport', 'national_id'], min_age: 18 },
  { code: 'NZ', name: 'New Zealand', documents: ['passport', 'driver_licence'], min_age: 18 },
  { code: 'RS', name: 'Serbia', documents: ['passport', 'national_id'], min_age: 18 },
  { code: 'BA', name: 'Bosnia and Herzegovina', documents: ['passport', 'national_id'], min_age: 18 },
  { code: 'MK', name: 'North Macedonia', documents: ['passport', 'national_id'], min_age: 18 },
  { code: 'AL', name: 'Albania', documents: ['passport', 'national_id'], min_age: 18 },
  { code: 'MD', name: 'Moldova', documents: ['passport', 'national_id'], min_age: 18 },
  { code: 'CM', name: 'Cameroon', documents: ['passport', 'national_id'], min_age: 18 },
  { code: 'CI', name: "Côte d'Ivoire", documents: ['passport', 'national_id'], min_age: 18 },
  { code: 'SN', name: 'Senegal', documents: ['passport', 'national_id'], min_age: 18 },
  { code: 'MZ', name: 'Mozambique', documents: ['passport', 'national_id'], min_age: 18 },
  { code: 'AO', name: 'Angola', documents: ['passport', 'national_id'], min_age: 18 },
  { code: 'ZW', name: 'Zimbabwe', documents: ['passport', 'national_id'], min_age: 18 },
  { code: 'ZM', name: 'Zambia', documents: ['passport', 'national_id'], min_age: 18 },
  { code: 'RW', name: 'Rwanda', documents: ['passport', 'national_id'], min_age: 18 },
  { code: 'BI', name: 'Burundi', documents: ['passport', 'national_id'], min_age: 18 }
]);

const DOC_REQUIRES_BACK = new Set(['national_id', 'driver_licence']);

const ACTIVE_CASE_STATUSES = ['draft', 'collecting', 'submitted', 'in_review', 'needs_resubmission'];
const REVIEW_QUEUE_STATUSES = ['submitted', 'in_review', 'needs_resubmission'];

const EVIDENCE_KIND_MAP = {
  'document-front': 'identity_document_front',
  'document-back': 'identity_document_back',
  'live-selfie': 'selfie_image',
  'liveness-video': 'liveness_video',
  identity_document_front: 'identity_document_front',
  identity_document_back: 'identity_document_back',
  selfie_image: 'selfie_image',
  liveness_video: 'liveness_video'
};

const ALLOWED_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4'
]);

function apiError(res, status, code, message, extra = {}) {
  return jsonResponse(res, status, {
    error: { code, message, retryable: !!extra.retryable, trace_id: extra.traceId || null, ...extra.fields }
  });
}

function getTraceId(req) {
  return req.headers['x-trace-id'] || crypto.randomUUID();
}

function getIdempotencyKey(req) {
  const key = req.headers['x-idempotency-key'];
  if (!key || typeof key !== 'string' || key.length < 8 || key.length > 255) return null;
  return key.trim();
}

function hashRequestBody(body) {
  return crypto.createHash('sha256').update(JSON.stringify(body || {})).digest('hex');
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function hmacIp(req) {
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  const secret = process.env.VERDEX_PII_HMAC_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'verdex-dev-hmac';
  return crypto.createHmac('sha256', secret).update(ip).digest('hex');
}

function countryConfig(code) {
  return ALLOWED_COUNTRIES.find((c) => c.code === String(code || '').toUpperCase()) || null;
}

function normalizeDocumentType(value) {
  const v = String(value || '').toLowerCase().replace(/[\s-]+/g, '_');
  if (['passport', 'national_id', 'driver_licence', 'driver_license'].includes(v)) {
    return v === 'driver_license' ? 'driver_licence' : v;
  }
  return null;
}

function requiredEvidenceKinds(documentType) {
  const kinds = ['identity_document_front', 'selfie_image'];
  if (DOC_REQUIRES_BACK.has(documentType)) kinds.splice(1, 0, 'identity_document_back');
  return kinds;
}

async function beginIdempotency(actorId, operation, key, requestHash) {
  if (!key) return { mode: 'none' };
  const supabase = getSupabase();
  const { data: existing } = await supabase
    .from('verdex_api_idempotency_keys')
    .select('*')
    .eq('actor_user_id', actorId)
    .eq('operation', operation)
    .eq('idempotency_key', key)
    .maybeSingle();

  if (existing) {
    if (existing.request_hash_sha256 !== requestHash) {
      return { mode: 'conflict' };
    }
    if (existing.status === 'completed') {
      return { mode: 'replay', status: existing.response_status, body: existing.response_body };
    }
    if (existing.status === 'in_progress') {
      return { mode: 'in_progress' };
    }
  }

  const { error } = await supabase.from('verdex_api_idempotency_keys').insert({
    actor_user_id: actorId,
    operation,
    idempotency_key: key,
    request_hash_sha256: requestHash,
    status: 'in_progress'
  });
  if (error && !String(error.message || '').includes('duplicate')) {
    throw error;
  }
  return { mode: 'fresh', key, requestHash };
}

async function completeIdempotency(actorId, operation, key, status, body) {
  if (!key) return;
  const supabase = getSupabase();
  await supabase
    .from('verdex_api_idempotency_keys')
    .update({
      status: 'completed',
      response_status: status,
      response_body: body,
      completed_at: new Date().toISOString()
    })
    .eq('actor_user_id', actorId)
    .eq('operation', operation)
    .eq('idempotency_key', key);
}

async function recordAudit({
  actorUserId,
  actorKind = 'user',
  action,
  resourceType,
  resourceId,
  subjectUserId,
  outcome = 'success',
  requestId,
  req,
  metadata = {}
}) {
  const supabase = getSupabase();
  try {
    const { data, error } = await supabase.rpc('verdex_record_audit_event', {
      p_actor_user_id: actorUserId || null,
      p_actor_kind: actorKind,
      p_action: action,
      p_resource_type: resourceType,
      p_resource_id: resourceId ? String(resourceId) : null,
      p_subject_user_id: subjectUserId || null,
      p_outcome: outcome,
      p_request_id: requestId || null,
      p_ip_hash_sha256: req ? hmacIp(req) : null,
      p_user_agent_hash_sha256: req && req.headers['user-agent']
        ? sha256Hex(req.headers['user-agent'])
        : null,
      p_metadata: metadata
    });
    if (error) {
      // Fallback when RPC not yet applied in an environment
      await supabase.from('audit_logs').insert({
        user_id: actorUserId,
        action,
        resource_type: resourceType,
        resource_id: resourceId ? String(resourceId) : null,
        success: outcome === 'success',
        metadata: { ...metadata, subject_user_id: subjectUserId, actor_kind: actorKind }
      });
    }
    return data;
  } catch (err) {
    console.error('[kyc-audit]', err.message || err);
    return null;
  }
}

async function isStaff(userId, role) {
  if (!userId) return false;
  const supabase = getSupabase();
  const { data } = await supabase
    .from('verdex_staff_roles')
    .select('id, role, assignment_status, expires_at')
    .eq('user_id', userId)
    .eq('role', role)
    .eq('assignment_status', 'active')
    .maybeSingle();
  if (!data) return false;
  if (data.expires_at && new Date(data.expires_at) <= new Date()) return false;
  return true;
}

async function verifyModerator(req) {
  const user = await verifyUser(req);
  if (!user) return null;
  if (await isStaff(user.id, 'moderator')) return user;
  if (await isStaff(user.id, 'administrator')) return user;
  // Bootstrap: env admin emails can moderate until staff rows are seeded
  const admin = await verifyAdmin(req);
  return admin || null;
}

async function verifyAdministrator(req) {
  const user = await verifyUser(req);
  if (!user) return null;
  if (await isStaff(user.id, 'administrator')) return user;
  return verifyAdmin(req);
}

async function getActiveCase(userId) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('verdex_kyc_cases')
    .select('*')
    .eq('subject_user_id', userId)
    .in('status', ACTIVE_CASE_STATUSES)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function getLatestCase(userId) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('verdex_kyc_cases')
    .select('*')
    .eq('subject_user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function getEntitlement(userId) {
  const supabase = getSupabase();
  const { data } = await supabase
    .from('verdex_p2p_entitlements')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  return data;
}

async function getEvidenceForCase(caseId) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('verdex_kyc_evidence')
    .select('id, evidence_kind, evidence_version, content_type, byte_size, checksum_sha256, uploaded_at, superseded_at, redacted_at, capture_metadata')
    .eq('case_id', caseId)
    .is('superseded_at', null)
    .is('redacted_at', null);
  if (error) throw error;
  return data || [];
}

function redactedCaseStatus(kycCase, entitlement, evidence = []) {
  if (!kycCase) {
    return {
      case_id: null,
      status: 'not_started',
      tier: 0,
      p2p_eligible: false,
      next_action: { type: 'start_kyc', message: 'Verify your identity to use P2P with mainnet VDX.' },
      limits: null,
      updated_at: null
    };
  }

  const eligible =
    entitlement &&
    entitlement.state === 'eligible' &&
    (!entitlement.expires_at || new Date(entitlement.expires_at) > new Date());

  let nextAction = { type: 'none', message: 'No action required.' };
  switch (kycCase.status) {
    case 'draft':
    case 'collecting':
    case 'needs_resubmission':
      nextAction = {
        type: 'continue_capture',
        message: 'Continue document and live selfie capture.',
        missing_evidence: missingEvidence(kycCase, evidence)
      };
      break;
    case 'submitted':
    case 'in_review':
      nextAction = { type: 'wait', message: 'We are reviewing your verification.' };
      break;
    case 'approved':
      nextAction = eligible
        ? { type: 'open_p2p', message: 'Your account is eligible for P2P under current mainnet limits.' }
        : { type: 'wait', message: 'Identity verified; P2P entitlement is pending compliance clearance.' };
      break;
    case 'rejected':
      nextAction = { type: 'support', message: 'Verification was not approved. Contact support if you believe this is an error.' };
      break;
    case 'expired':
      nextAction = { type: 'start_kyc', message: 'Verification expired. Please verify again.' };
      break;
    case 'withdrawn':
      nextAction = { type: 'start_kyc', message: 'Previous case was withdrawn. Start a new verification.' };
      break;
    default:
      break;
  }

  const tier =
    kycCase.status === 'approved'
      ? kycCase.verification_level === 'enhanced'
        ? 2
        : 1
      : 0;

  return {
    case_id: kycCase.id,
    status: kycCase.status,
    country_code: kycCase.country_code,
    tier,
    verification_level: kycCase.verification_level,
    p2p_eligible: !!eligible,
    p2p_entitlement_state: entitlement ? entitlement.state : 'not_eligible',
    expires_at: kycCase.expires_at,
    policy_version: KYC_POLICY_VERSION,
    evidence_received: evidence.map((e) => e.evidence_kind),
    next_action: nextAction,
    updated_at: kycCase.updated_at
  };
}

function missingEvidence(kycCase, evidence) {
  const docType = (kycCase.metadata && kycCase.metadata.document_type) || 'passport';
  const required = requiredEvidenceKinds(normalizeDocumentType(docType) || 'passport');
  const have = new Set(evidence.map((e) => e.evidence_kind));
  return required.filter((k) => !have.has(k));
}

function buildUploadToken(payload) {
  const secret = process.env.VERDEX_UPLOAD_TOKEN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'verdex-upload';
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function parseUploadToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const secret = process.env.VERDEX_UPLOAD_TOKEN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'verdex-upload';
  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload.exp || Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

function livenessChallenge() {
  const prompts = [
    ['turn_head_left', 'blink', 'turn_head_right'],
    ['blink', 'turn_head_right', 'smile'],
    ['turn_head_right', 'blink', 'turn_head_left'],
    ['look_up', 'blink', 'look_straight']
  ];
  const sequence = prompts[crypto.randomInt(0, prompts.length)];
  const nonce = crypto.randomBytes(16).toString('hex');
  return {
    challenge_id: crypto.randomUUID(),
    nonce,
    sequence,
    expires_at: new Date(Date.now() + 3 * 60 * 1000).toISOString()
  };
}

async function enqueueNotification({ recipientUserId, channel, templateKey, dedupeKey, payload }) {
  const supabase = getSupabase();
  const { error } = await supabase.from('verdex_notification_outbox').upsert(
    {
      recipient_user_id: recipientUserId,
      channel,
      template_key: templateKey,
      dedupe_key: dedupeKey,
      payload: payload || {},
      status: 'pending'
    },
    { onConflict: 'recipient_user_id,channel,dedupe_key', ignoreDuplicates: true }
  );
  if (error && !String(error.message || '').toLowerCase().includes('duplicate')) {
    console.error('[kyc-outbox]', error.message);
  }
}

function buildKycVerifiedEmailHtml() {
  const siteUrl = process.env.SITE_URL || 'https://verdexswap.site';
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Identity verified</title></head>
<body style="margin:0;padding:0;background:#000;font-family:sans-serif;color:#fff;">
<table width="100%" style="background:#000;padding:40px 20px;"><tr><td align="center">
<table width="580" style="max-width:580px;background:#050a05;border:1px solid rgba(0,255,136,.15);border-radius:20px;">
<tr><td style="padding:40px;text-align:center;">
<h1 style="color:#00ff88;letter-spacing:4px;">VERDEX</h1>
<div style="height:1px;background:linear-gradient(90deg,transparent,#00ff88,transparent);margin:20px 0;"></div>
<h2 style="color:#fff;">Identity verified</h2>
<p style="color:#86a389;font-size:14px;line-height:1.6;text-align:left;">
Your identity verification was approved. P2P access with mainnet VDX is enabled under the current policy limits.
Open the Verdex app to view your status and marketplace access.
</p>
<p style="font-size:12px;color:#7a9a7e;">This email does not include document details or balances.
If you did not request verification, contact support immediately.</p>
<p style="font-size:11px;color:#7a9a7e;margin-top:24px;">${siteUrl}</p>
</td></tr></table></td></tr></table>
</body></html>`;
}

async function sendKycVerifiedEmail(email) {
  if (!email) return { success: false, error: 'missing_email' };
  try {
    const resend = getResend();
    const fromAddress = process.env.SENDER_EMAIL || 'Verdex <no-reply@verdexswap.site>';
    const html = buildKycVerifiedEmailHtml();
    const subject = 'Verdex — Identity verified · P2P access enabled';
    const { error } = await resend.emails.send({ from: fromAddress, to: [email], subject, html });
    if (error) {
      await resend.emails.send({
        from: 'Verdex Compliance <onboarding@resend.dev>',
        to: [email],
        subject,
        html
      });
    }
    return { success: true };
  } catch (err) {
    console.error('[kyc-email]', err.message || err);
    return { success: false, error: err.message };
  }
}

async function grantP2pOnApproval({ userId, caseId, amlScreeningId, decidedBy, req, traceId }) {
  const supabase = getSupabase();
  const now = new Date();
  const expires = new Date(now.getTime() + DEFAULT_KYC_EXPIRY_DAYS * 86400000);

  const { data: current } = await supabase
    .from('verdex_kyc_cases')
    .select('version')
    .eq('id', caseId)
    .single();

  await supabase
    .from('verdex_kyc_cases')
    .update({
      status: 'approved',
      reviewed_at: now.toISOString(),
      reviewer_user_id: decidedBy,
      expires_at: expires.toISOString(),
      decision_reason_code: 'manual_approved',
      version: ((current && current.version) || 1) + 1
    })
    .eq('id', caseId);

  const entitlementRow = {
    user_id: userId,
    state: 'eligible',
    kyc_case_id: caseId,
    aml_screening_id: amlScreeningId || null,
    decision_reason_code: 'kyc_approved_aml_clear',
    decided_by: decidedBy,
    decided_at: now.toISOString(),
    expires_at: expires.toISOString(),
    suspended_at: null,
    version: 1
  };

  const { data: existing } = await supabase
    .from('verdex_p2p_entitlements')
    .select('version')
    .eq('user_id', userId)
    .maybeSingle();

  if (existing) {
    await supabase
      .from('verdex_p2p_entitlements')
      .update({ ...entitlementRow, version: (existing.version || 1) + 1 })
      .eq('user_id', userId);
  } else {
    await supabase.from('verdex_p2p_entitlements').insert(entitlementRow);
  }

  await enqueueNotification({
    recipientUserId: userId,
    channel: 'email',
    templateKey: 'kyc-verification-confirmed-v1',
    dedupeKey: `kyc-verified:${caseId}:${KYC_POLICY_VERSION}`,
    payload: { case_id: caseId, policy_version: KYC_POLICY_VERSION }
  });
  await enqueueNotification({
    recipientUserId: userId,
    channel: 'push',
    templateKey: 'kyc-status-changed-v1',
    dedupeKey: `kyc-push-verified:${caseId}`,
    payload: { case_id: caseId }
  });
  await enqueueNotification({
    recipientUserId: userId,
    channel: 'in_app',
    templateKey: 'kyc-verified-banner-v1',
    dedupeKey: `kyc-inapp-verified:${caseId}`,
    payload: { case_id: caseId }
  });

  await recordAudit({
    actorUserId: decidedBy,
    actorKind: 'staff',
    action: 'kyc.case.approved',
    resourceType: 'verdex_kyc_cases',
    resourceId: caseId,
    subjectUserId: userId,
    requestId: traceId,
    req,
    metadata: { policy_version: KYC_POLICY_VERSION, p2p_eligible: true }
  });

  // Best-effort immediate email; outbox worker can retry
  try {
    const { data: authData } = await supabase.auth.admin.getUserById(userId);
    const email = authData && authData.user && authData.user.email;
    if (email) await sendKycVerifiedEmail(email);
  } catch (err) {
    console.error('[kyc-email-immediate]', err.message || err);
  }
}

async function rejectCase({ caseId, userId, decidedBy, reasonCode, req, traceId }) {
  const supabase = getSupabase();
  const now = new Date().toISOString();
  await supabase
    .from('verdex_kyc_cases')
    .update({
      status: 'rejected',
      reviewed_at: now,
      reviewer_user_id: decidedBy,
      decision_reason_code: reasonCode || 'manual_rejected'
    })
    .eq('id', caseId);

  const { data: ent } = await supabase
    .from('verdex_p2p_entitlements')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();
  const revokeRow = {
    user_id: userId,
    state: 'revoked',
    kyc_case_id: caseId,
    decision_reason_code: reasonCode || 'kyc_rejected',
    decided_by: decidedBy,
    decided_at: now,
    expires_at: null,
    suspended_at: null
  };
  if (ent) {
    await supabase.from('verdex_p2p_entitlements').update(revokeRow).eq('user_id', userId);
  } else {
    await supabase.from('verdex_p2p_entitlements').insert(revokeRow);
  }

  await enqueueNotification({
    recipientUserId: userId,
    channel: 'push',
    templateKey: 'kyc-status-changed-v1',
    dedupeKey: `kyc-push-rejected:${caseId}`,
    payload: { case_id: caseId }
  });

  await recordAudit({
    actorUserId: decidedBy,
    actorKind: 'staff',
    action: 'kyc.case.rejected',
    resourceType: 'verdex_kyc_cases',
    resourceId: caseId,
    subjectUserId: userId,
    requestId: traceId,
    req,
    metadata: { reason_code: reasonCode || 'manual_rejected' }
  });
}

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return req.body;
}

function requireAuthRate(req, res, userId, max = 60, windowMs = 60000) {
  const rl = checkRateLimit(`kyc:${userId}`, max, windowMs);
  if (!rl.allowed) {
    apiError(res, 429, 'RATE_LIMITED', 'Too many requests. Try again shortly.', {
      retryable: true,
      fields: { retry_at: rl.retryAt }
    });
    return false;
  }
  return true;
}

module.exports = {
  getSupabase,
  verifyUser,
  verifyAdmin,
  verifyModerator,
  verifyAdministrator,
  jsonResponse,
  handleError,
  setCORS,
  apiError,
  getTraceId,
  getIdempotencyKey,
  hashRequestBody,
  beginIdempotency,
  completeIdempotency,
  recordAudit,
  ALLOWED_COUNTRIES,
  countryConfig,
  normalizeDocumentType,
  requiredEvidenceKinds,
  EVIDENCE_KIND_MAP,
  ALLOWED_CONTENT_TYPES,
  EVIDENCE_BUCKET,
  MAX_EVIDENCE_BYTES,
  UPLOAD_GRANT_TTL_MS,
  EVIDENCE_URL_TTL_SEC,
  KYC_POLICY_VERSION,
  KYC_CONSENT_VERSION,
  ACTIVE_CASE_STATUSES,
  REVIEW_QUEUE_STATUSES,
  getActiveCase,
  getLatestCase,
  getEntitlement,
  getEvidenceForCase,
  redactedCaseStatus,
  missingEvidence,
  buildUploadToken,
  parseUploadToken,
  livenessChallenge,
  enqueueNotification,
  sendKycVerifiedEmail,
  grantP2pOnApproval,
  rejectCase,
  parseBody,
  requireAuthRate,
  sha256Hex,
  DOC_REQUIRES_BACK
};
