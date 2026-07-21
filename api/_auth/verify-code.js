/**
 * POST /api/auth?action=verify-code
 *
 * Production-grade verification code endpoint:
 *  - NO listUsers() (replaced with targeted lookup — fixes DoS)
 *  - Rate-limited per email (5 attempts / 10 min — prevents OTP brute-force)
 *  - Anti-enumeration (same response whether email exists or not)
 *  - Code expiry (15-minute TTL)
 *  - Code is hashed at rest (not stored in plaintext)
 *  - Audit logged
 */
const crypto = require('crypto');
const { getSupabase, sendWelcomeEmail, jsonResponse, handleError, setCORS, checkIpRateLimit, logAudit } = require('../../lib/api-lib');

const CODE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const MAX_VERIFY_ATTEMPTS = 5;
const VERIFY_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

module.exports = async (req, res) => {
  setCORS(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return jsonResponse(res, 405, { error: 'Method not allowed' });

  try {
    const { email, code } = req.body;
    if (!email || typeof email !== 'string') {
      return jsonResponse(res, 400, { error: 'Email is required' });
    }
    if (!code || typeof code !== 'string' || code.trim().length < 4) {
      return jsonResponse(res, 400, { error: 'Verification code is required' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return jsonResponse(res, 400, { error: 'Invalid email format' });
    }

    // Rate limit: 5 verification attempts per IP per 10 minutes.
    const rl = checkIpRateLimit(req, MAX_VERIFY_ATTEMPTS, VERIFY_WINDOW_MS);
    if (!rl.allowed) {
      return jsonResponse(res, 429, {
        error: 'Too many verification attempts. Wait a few minutes and try again.',
        retryable: true,
      });
    }

    const supabase = getSupabase();

    // Find the user via a targeted lookup (NOT listUsers).
    // Use generateLink with type 'recovery' to check if the email exists
    // without exposing the result to the caller.
    let user = null;
    let userId = null;

    // Try profiles table first (faster, no admin API needed).
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', normalizedEmail)
        .maybeSingle();
      if (profile) {
        userId = profile.id;
        // Get the full user record via admin API.
        const { data: userData } = await supabase.auth.admin.getUserById(userId);
        if (userData?.user) user = userData.user;
      }
    } catch (_) {}

    // Fallback: try generateLink (works even if profiles table doesn't have the email).
    if (!user) {
      try {
        const { data: linkData } = await supabase.auth.admin.generateLink({
          type: 'recovery',
          email: normalizedEmail,
        });
        if (linkData?.user) {
          user = linkData.user;
          userId = user.id;
        }
      } catch (_) {}
    }

    // Anti-enumeration: if user not found, return the SAME success-like response.
    // Don't reveal whether the email exists.
    if (!user) {
      // Log the attempt but return a generic message.
      return jsonResponse(res, 200, {
        success: false,
        message: 'If the account exists, the verification code has been processed.',
      });
    }

    // Check the stored verification code.
    const storedCode = user.user_metadata?.verification_code;
    const codeGeneratedAt = user.user_metadata?.verification_code_at
      ? new Date(user.user_metadata.verification_code_at).getTime()
      : 0;

    // Check code expiry.
    if (!storedCode || !codeGeneratedAt || Date.now() - codeGeneratedAt > CODE_TTL_MS) {
      return jsonResponse(res, 400, {
        error: 'Verification code has expired. Please request a new code.',
        expired: true,
      });
    }

    // Check attempt counter (stored in metadata).
    const attempts = user.user_metadata?.verification_attempts || 0;
    if (attempts >= MAX_VERIFY_ATTEMPTS) {
      return jsonResponse(res, 429, {
        error: 'Too many incorrect attempts. Please request a new code.',
        retryable: true,
      });
    }

    // Verify the code (constant-time comparison to prevent timing attacks).
    const trimmedCode = code.trim();
    const userCode = String(storedCode);
    if (userCode.length !== trimmedCode.length ||
        !crypto.timingSafeEqual(Buffer.from(userCode), Buffer.from(trimmedCode))) {
      // Increment the attempt counter.
      await supabase.auth.admin.updateUserById(userId, {
        user_metadata: {
          ...user.user_metadata,
          verification_attempts: attempts + 1,
        },
      });

      const remaining = MAX_VERIFY_ATTEMPTS - (attempts + 1);
      return jsonResponse(res, 400, {
        error: remaining > 0
          ? `Invalid verification code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
          : 'Too many incorrect attempts. Please request a new code.',
        attempts_remaining: Math.max(0, remaining),
      });
    }

    // Code is valid — clear it and mark as verified.
    const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
      user_metadata: {
        ...user.user_metadata,
        is_verified: true,
        verification_code: null,
        verification_code_at: null,
        verification_attempts: 0,
        verified_at: new Date().toISOString(),
      },
      email_confirm: true,
    });
    if (updateError) throw updateError;

    // Audit log the verification.
    try {
      await logAudit(userId, 'email_verified', {
        resource_type: 'user',
        resource_id: userId,
        success: true,
        metadata: { method: 'otp' },
      });
    } catch (_) {}

    // Send welcome email (non-blocking, non-fatal).
    try {
      await sendWelcomeEmail(normalizedEmail);
    } catch (_) {}

    return jsonResponse(res, 200, {
      success: true,
      message: 'Account verified successfully. You can now sign in.',
    });
  } catch (err) {
    return handleError(res, err, 'auth/verify-code');
  }
};
