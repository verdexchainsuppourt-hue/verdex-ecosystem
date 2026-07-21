/**
 * Verdex AI Verification — unit tests for the scoring pipeline.
 *
 * Run with: node --test api/_kyc/ai-verify.test.js
 */
const test = require('node:test');
const assert = require('node:assert');
const ai = require('./ai-verify');

// ---------------------------------------------------------------------------
// Document quality assessment
// ---------------------------------------------------------------------------

test('assessDocumentQuality: high-res camera capture scores well', () => {
  const r = ai.assessDocumentQuality({
    image_width: 2000, image_height: 1500, // 3MP
    byte_size: 2_000_000,
    capture_source: 'camera',
    brightness: 120,
    blur_score: 200,
  });
  assert.ok(r.score >= 70, `score should be high, got ${r.score}`);
  assert.strictEqual(r.recommendation, 'likely_genuine');
  assert.ok(r.factors.includes('high_resolution'));
  assert.ok(r.factors.includes('camera_capture'));
});

test('assessDocumentQuality: low-res upload scores poorly', () => {
  const r = ai.assessDocumentQuality({
    image_width: 400, image_height: 300, // 0.12MP
    byte_size: 50_000,
    capture_source: 'upload',
    brightness: 10,
  });
  assert.ok(r.score < 50, `score should be low, got ${r.score}`);
  assert.ok(r.factors.includes('low_resolution'));
  assert.ok(r.factors.includes('suspiciously_small_file'));
  assert.ok(r.factors.includes('non_camera_source_flagged'));
  assert.ok(r.factors.includes('too_dark'));
});

test('assessDocumentQuality: empty metadata returns low score (no positive signals)', () => {
  const r = ai.assessDocumentQuality({});
  // No positive signals = low score (byte_size 0 triggers small file flag)
  assert.ok(r.score < 50, `score should be below 50 with no signals, got ${r.score}`);
});

test('assessDocumentQuality: glare detected reduces score', () => {
  const r = ai.assessDocumentQuality({ brightness: 240 });
  assert.ok(r.factors.includes('too_bright_glare'));
  assert.ok(r.score < 50);
});

// ---------------------------------------------------------------------------
// Face match assessment
// ---------------------------------------------------------------------------

test('assessFaceMatch: liveness completed with good signals scores high', () => {
  const r = ai.assessFaceMatch(
    { liveness_completed: true, poses_completed: ['left','right','up','down','straight'], face_detected: true, blink_detected: true, face_angle: 5 },
    { face_detected: true }
  );
  assert.ok(r.score >= 85, `score should be high, got ${r.score}`);
  assert.ok(r.factors.includes('liveness_verified'));
  assert.ok(r.factors.includes('blink_detected'));
  assert.ok(r.factors.includes('frontal_pose'));
});

test('assessFaceMatch: no liveness scores low', () => {
  const r = ai.assessFaceMatch({ liveness_completed: false }, {});
  assert.ok(r.score < 40, `score should be low, got ${r.score}`);
  assert.ok(r.factors.includes('liveness_not_completed'));
});

test('assessFaceMatch: no face detected in selfie scores very low', () => {
  const r = ai.assessFaceMatch({ face_detected: false, liveness_completed: false }, {});
  assert.ok(r.score < 30);
  assert.ok(r.factors.includes('no_face_in_selfie'));
});

// ---------------------------------------------------------------------------
// Liveness assessment
// ---------------------------------------------------------------------------

test('assessLiveness: full pose set with blink scores high', () => {
  const r = ai.assessLiveness({
    liveness_completed: true,
    poses_completed: ['left','right','up','down','straight'],
    blink_detected: true,
    head_rotation_detected: true,
  });
  assert.ok(r.score >= 90);
  assert.ok(r.factors.includes('liveness_challenge_completed'));
  assert.ok(r.factors.includes('5_poses_completed'));
});

test('assessLiveness: screen replay suspected drops score', () => {
  const r = ai.assessLiveness({
    liveness_completed: true,
    poses_completed: ['left','right'],
    screen_replay_detected: true,
  });
  assert.ok(r.score < 70);
  assert.ok(r.factors.includes('screen_replay_suspected'));
});

test('assessLiveness: no liveness returns low score', () => {
  const r = ai.assessLiveness({});
  assert.ok(r.score <= 30);
  assert.ok(r.factors.includes('liveness_not_completed'));
});

// ---------------------------------------------------------------------------
// Fraud indicators
// ---------------------------------------------------------------------------

test('assessFraudIndicators: clean user returns clear', () => {
  const r = ai.assessFraudIndicators({
    evidence: [{ evidence_kind: 'identity_document_front', checksum_sha256: 'abc123', capture_metadata: { capture_source: 'camera' } }],
    deviceFingerprint: { user_count: 1, is_banned: false },
    caseHistory: [],
  });
  assert.strictEqual(r.riskLevel, 'clear');
  assert.strictEqual(r.indicators.length, 0);
});

test('assessFraudIndicators: banned device flags high risk', () => {
  const r = ai.assessFraudIndicators({
    deviceFingerprint: { user_count: 5, is_banned: true },
    caseHistory: [{ status: 'rejected' }, { status: 'rejected' }, { status: 'rejected' }],
  });
  assert.strictEqual(r.riskLevel, 'high');
  assert.ok(r.indicators.includes('banned_device'));
  assert.ok(r.indicators.includes('multiple_accounts_same_device'));
  assert.ok(r.indicators.includes('multiple_kyc_rejections'));
  assert.ok(r.riskScore >= 50);
});

test('assessFraudIndicators: emulator detected adds significant risk', () => {
  const r = ai.assessFraudIndicators({
    userMetadata: { is_emulator: true },
  });
  assert.ok(r.indicators.includes('emulator_detected'));
  assert.ok(r.riskScore >= 30);
});

test('assessFraudIndicators: non-camera source flags', () => {
  const r = ai.assessFraudIndicators({
    evidence: [{ capture_metadata: { capture_source: 'screenshot' } }],
  });
  assert.ok(r.indicators.includes('non_camera_capture_source'));
});

test('assessFraudIndicators: duplicate document within case', () => {
  const r = ai.assessFraudIndicators({
    evidence: [
      { evidence_kind: 'identity_document_front', checksum_sha256: 'same_hash' },
      { evidence_kind: 'identity_document_back', checksum_sha256: 'same_hash' },
    ],
  });
  assert.ok(r.indicators.includes('duplicate_document_within_case'));
});

// ---------------------------------------------------------------------------
// Overall verification package
// ---------------------------------------------------------------------------

test('generateVerificationPackage: clean submission recommends approve', () => {
  const r = ai.generateVerificationPackage({
    documentMetadata: { image_width: 2000, image_height: 1500, byte_size: 2_000_000, capture_source: 'camera', brightness: 120, blur_score: 200, face_detected: true },
    selfieMetadata: { liveness_completed: true, poses_completed: ['left','right','up','down','straight'], face_detected: true, blink_detected: true, face_angle: 5 },
    evidence: [{ evidence_kind: 'identity_document_front', checksum_sha256: 'unique1', capture_metadata: { capture_source: 'camera' } }],
    deviceFingerprint: { user_count: 1, is_banned: false },
    caseHistory: [],
  });
  assert.ok(r.overallScore >= 75, `overall should be high, got ${r.overallScore}`);
  assert.strictEqual(r.recommendation, 'approve');
});

test('generateVerificationPackage: poor quality submission recommends resubmission', () => {
  const r = ai.generateVerificationPackage({
    documentMetadata: { image_width: 200, image_height: 150, byte_size: 10000, capture_source: 'upload', brightness: 5 },
    selfieMetadata: { liveness_completed: true, poses_completed: ['left'], face_detected: true },
    evidence: [{ capture_metadata: { capture_source: 'upload' } }],
    deviceFingerprint: { user_count: 1, is_banned: false },
    caseHistory: [],
  });
  assert.ok(r.overallScore < 70, `overall should be moderate, got ${r.overallScore}`);
  assert.ok(['request_resubmission', 'manual_review', 'reject'].includes(r.recommendation),
    `recommendation should be resubmit/manual/reject, got ${r.recommendation}`);
});

test('generateVerificationPackage: high fraud risk recommends reject', () => {
  const r = ai.generateVerificationPackage({
    documentMetadata: { capture_source: 'camera' },
    selfieMetadata: { liveness_completed: true, poses_completed: ['left','right','up'] },
    deviceFingerprint: { user_count: 10, is_banned: true },
    caseHistory: [{ status: 'rejected' }, { status: 'rejected' }, { status: 'rejected' }],
  });
  assert.strictEqual(r.recommendation, 'reject');
  assert.ok(r.breakdown.fraud_check.riskLevel === 'high');
});

test('generateVerificationPackage: always returns all breakdown components', () => {
  const r = ai.generateVerificationPackage({});
  assert.ok(r.breakdown.document_quality);
  assert.ok(r.breakdown.face_match);
  assert.ok(r.breakdown.liveness);
  assert.ok(r.breakdown.fraud_check);
  assert.ok(typeof r.overallScore === 'number');
  assert.ok(typeof r.recommendation === 'string');
  assert.ok(r.timestamp);
});

// ---------------------------------------------------------------------------
// OCR stub
// ---------------------------------------------------------------------------

test('extractDocumentText: returns null (stub until OCR provider configured)', () => {
  const r = ai.extractDocumentText({ storage_object_key: 'kyc/test.jpg' });
  assert.strictEqual(r.extracted, null);
  assert.strictEqual(r.confidence, 0);
});
