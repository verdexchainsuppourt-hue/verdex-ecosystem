/**
 * POST /api/auth?action=reset-password
 *
 * Verifies the reset code and updates the user's password.
 * Does NOT require an active session (user is locked out).
 *
 * Flow:
 *  1. User requests reset code via /api/auth?action=send-code (reason: 'reset')
 *  2. User receives email with 6-digit code
 *  3. User submits code + new password via this endpoint
 *  4. Backend verifies code, updates password, clears code
 *  5. User signs in with new password
 */
const crypto = require('crypto');
const { getSupabase, jsonResponse, handleError, setCORS, checkIpRateLimit, logAudit } = require('../../lib/api-lib');

const CODE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 5;

module.exports = async (req, res) => {
  setCORS(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return jsonResponse(res, 405, { error: 'Method not allowed' });

  try {
    const { email, code, new_password } = req.body;
    if (!email || typeof email !== 'string') {
      return jsonResponse(res, 400, { error: 'Email is required' });
    }
    if (!code || typeof code !== 'string' || code.trim().length < 4) {
      return jsonResponse(res, 400, { error: 'Reset code is required' });
    }
    if (!new_password || typeof new_password !== 'string' || new_password.length < 6) {
      return jsonResponse(res, 400, { error: 'New password must be at least 6 characters' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Rate limit: 5 reset attempts per IP per 10 minutes.
    const rl = checkIpRateLimit(req, MAX_ATTEMPTS, 10 * 60 * 1000);
    if (!rl.allowed) {
      return jsonResponse(res, 429, {
        error: 'Too many reset attempts. Wait a few minutes and try again.',
        retryable: true,
      });
    }

    const supabase = getSupabase();

    // Find the user via targeted lookup (NOT listUsers).
    let user = null;
    let userId = null;

    // Try profiles table first.
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', normalizedEmail)
        .maybeSingle();
      if (profile) {
        userId = profile.id;
        const { data: userData } = await supabase.auth.admin.getUserById(userId);
        if (userData?.user) user = userData.user;
      }
    } catch (_) {}

    // Fallback: generateLink.
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

    // Anti-enumeration: don't reveal if user exists.
    if (!user) {
      return jsonResponse(res, 200, {
        success: false,
        message: 'If the account exists, the password has been updated.',
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
        error: 'Reset code has expired. Please request a new code.',
        expired: true,
      });
    }

    // Check attempt counter.
    const attempts = user.user_metadata?.verification_attempts || 0;
    if (attempts >= MAX_ATTEMPTS) {
      return jsonResponse(res, 429, {
        error: 'Too many incorrect attempts. Please request a new code.',
        retryable: true,
      });
    }

    // Verify the code (timing-safe comparison).
    const trimmedCode = code.trim();
    const userCode = String(storedCode);
    if (userCode.length !== trimmedCode.length ||
        !crypto.timingSafeEqual(Buffer.from(userCode), Buffer.from(trimmedCode))) {
      // Increment attempt counter.
      await supabase.auth.admin.updateUserById(userId, {
        user_metadata: {
          ...user.user_metadata,
          verification_attempts: attempts + 1,
        },
      });

      const remaining = MAX_ATTEMPTS - (attempts + 1);
      return jsonResponse(res, 400, {
        error: remaining > 0
          ? `Invalid reset code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
          : 'Too many incorrect attempts. Please request a new code.',
      });
    }

    // Code is valid — update the password.
    const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
      password: new_password,
      user_metadata: {
        ...user.user_metadata,
        verification_code: null,
        verification_code_at: null,
        verification_attempts: 0,
        password_reset_at: new Date().toISOString(),
      },
    });

    if (updateError) {
      return jsonResponse(res, 500, { error: 'Failed to update password. Please try again.' });
    }

    // Audit log.
    try {
      await logAudit(userId, 'password_reset', {
        resource_type: 'user',
        resource_id: userId,
        success: true,
        metadata: { method: 'code' },
      });
    } catch (_) {}

    return jsonResponse(res, 200, {
      success: true,
      message: 'Password updated successfully. Sign in with your new password.',
    });
  } catch (err) {
    return handleError(res, err, 'auth/reset-password');
  }
};
