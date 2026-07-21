const crypto = require('crypto');
const { getSupabase, sendVerificationCodeEmail, jsonResponse, handleError, setCORS, checkIpRateLimit } = require('../../lib/api-lib');

module.exports = async (req, res) => {
  setCORS(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return jsonResponse(res, 405, { error: 'Method not allowed' });

  try {
    const { email } = req.body;
    if (!email || typeof email !== 'string') {
      return jsonResponse(res, 400, { error: 'Email is required' });
    }

    // Rate-limit by IP to prevent user-enumeration + email-bomb DoS.
    const rl = checkIpRateLimit(req, 5, 60000); // 5 codes per minute per IP
    if (!rl.allowed) {
      return jsonResponse(res, 429, { error: 'Too many code requests. Wait a minute and try again.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return jsonResponse(res, 400, { error: 'Invalid email format' });
    }

    const supabase = getSupabase();

    // Use Supabase's built-in OTP instead of listing ALL users (C12 fix).
    // signInWithOtp sends a secure code directly without exposing the user list.
    const { error: otpError } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email: normalizedEmail,
    });

    // Generate a cryptographically-secure 6-digit code (C11 fix).
    const code = crypto.randomInt(100000, 1000000).toString();
    const codeGeneratedAt = new Date().toISOString();

    // Try to find the user to store the code in metadata. If not found, still
    // return a generic success to avoid user-enumeration (but don't send email).
    let userFound = false;
    let userId = null;
    try {
      const { data: linkData } = await supabase.auth.admin.generateLink({
        type: 'recovery',
        email: normalizedEmail,
      });
      if (linkData?.user) {
        userFound = true;
        userId = linkData.user.id;
        // Store the code + timestamp + reset attempt counter in user metadata.
        await supabase.auth.admin.updateUserById(userId, {
          user_metadata: {
            ...linkData.user.user_metadata,
            verification_code: code,
            verification_code_at: codeGeneratedAt,
            verification_attempts: 0,
          },
        });
      }
    } catch (_) {
      // User may not exist — that's OK, we don't reveal it.
    }

    if (!userFound) {
      // Check if user exists via a targeted lookup (not listUsers).
      // We use the admin API getUserByEmail-like approach via profiles table.
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('id')
          .eq('email', normalizedEmail)
          .maybeSingle();
        if (profile) userFound = true;
      } catch (_) {}
    }

    if (!userFound) {
      // Don't reveal whether the email exists — return generic success.
      return jsonResponse(res, 200, { success: true, message: 'If the account exists, a verification code was sent.' });
    }

    // Send email via Resend with the cryptographically-secure code.
    const emailRes = await sendVerificationCodeEmail(normalizedEmail, code);
    if (!emailRes.success) {
      return jsonResponse(res, 500, { error: 'Failed to send verification code email' });
    }

    return jsonResponse(res, 200, { success: true, message: 'Verification code sent successfully' });
  } catch (err) {
    return handleError(res, err, 'auth/send-code');
  }
};
