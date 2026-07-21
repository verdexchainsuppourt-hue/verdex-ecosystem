const { getSupabase, getResend } = require('../lib/api-lib');

// ============================================
// STUNNING CINEMATIC WELCOME EMAIL (USER SIGNUP)
// ============================================
function buildWelcomeEmail(email) {
  const siteUrl = process.env.SITE_URL || 'https://verdexswap.site';
  
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to Verdex — Your Account is Ready</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;600&display=swap');
    body { background-color: #000; margin: 0; padding: 0; font-family: 'Inter', sans-serif; color: #fff; }
    @media screen and (max-width: 600px) {
      .container { width: 100% !important; padding: 12px !important; }
      .title { font-size: 30px !important; }
    }
  </style>
</head>
<body style="background-color:#000000; margin:0; padding:32px 0;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#000000;">
    <tr>
      <td align="center">
        <table role="presentation" class="container" cellspacing="0" cellpadding="0" border="0" width="580" style="max-width:580px; margin:0 auto; border-radius:24px; overflow:hidden; background:#020802; border:1px solid rgba(0,255,102,0.15); box-shadow:0 30px 60px rgba(0,255,102,0.05);">
          <!-- Header -->
          <tr>
            <td style="padding:48px 40px 24px; text-align:center; background:linear-gradient(180deg, #020d04 0%, #020802 100%);">
              <img src="${siteUrl}/assets/verdex-logo-email.png" width="74" height="74" alt="Verdex Logo" style="display:inline-block; margin-bottom:16px;">
              <h1 style="margin:0; font-family:'Space Grotesk', sans-serif; font-size:28px; font-weight:700; color:#fff; letter-spacing:-0.5px;">VERDEX</h1>
              <p style="margin:6px 0 0; font-family:'Space Grotesk', sans-serif; font-size:11px; color:#00ff66; text-transform:uppercase; letter-spacing:4px;">Account Activated</p>
            </td>
          </tr>
          <!-- Divider -->
          <tr><td style="height:2px; background:linear-gradient(90deg, transparent 0%, #00ff66 50%, transparent 100%);"></td></tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px; text-align:center;">
              <span style="display:inline-block; padding:6px 16px; background:rgba(0,255,102,0.1); border:1px solid rgba(0,255,102,0.25); border-radius:100px; font-size:11px; color:#00ff66; text-transform:uppercase; letter-spacing:2px; font-weight:600; margin-bottom:20px;">✦ Ready to Swap & Mine</span>
              <h2 class="title" style="margin:0 0 20px; font-family:'Space Grotesk', sans-serif; font-size:36px; font-weight:700; color:#fff; line-height:1.2;">Your Verdex Account is Activated</h2>
              <p style="margin:20px 0 32px; font-size:15px; line-height:1.7; color:#86a389; max-width:440px; margin-left:auto; margin-right:auto;">
                Welcome to the Verdex DePIN ecosystem! Your non-custodial wallet has been initialized and is ready to sign transactions. Start mining from the dashboard to earn Verdex Points (VP) and unlock daily streak multipliers.
              </p>
              <!-- Button -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 auto;">
                <tr>
                  <td style="border-radius:12px; background:linear-gradient(135deg, #00ff66 0%, #00b347 100%);">
                    <a href="${siteUrl}/dashboard.html" target="_blank" style="display:inline-block; padding:16px 36px; font-family:'Space Grotesk', sans-serif; font-size:15px; font-weight:700; color:#000; text-decoration:none; letter-spacing:0.5px;">
                      🚀 Open Mining Dashboard
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Features -->
          <tr>
            <td style="padding:0 40px 32px;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.04); border-radius:16px; padding:20px;">
                <tr>
                  <td style="padding-bottom:12px; font-family:'Space Grotesk', sans-serif; font-size:14px; font-weight:700; color:#fff;">NEXT STEPS:</td>
                </tr>
                <tr>
                  <td style="font-size:13px; color:#86a389; line-height:1.6;">
                    1. <strong>Connect:</strong> Open the dashboard and generate or import your L1 wallet.<br>
                    2. <strong>Mine:</strong> Initialize the hashing engine directly in your browser or download the CLI.<br>
                    3. <strong>Earn:</strong> Earn VP rewards blocks and keep your streaks active for multipliers.
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:32px 40px; text-align:center; background:#010402; border-top:1px solid rgba(0,255,102,0.08);">
              <p style="margin:0 0 8px; font-family:'Space Grotesk', sans-serif; font-size:13px; color:#fff;">VERDEX</p>
              <p style="margin:0; font-size:11px; color:#4a6e50;">This welcome email was sent to <span style="color:#00ff66;">${email}</span> upon successful registration.</p>
              <p style="margin:16px 0 0; font-size:10px; color:rgba(134,163,137,0.4);">Developed by Suleman — Verdex Network © 2026</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

// ============================================
// STUNNING CINEMATIC WAITLIST EMAIL (WAITLIST JOIN)
// ============================================
function buildWaitlistEmail(email) {
  const siteUrl = process.env.SITE_URL || 'https://verdexswap.site';
  
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to Verdex Waitlist — Whitepaper Ready</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;600&display=swap');
    body { background-color: #000; margin: 0; padding: 0; font-family: 'Inter', sans-serif; color: #fff; }
    @media screen and (max-width: 600px) {
      .container { width: 100% !important; padding: 12px !important; }
      .title { font-size: 30px !important; }
    }
  </style>
</head>
<body style="background-color:#000000; margin:0; padding:32px 0;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#000000;">
    <tr>
      <td align="center">
        <table role="presentation" class="container" cellspacing="0" cellpadding="0" border="0" width="580" style="max-width:580px; margin:0 auto; border-radius:24px; overflow:hidden; background:#020802; border:1px solid rgba(0,255,102,0.15); box-shadow:0 30px 60px rgba(0,255,102,0.05);">
          <!-- Header -->
          <tr>
            <td style="padding:48px 40px 24px; text-align:center; background:linear-gradient(180deg, #020d04 0%, #020802 100%);">
              <img src="${siteUrl}/assets/verdex-logo-email.png" width="74" height="74" alt="Verdex Logo" style="display:inline-block; margin-bottom:16px;">
              <h1 style="margin:0; font-family:'Space Grotesk', sans-serif; font-size:28px; font-weight:700; color:#fff; letter-spacing:-0.5px;">VERDEX</h1>
              <p style="margin:6px 0 0; font-family:'Space Grotesk', sans-serif; font-size:11px; color:#00ff66; text-transform:uppercase; letter-spacing:4px;">Waitlist Confirmed</p>
            </td>
          </tr>
          <!-- Divider -->
          <tr><td style="height:2px; background:linear-gradient(90deg, transparent 0%, #00ff66 50%, transparent 100%);"></td></tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px; text-align:center;">
              <span style="display:inline-block; padding:6px 16px; background:rgba(0,255,102,0.1); border:1px solid rgba(0,255,102,0.25); border-radius:100px; font-size:11px; color:#00ff66; text-transform:uppercase; letter-spacing:2px; font-weight:600; margin-bottom:20px;">✦ Position Secured</span>
              <h2 class="title" style="margin:0 0 20px; font-family:'Space Grotesk', sans-serif; font-size:36px; font-weight:700; color:#fff; line-height:1.2;">Welcome to the waitlist!</h2>
              <p style="margin:20px 0 32px; font-size:15px; line-height:1.7; color:#86a389; max-width:440px; margin-left:auto; margin-right:auto;">
                Thank you for joining the Verdex waitlist! Your early access position is confirmed. Read our technical whitepaper to explore our L1 DePIN consensus model, AMM mechanics, and token economics.
              </p>
              <!-- Button -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 auto;">
                <tr>
                  <td style="border-radius:12px; background:linear-gradient(135deg, #00ff66 0%, #00b347 100%);">
                    <a href="${siteUrl}/assets/verdex-whitepaper.pdf" target="_blank" style="display:inline-block; padding:16px 36px; font-family:'Space Grotesk', sans-serif; font-size:15px; font-weight:700; color:#000; text-decoration:none; letter-spacing:0.5px;">
                      ⬇ Download Whitepaper PDF
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Roadmap -->
          <tr>
            <td style="padding:0 40px 32px;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.04); border-radius:16px; padding:20px;">
                <tr>
                  <td style="padding-bottom:12px; font-family:'Space Grotesk', sans-serif; font-size:14px; font-weight:700; color:#fff; text-align:center;">ROADMAP PROGRESS:</td>
                </tr>
                <tr>
                  <td style="font-size:13px; color:#86a389; line-height:1.6;">
                    ✓ <strong>Phase 1:</strong> Foundations, Whitepaper & Branding (Complete)<br>
                    ⚡ <strong>Phase 2:</strong> Smart Contract Audits & Browser testnet (In Progress)<br>
                    💎 <strong>Phase 3:</strong> VDX L1 Mainnet Token Generation (December 12, 2026)
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:32px 40px; text-align:center; background:#010402; border-top:1px solid rgba(0,255,102,0.08);">
              <p style="margin:0 0 8px; font-family:'Space Grotesk', sans-serif; font-size:13px; color:#fff;">VERDEX</p>
              <p style="margin:0; font-size:11px; color:#4a6e50;">You received this because you submitted your email to the waitlist on our website.</p>
              <p style="margin:16px 0 0; font-size:10px; color:rgba(134,163,137,0.4);">Developed by Suleman — Verdex Network © 2026</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

module.exports = async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', 'https://verdexswap.site');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email, type } = req.body;
    const isSignup = type === 'signup';

    // Validate email
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Please provide a valid email address.' });
    }

    const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    // --- SECURITY: Rate limit checking (Max 3 submissions per IP per hour) ---
    if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      try {
        const oneHourAgo = new Date(Date.now() - 3600 * 1000).toISOString();
        const { count, error: countError } = await getSupabase()
          .from('waitlist')
          .select('id', { count: 'exact', head: true })
          .eq('ip_address', ipAddress)
          .gt('created_at', oneHourAgo);

        if (!countError && count !== null && count >= 3) {
          return res.status(429).json({ error: 'Too many requests. Please try again in an hour.' });
        }
      } catch (err) {
        console.error('Rate limit query exception:', err);
      }
    }

    // --- STEP 1: Store waitlist email in Supabase (if waitlist flow) ---
    let supabaseSuccess = false;
    let isDuplicate = false;
    let supabaseError = null;

    if (!isSignup) {
      if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
        try {
          const { data: existingUser, error: checkError } = await getSupabase()
            .from('waitlist')
            .select('email')
            .eq('email', email)
            .limit(1);

          if (checkError) {
            supabaseError = checkError.message;
          } else if (existingUser && existingUser.length > 0) {
            isDuplicate = true;
          } else {
            const { error: insertError } = await getSupabase()
              .from('waitlist')
              .insert([
                {
                  email: email,
                  ip_address: ipAddress,
                  user_agent: userAgent,
                  email_sent: false
                }
              ]);

            if (insertError) {
              supabaseError = insertError.message;
            } else {
              supabaseSuccess = true;
            }
          }
        } catch (sbErr) {
          supabaseError = sbErr.message;
        }
      } else {
        supabaseError = 'Supabase credentials not configured';
      }
    }

    // --- STEP 2: Send email via Resend ---
    let emailSent = false;
    let emailError = null;
    const emailSubject = isSignup 
      ? '🌿 Welcome to Verdex — Your Account is Ready!' 
      : '🌿 Welcome to the Verdex Waitlist — Whitepaper Ready';
    const emailHtml = isSignup ? buildWelcomeEmail(email) : buildWaitlistEmail(email);

    if (process.env.RESEND_API_KEY) {
      try {
        const { data, error } = await getResend().emails.send({
          from: process.env.FROM_EMAIL || 'Verdex <onboarding@resend.dev>',
          to: [email],
          subject: emailSubject,
          html: emailHtml,
        });

        if (error) {
          emailError = typeof error === 'object' ? JSON.stringify(error) : String(error);
        } else {
          emailSent = true;

          // Update waitlist sent status if waitlist entry succeeded
          if (supabaseSuccess && !isSignup) {
            await getSupabase()
              .from('waitlist')
              .update({ email_sent: true })
              .eq('email', email);
          }
        }
      } catch (rsErr) {
        emailError = rsErr.message;
      }
    } else {
      emailError = 'RESEND_API_KEY not configured';
    }

    // --- STEP 3: Return success response ---
    let message = isSignup
      ? "Welcome to Verdex! Check your inbox for account confirmation."
      : "You're on the list! We'll be in touch soon.";
      
    if (emailSent && !isSignup) {
      message = "Welcome aboard! Check your inbox for the whitepaper download.";
    } else if (isDuplicate && !isSignup) {
      message = "You're already on the waitlist! We've resent the whitepaper to your inbox.";
    }

    return res.status(200).json({
      success: true,
      message: message,
      emailSent: emailSent,
      storedInDatabase: supabaseSuccess,
      isDuplicate: isDuplicate
    });

  } catch (err) {
    console.error('Waitlist error:', err);
    return res.status(200).json({ success: false, error: 'Something went wrong. Please try again.' });
  }
};
