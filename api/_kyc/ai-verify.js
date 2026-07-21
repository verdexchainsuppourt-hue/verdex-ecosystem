/**
 * Verdex AI Identity Verification — confidence scoring pipeline.
 *
 * Runs AFTER KYC submission to compute:
 *  - Document quality score (image clarity, resolution, lighting)
 *  - Face match score (selfie vs document photo)
 *  - Liveness confidence (pose challenge completion)
 *  - Fraud indicators (duplicate documents, device signals)
 *  - Overall confidence score + recommendation
 *
 * The AI NEVER makes the final compliance decision. It generates a
 * recommendation + evidence package for human admin review.
 *
 * This module uses heuristic + signal-based scoring (no external ML API
 * dependency). When a dedicated OCR/face-match provider is available,
 * the `extract*` and `compare*` functions can be replaced with API calls.
 */
const crypto = require('crypto');

// ---------------------------------------------------------------------------
// Document quality assessment (heuristic — based on image metadata)
// ---------------------------------------------------------------------------

/**
 * Assess document image quality from capture metadata.
 * @param {object} metadata - capture_metadata from the evidence record
 * @returns {{ score: number, factors: string[], recommendation: string }}
 */
function assessDocumentQuality(metadata = {}) {
  let score = 50; // Base score
  const factors = [];

  // Resolution check
  const width = metadata.image_width || 0;
  const height = metadata.image_height || 0;
  const megapixels = (width * height) / 1_000_000;
  if (megapixels >= 2) { score += 15; factors.push('high_resolution'); }
  else if (megapixels >= 1) { score += 8; factors.push('adequate_resolution'); }
  else if (megapixels > 0) { score -= 10; factors.push('low_resolution'); }

  // File size check (too small = low quality, too large = possible manipulation)
  const byteSize = metadata.byte_size || 0;
  if (byteSize > 500_000 && byteSize < 10_000_000) { score += 5; factors.push('normal_file_size'); }
  else if (byteSize < 100_000) { score -= 15; factors.push('suspiciously_small_file'); }

  // Lighting / blur detection (from capture metadata if available)
  if (metadata.brightness !== undefined) {
    if (metadata.brightness > 40 && metadata.brightness < 200) { score += 10; factors.push('good_lighting'); }
    else if (metadata.brightness < 20) { score -= 10; factors.push('too_dark'); }
    else if (metadata.brightness > 220) { score -= 10; factors.push('too_bright_glare'); }
  }

  // Blur detection
  if (metadata.blur_score !== undefined) {
    if (metadata.blur_score < 50) { score -= 15; factors.push('blurry_image'); }
    else if (metadata.blur_score > 150) { score += 8; factors.push('sharp_image'); }
  }

  // Capture source check
  if (metadata.capture_source === 'camera') { score += 5; factors.push('camera_capture'); }
  else if (metadata.capture_source === 'screenshot' || metadata.capture_source === 'upload') {
    score -= 20; factors.push('non_camera_source_flagged');
  }

  // Clamp score
  score = Math.max(0, Math.min(100, score));

  let recommendation = 'manual_review';
  if (score >= 80) recommendation = 'likely_genuine';
  else if (score < 40) recommendation = 'likely_poor_quality_resubmit';

  return { score, factors, recommendation };
}

// ---------------------------------------------------------------------------
// Face match scoring (heuristic — based on liveness + capture data)
// ---------------------------------------------------------------------------

/**
 * Estimate face match confidence from selfie capture metadata + liveness data.
 * In production this would call a face comparison API (e.g. AWS Rekognition,
 * Azure Face API, or a self-hosted model). Here we use available signals.
 *
 * @param {object} selfieMetadata - selfie capture_metadata
 * @param {object} documentMetadata - document front capture_metadata
 * @returns {{ score: number, factors: string[] }}
 */
function assessFaceMatch(selfieMetadata = {}, documentMetadata = {}) {
  let score = 50;
  const factors = [];

  // Liveness completion is the strongest signal
  if (selfieMetadata.liveness_completed === true) {
    score += 25;
    factors.push('liveness_verified');

    // Pose challenge completion
    const posesCompleted = selfieMetadata.poses_completed || [];
    if (posesCompleted.length >= 3) { score += 10; factors.push('multiple_poses_completed'); }
    if (posesCompleted.length >= 5) { score += 5; factors.push('full_pose_set'); }
  } else {
    score -= 30;
    factors.push('liveness_not_completed');
  }

  // Face detection in selfie
  if (selfieMetadata.face_detected === true) { score += 10; factors.push('face_detected_in_selfie'); }
  else if (selfieMetadata.face_detected === false) { score -= 25; factors.push('no_face_in_selfie'); }

  // Face detection in document
  if (documentMetadata.face_detected === true) { score += 5; factors.push('face_detected_in_document'); }
  else if (documentMetadata.face_detected === false) { score -= 10; factors.push('no_face_in_document'); }

  // Eye distance / face angle (if available from on-device ML)
  if (selfieMetadata.face_angle !== undefined) {
    const angle = Math.abs(selfieMetadata.face_angle);
    if (angle < 15) { score += 8; factors.push('frontal_pose'); }
    else if (angle > 30) { score -= 10; factors.push('excessive_face_angle'); }
  }

  // Blink detection
  if (selfieMetadata.blink_detected === true) { score += 10; factors.push('blink_detected'); }
  else if (selfieMetadata.blink_detected === false) { score -= 5; factors.push('no_blink_detected'); }

  score = Math.max(0, Math.min(100, score));
  return { score, factors };
}

// ---------------------------------------------------------------------------
// Liveness confidence scoring
// ---------------------------------------------------------------------------

function assessLiveness(selfieMetadata = {}) {
  let score = 30;
  const factors = [];

  if (selfieMetadata.liveness_completed === true) {
    score = 70;
    factors.push('liveness_challenge_completed');

    if (selfieMetadata.poses_completed?.length >= 3) {
      score += 15;
      factors.push(`${selfieMetadata.poses_completed.length}_poses_completed`);
    }
    if (selfieMetadata.blink_detected === true) { score += 10; factors.push('blink_detected'); }
    if (selfieMetadata.head_rotation_detected === true) { score += 5; factors.push('head_rotation_detected'); }

    // Anti-spoofing signals
    if (selfieMetadata.screen_replay_detected === true) { score -= 30; factors.push('screen_replay_suspected'); }
    if (selfieMetadata.printed_photo_detected === true) { score -= 30; factors.push('printed_photo_suspected'); }
    if (selfieMetadata.mask_detected === true) { score -= 25; factors.push('mask_suspected'); }
  } else {
    factors.push('liveness_not_completed');
  }

  score = Math.max(0, Math.min(100, score));
  return { score, factors };
}

// ---------------------------------------------------------------------------
// Fraud indicators
// ---------------------------------------------------------------------------

/**
 * Check for fraud indicators across the submission.
 * @param {object} params - { evidence, userMetadata, deviceFingerprint, caseHistory }
 * @returns {{ indicators: string[], riskLevel: string, riskScore: number }}
 */
function assessFraudIndicators({ evidence = [], userMetadata = {}, deviceFingerprint = null, caseHistory = [] } = {}) {
  const indicators = [];
  let riskScore = 0;

  // Multiple accounts on same device
  if (deviceFingerprint?.user_count > 3) {
    indicators.push('multiple_accounts_same_device');
    riskScore += 30;
  } else if (deviceFingerprint?.user_count > 1) {
    indicators.push('shared_device');
    riskScore += 10;
  }

  // Device is banned
  if (deviceFingerprint?.is_banned) {
    indicators.push('banned_device');
    riskScore += 50;
  }

  // Previous KYC rejections
  const rejections = caseHistory.filter(c => c.status === 'rejected');
  if (rejections.length >= 2) {
    indicators.push('multiple_kyc_rejections');
    riskScore += 25;
  } else if (rejections.length === 1) {
    indicators.push('prior_kyc_rejection');
    riskScore += 10;
  }

  // Document hash reuse (same document uploaded by different user)
  const docHashes = evidence
    .filter(e => e.evidence_kind?.includes('identity_document'))
    .map(e => e.checksum_sha256);
  const uniqueHashes = new Set(docHashes);
  if (docHashes.length > 0 && uniqueHashes.size < docHashes.length) {
    indicators.push('duplicate_document_within_case');
    riskScore += 15;
  }

  // Non-camera capture source
  const hasNonCamera = evidence.some(e =>
    e.capture_metadata?.capture_source &&
    e.capture_metadata.capture_source !== 'camera'
  );
  if (hasNonCamera) {
    indicators.push('non_camera_capture_source');
    riskScore += 15;
  }

  // VPN/Proxy detection (from metadata)
  if (userMetadata.vpn_detected === true) {
    indicators.push('vpn_detected');
    riskScore += 10;
  }

  // Emulator/root detection
  if (userMetadata.is_emulator === true) {
    indicators.push('emulator_detected');
    riskScore += 30;
  }
  if (userMetadata.is_rooted === true) {
    indicators.push('rooted_device');
    riskScore += 15;
  }

  riskScore = Math.min(100, riskScore);

  let riskLevel = 'clear';
  if (riskScore >= 50) riskLevel = 'high';
  else if (riskScore >= 25) riskLevel = 'medium';
  else if (riskScore >= 10) riskLevel = 'low';

  return { indicators, riskLevel, riskScore };
}

// ---------------------------------------------------------------------------
// OCR text extraction (stub — replace with Tesseract/cloud OCR API)
// ---------------------------------------------------------------------------

/**
 * Extract text from a document image.
 * Currently returns a placeholder — in production this would call:
 *  - Google Cloud Vision API (documentTextDetection)
 *  - AWS Textract (detectDocumentText)
 *  - Azure Form Recognizer
 *  - On-device Tesseract (via Flutter plugin)
 *
 * @param {object} evidence - evidence record with storage_object_key
 * @returns {{ extracted: object|null, confidence: number }}
 */
function extractDocumentText(evidence) {
  // Stub: return null until an OCR provider is configured.
  // The admin review workflow works without OCR — the reviewer manually
  // inspects the document image. OCR adds automation but is not required.
  return { extracted: null, confidence: 0 };
}

// ---------------------------------------------------------------------------
// Overall AI recommendation
// ---------------------------------------------------------------------------

/**
 * Generate the complete AI verification package for admin review.
 *
 * @param {object} params
 * @returns {{ overallScore: number, recommendation: string, breakdown: object, fraudCheck: object }}
 */
function generateVerificationPackage({
  documentMetadata = {},
  selfieMetadata = {},
  evidence = [],
  userMetadata = {},
  deviceFingerprint = null,
  caseHistory = [],
} = {}) {
  const docQuality = assessDocumentQuality(documentMetadata);
  const faceMatch = assessFaceMatch(selfieMetadata, documentMetadata);
  const liveness = assessLiveness(selfieMetadata);
  const fraud = assessFraudIndicators({ evidence, userMetadata, deviceFingerprint, caseHistory });

  // Weighted overall score
  const overallScore = Math.round(
    docQuality.score * 0.20 +
    faceMatch.score * 0.35 +
    liveness.score * 0.25 +
    (100 - fraud.riskScore) * 0.20
  );

  let recommendation = 'manual_review';
  if (overallScore >= 80 && fraud.riskLevel === 'clear') {
    recommendation = 'approve';
  } else if (overallScore < 40 || fraud.riskLevel === 'high') {
    recommendation = 'reject';
  } else if (docQuality.recommendation === 'likely_poor_quality_resubmit') {
    recommendation = 'request_resubmission';
  }

  return {
    overallScore,
    recommendation,
    breakdown: {
      document_quality: docQuality,
      face_match: faceMatch,
      liveness: liveness,
      fraud_check: fraud,
    },
    timestamp: new Date().toISOString(),
  };
}

module.exports = {
  assessDocumentQuality,
  assessFaceMatch,
  assessLiveness,
  assessFraudIndicators,
  extractDocumentText,
  generateVerificationPackage,
};
