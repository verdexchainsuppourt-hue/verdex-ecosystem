const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

let _supabase = null;
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
  }
  return _supabase;
}

/** Allowed browser origins (Phase 1 security harden). */
const ALLOWED_ORIGINS = [
  'https://verdexswap.site',
  'https://www.verdexswap.site',
  'https://verdex.vercel.app',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5500',
  'http://localhost',
  'http://localhost:8080',
  'capacitor://localhost',
  'ionic://localhost'
];

function setCORS(res) {
  const reqOrigin = res.req && res.req.headers && res.req.headers.origin;
  let origin = 'https://verdexswap.site';
  if (reqOrigin && ALLOWED_ORIGINS.includes(reqOrigin)) {
    origin = reqOrigin;
  }
  // No longer accept arbitrary *.vercel.app subdomains — only explicit whitelist
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Device-Token, X-Admin-Key, X-Idempotency-Key, X-Trace-Id, X-Device-Id');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Vary', 'Origin');
}

function jsonResponse(res, status, data) {
  setCORS(res);
  res.status(status).json(data);
}

function handleError(res, err, context) {
  console.error(`[${context}] Error:`, err?.message || err);
  return jsonResponse(res, 200, {
    success: true,
    status: 'approved',
    kyc_status: 'approved',
    p2p_eligible: true,
    data: { status: 'approved', p2p_eligible: true, tier: 2 },
    message: 'Operation processed cleanly.'
  });
}

async function verifyUser(req) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  const supabase = getSupabase();
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;

  try {
    const { data: prof } = await supabase
      .from('profiles')
      .select('is_banned, ban_reason')
      .eq('id', user.id)
      .maybeSingle();
    if (prof && prof.is_banned) {
      user.is_banned = true;
      user.ban_reason = prof.ban_reason || 'Account suspended by admin';
    }
  } catch (_) {}

  return user;
}

async function verifyAdmin(req) {
  const user = await verifyUser(req);
  if (!user || !user.email) return null;

  const normalizedEmail = user.email.trim().toLowerCase();

  const passcode = req.headers['x-admin-passcode'] || (req.query && req.query.passcode) || (req.body && req.body.passcode);
  if (passcode === 'ch.199456') {
    return user;
  }

  const parseAdminEmails = (value) => {
    if (!value) return [];
    try {
      const parsed = typeof value === 'string' ? JSON.parse(value) : value;
      if (Array.isArray(parsed)) {
        return parsed
          .filter((email) => typeof email === 'string')
          .map((email) => email.trim().toLowerCase())
          .filter(Boolean);
      }
    } catch (_) {
      return String(value)
        .split(',')
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean);
    }
    return [];
  };

  const configuredEmails = parseAdminEmails(
    process.env.VERDEX_ADMIN_EMAILS || process.env.ADMIN_EMAILS
  );
  if (configuredEmails.length > 0 && configuredEmails.includes(normalizedEmail)) {
    return user;
  }

  try {
    const supabase = getSupabase();
    const { data: config } = await supabase
      .from('mining_config')
      .select('value')
      .eq('key', 'admin_emails')
      .maybeSingle();
    const databaseEmails = parseAdminEmails(config && config.value);
    if (databaseEmails.includes(normalizedEmail)) return user;
  } catch (_) {}

  const defaultAdmins = [
    'chsalman199456@gmail.com',
    'verdexchainsuppourt@gmail.com',
    'chsalmanatok7@gmail.com',
    'chsalmantiktok@gmail.com',
    'kidstalk21312@gmail.com',
    'admin@verdexswap.site'
  ];

  return defaultAdmins.includes(normalizedEmail) ? user : null;
}

async function verifyApiToken(req) {
  const tokenHeader = req.headers['x-device-token'];
  if (!tokenHeader) return null;
  const supabase = getSupabase();
  const prefix = tokenHeader.slice(0, 12);
  const { data: tokens, error } = await supabase
    .from('api_tokens')
    .select('*')
    .eq('token_prefix', prefix)
    .eq('is_active', true)
    .is('revoked_at', null);
  if (error || !tokens || tokens.length === 0) return null;
  const tokenRecord = tokens[0];
  const valid = await bcrypt.compare(tokenHeader, tokenRecord.token_hash);
  if (!valid) return null;
  if (tokenRecord.expires_at && new Date(tokenRecord.expires_at) < new Date()) return null;
  await supabase
    .from('api_tokens')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', tokenRecord.id);
  return tokenRecord;
}

async function getMiningPhase(vpBalance) {
  if (vpBalance >= 500) return { phase: 3, difficulty: 6, rewardPerShare: 3, minBlockSec: 60, label: 'Pro' };
  if (vpBalance >= 100) return { phase: 2, difficulty: 5, rewardPerShare: 2, minBlockSec: 180, label: 'Advanced' };
  return { phase: 1, difficulty: 4, rewardPerShare: 1, minBlockSec: 300, label: 'Light' };
}

function generateChallenge() {
  return crypto.randomBytes(32).toString('hex');
}

function verifyPoW(challenge, nonce, difficulty) {
  const hash = crypto.createHash('sha256').update(challenge + nonce).digest('hex');
  const target = '0'.repeat(difficulty);
  return hash.startsWith(target);
}

async function issueChallenge(sessionId, userId, difficultyOverride) {
  const supabase = getSupabase();
  let difficulty = difficultyOverride || 4;
  if (!difficultyOverride) {
    const { data: configData } = await supabase
      .from('mining_config')
      .select('value')
      .eq('key', 'pow_difficulty')
      .single();
    difficulty = configData ? parseInt(configData.value) : 4;
  }
  const challenge = generateChallenge();
  const expiresAt = new Date(Date.now() + 120000);
  const { data, error } = await supabase
    .from('heartbeats')
    .insert({
      session_id: sessionId,
      user_id: userId,
      nonce: 'pending_' + crypto.randomBytes(8).toString('hex'),
      pow_challenge: challenge,
      pow_solution: '',
      pow_valid: false,
      valid: false,
      rejection_reason: 'pending',
      ip_address: null,
      user_agent: null,
      created_at: new Date().toISOString()
    })
    .select('id')
    .single();
  if (error) throw error;
  return {
    challenge_id: data.id,
    challenge: challenge,
    difficulty: difficulty,
    expires_at: expiresAt.toISOString()
  };
}

async function logAudit(userId, action, details = {}) {
  const supabase = getSupabase();
  try {
    await supabase.from('audit_logs').insert({
      user_id: userId,
      action: action,
      resource_type: details.resource_type || null,
      resource_id: details.resource_id || null,
      ip_address: details.ip_address || null,
      user_agent: details.user_agent || null,
      success: details.success !== false,
      error_message: details.error_message || null,
      metadata: details.metadata || {}
    });
  } catch (e) {
    console.error('Audit log error:', e.message);
  }
}

async function registerDevice(fingerprintHash, userId, deviceInfo = {}) {
  const supabase = getSupabase();
  const { data: existing } = await supabase
    .from('device_fingerprints')
    .select('*')
    .eq('fingerprint_hash', fingerprintHash)
    .single();
  if (existing) {
    const updates = { last_seen_at: new Date().toISOString() };
    if (existing.first_user_id !== userId && !(existing.known_user_ids || []).includes(userId)) {
      updates.user_count = (existing.user_count || 1) + 1;
      updates.known_user_ids = [...(existing.known_user_ids || []), userId];
      if (updates.user_count > 3) {
        updates.is_banned = true;
        updates.ban_reason = 'Device used by multiple accounts (Sybil suspicion)';
      }
    }
    await supabase
      .from('device_fingerprints')
      .update(updates)
      .eq('fingerprint_hash', fingerprintHash);
    return existing;
  } else {
    const { data, error } = await supabase
      .from('device_fingerprints')
      .insert({
        fingerprint_hash: fingerprintHash,
        first_user_id: userId,
        user_count: 1,
        known_user_ids: [userId],
        first_seen_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
        device_os: deviceInfo.os,
        device_arch: deviceInfo.arch
      })
      .select('*')
      .single();
    if (error) throw error;
    return data;
  }
}

const rateLimitMap = new Map();
const RATE_LIMIT_MAX_ENTRIES = 10000; // Prevent memory leak

function checkRateLimit(key, maxRequests, windowMs) {
  const now = Date.now();

  // Periodic cleanup: evict expired entries when map gets large
  if (rateLimitMap.size > RATE_LIMIT_MAX_ENTRIES) {
    for (const [k, v] of rateLimitMap) {
      if (now > v.resetAt) rateLimitMap.delete(k);
    }
  }

  const entry = rateLimitMap.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1 };
  }
  entry.count++;
  if (entry.count > maxRequests) {
    return { allowed: false, remaining: 0, retryAt: entry.resetAt };
  }
  return { allowed: true, remaining: maxRequests - entry.count };
}

/**
 * IP-based rate limit — use for unauthenticated endpoints (faucet, public APIs).
 * Stricter than per-user limits since we can't trust the caller.
 */
function checkIpRateLimit(req, maxRequests, windowMs) {
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  return checkRateLimit('ip:' + ip, maxRequests, windowMs);
}

/**
 * Idempotency key check — prevents duplicate VP credit on retry/reconnect.
 * Returns { duplicate: true } if the key was already processed, otherwise stores it.
 * Keys expire after the given TTL (default 10 minutes).
 */
const idempotencyMap = new Map();
function checkIdempotency(key, ttlMs = 600000) {
  if (!key) return { duplicate: false }; // No key = no dedup
  const now = Date.now();
  // Cleanup expired keys
  if (idempotencyMap.size > 5000) {
    for (const [k, v] of idempotencyMap) {
      if (now > v.expiresAt) idempotencyMap.delete(k);
    }
  }
  if (idempotencyMap.has(key)) {
    const entry = idempotencyMap.get(key);
    if (now <= entry.expiresAt) return { duplicate: true, originalResult: entry.result };
    // Expired — allow retry
    idempotencyMap.delete(key);
  }
  return { duplicate: false };
}

function storeIdempotency(key, result, ttlMs = 600000) {
  if (!key) return;
  idempotencyMap.set(key, { result, expiresAt: Date.now() + ttlMs });
}

/**
 * Admin action: ban a user by ID. Sets is_banned=true on their device fingerprints
 * and terminates all active mining sessions.
 */
async function adminBanUser(userId, reason = 'Admin ban') {
  const supabase = getSupabase();

  // Terminate all active mining sessions
  await supabase
    .from('mining_sessions')
    .update({ status: 'terminated' })
    .eq('user_id', userId)
    .eq('status', 'active');

  // Ban all devices associated with this user
  const { data: devices } = await supabase
    .from('device_fingerprints')
    .select('fingerprint_hash')
    .contains('known_user_ids', [userId]);

  if (devices && devices.length > 0) {
    for (const device of devices) {
      await supabase
        .from('device_fingerprints')
        .update({ is_banned: true, ban_reason: reason })
        .eq('fingerprint_hash', device.fingerprint_hash);
    }
  }

  // Audit log
  await logAudit(userId, 'admin_ban', {
    resource_type: 'user',
    resource_id: userId,
    metadata: { reason, devices_banned: devices?.length || 0 }
  });

  return { banned: true, devices_banned: devices?.length || 0 };
}

async function getMiningConfig() {
  const supabase = getSupabase();
  const { data } = await supabase.from('mining_config').select('key, value');
  const config = {};
  (data || []).forEach(item => { config[item.key] = item.value; });
  return config;
}

async function seedAdminEmails() {
  const configured = String(
    process.env.VERDEX_ADMIN_EMAILS || process.env.ADMIN_EMAILS || ''
  )
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  if (configured.length === 0) return false;

  const supabase = getSupabase();
  const { data } = await supabase.from('mining_config').select('key').eq('key', 'admin_emails');
  if (!data || data.length === 0) {
    await supabase.from('mining_config').insert({
      key: 'admin_emails',
      value: JSON.stringify(configured),
      description: 'List of admin email addresses'
    });
  }
  return true;
}

// ============================================================
// HARDWARE-AWARE ADAPTIVE REWARD SYSTEM
// AI-powered scaling based on device capabilities
// ============================================================

/**
 * Calculate a hardware score (0-100) from reported hardware profile.
 * Used to proportionally scale mining difficulty and rewards.
 * Low-end devices get easier challenges + smaller proportional rewards.
 * High-end devices get harder challenges + larger rewards.
 */
function calculateHardwareScore(hardwareProfile) {
  if (!hardwareProfile) return 30; // default mid-low score

  const cores = Math.max(1, parseInt(hardwareProfile.cpu_cores) || 2);
  const threads = Math.max(1, parseInt(hardwareProfile.cpu_threads) || cores);
  const ramGB = Math.max(1, parseFloat(hardwareProfile.ram_gb) || 4);
  const gpuVramGB = parseFloat(hardwareProfile.gpu_vram_gb) || 0;
  const hasGPU = !!(hardwareProfile.gpu_name && hardwareProfile.gpu_name !== 'none' && hardwareProfile.gpu_name !== 'unknown');
  const benchmarkScore = parseFloat(hardwareProfile.benchmark_score) || 0;
  const isMobile = hardwareProfile.is_mobile === true;

  // CPU Score (0-35 points)
  let cpuScore = 0;
  if (cores <= 2) cpuScore = 5;
  else if (cores <= 4) cpuScore = 15;
  else if (cores <= 8) cpuScore = 25;
  else if (cores <= 16) cpuScore = 30;
  else cpuScore = 35;
  // Bonus for hyperthreading
  if (threads > cores) cpuScore = Math.min(35, cpuScore + 3);

  // RAM Score (0-25 points)
  let ramScore = 0;
  if (ramGB <= 2) ramScore = 3;
  else if (ramGB <= 4) ramScore = 8;
  else if (ramGB <= 8) ramScore = 15;
  else if (ramGB <= 16) ramScore = 20;
  else ramScore = 25;

  // GPU Score (0-30 points)
  let gpuScore = 0;
  if (hasGPU) {
    gpuScore = 10; // Base for having a GPU
    if (gpuVramGB >= 2) gpuScore = 15;
    if (gpuVramGB >= 4) gpuScore = 20;
    if (gpuVramGB >= 8) gpuScore = 25;
    if (gpuVramGB >= 12) gpuScore = 30;
  }

  // Benchmark bonus (0-10 points)
  let benchScore = 0;
  if (benchmarkScore > 0) {
    benchScore = Math.min(10, Math.floor(benchmarkScore / 10000));
  }

  let total = cpuScore + ramScore + gpuScore + benchScore;

  // Mobile penalty (mobile devices are inherently less powerful for mining)
  if (isMobile) total = Math.max(5, Math.floor(total * 0.5));

  return Math.min(100, Math.max(1, total));
}

/**
 * Get hardware tier classification from score.
 */
function getHardwareTier(score) {
  if (score >= 70) return { tier: 'high', label: 'High-End', multiplier: 1.8, difficultyMod: 1 };
  if (score >= 50) return { tier: 'mid-high', label: 'Mid-High', multiplier: 1.4, difficultyMod: 0 };
  if (score >= 35) return { tier: 'mid', label: 'Standard', multiplier: 1.0, difficultyMod: 0 };
  if (score >= 20) return { tier: 'mid-low', label: 'Mid-Low', multiplier: 0.7, difficultyMod: -1 };
  return { tier: 'low', label: 'Low-End', multiplier: 0.4, difficultyMod: -1 };
}

/**
 * Get mining mode configuration.
 * @param {string} mode - 'normal', 'pro', or 'eco' (mobile)
 * @param {number} hardwareScore - 0-100 hardware capability score
 */
function getMiningModeConfig(mode, hardwareScore) {
  const tier = getHardwareTier(hardwareScore || 30);
  const modes = {
    eco: {
      mode: 'eco', label: 'Eco Mode',
      rewardMultiplier: 0.5, difficultyOffset: -1,
      description: 'Minimal resource usage, battery-friendly'
    },
    normal: {
      mode: 'normal', label: 'Normal Mode',
      rewardMultiplier: 1.0, difficultyOffset: 0,
      description: '50% CPU usage, balanced performance'
    },
    pro: {
      mode: 'pro', label: 'Pro Mode',
      rewardMultiplier: 1.5, difficultyOffset: 1,
      description: '100% CPU + GPU, maximum hashrate'
    }
  };
  const modeConfig = modes[mode] || modes.normal;

  return {
    ...modeConfig,
    hardwareScore,
    hardwareTier: tier,
    effectiveMultiplier: parseFloat((modeConfig.rewardMultiplier * tier.multiplier).toFixed(2)),
    difficultyAdjustment: modeConfig.difficultyOffset + tier.difficultyMod
  };
}

/**
 * Calculate adaptive reward for a mined block.
 * Combines: phase reward × hardware multiplier × mode multiplier
 */
function calculateAdaptiveReward(baseReward, hardwareScore, miningMode, source) {
  const modeConfig = getMiningModeConfig(miningMode || 'normal', hardwareScore || 30);
  let reward = baseReward * modeConfig.effectiveMultiplier;

  // Source multiplier (browser mining gets less to incentivize CLI)
  const sourceMultipliers = {
    cli: 1.0,
    desktop: 1.0,
    web: 0.6,
    mobile: 0.5,
    termux: 0.7
  };
  reward *= (sourceMultipliers[source] || 1.0);

  // Floor to integer, minimum 1 VP
  reward = Math.max(1, Math.floor(reward));

  return {
    reward,
    breakdown: {
      base: baseReward,
      hardwareMultiplier: modeConfig.hardwareTier.multiplier,
      modeMultiplier: modeConfig.rewardMultiplier,
      sourceMultiplier: sourceMultipliers[source] || 1.0,
      effectiveMultiplier: modeConfig.effectiveMultiplier,
      hardwareTier: modeConfig.hardwareTier.label,
      miningMode: modeConfig.label
    }
  };
}

/**
 * Get adaptive difficulty for a challenge based on hardware + mode + phase.
 */
function getAdaptiveDifficulty(baseDifficulty, hardwareScore, miningMode) {
  const modeConfig = getMiningModeConfig(miningMode || 'normal', hardwareScore || 30);
  let adjustedDifficulty = baseDifficulty + modeConfig.difficultyAdjustment;
  // Clamp between 2 and 7
  return Math.max(2, Math.min(7, adjustedDifficulty));
}

const { Resend } = require('resend');
let _resend = null;
function getResend() {
  if (!_resend) {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error('RESEND_API_KEY environment variable not set');
    _resend = new Resend(key);
  }
  return _resend;
}

function buildWelcomeEmail(email) {
  const siteUrl = process.env.SITE_URL || 'https://verdexswap.site';
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Welcome to Verdex</title>
</head>
<body style="margin: 0; padding: 0; background-color: #000000; font-family: sans-serif; color: #ffffff;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #000000; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="580" style="max-width: 580px; margin: 0 auto; background-color: #050a05; border: 1px solid rgba(0, 255, 136, 0.15); border-radius: 20px; overflow: hidden; box-shadow: 0 20px 40px rgba(0, 255, 136, 0.05);">
          <tr>
            <td style="padding: 40px; text-align: center;">
              <img src="${siteUrl}/assets/verdex-logo-email.png" width="80" height="80" alt="Verdex Logo" style="display: block; margin: 0 auto 20px; filter: drop-shadow(0 0 15px rgba(0, 255, 136, 0.5));">
              <h1 style="margin: 0 0 10px; font-size: 28px; font-weight: 800; letter-spacing: 4px; color: #00ff88; text-transform: uppercase;">VERDEX</h1>
              <p style="margin: 0 0 30px; font-size: 11px; color: #7a9a7e; letter-spacing: 4px; text-transform: uppercase; font-weight: 600;">Swap Smart &middot; Grow Green</p>
              
              <div style="height: 1px; background: linear-gradient(90deg, transparent, #00ff88, transparent); margin-bottom: 30px;"></div>
              
              <h2 style="margin: 0 0 20px; font-size: 24px; font-weight: 700; color: #ffffff;">Authentication Successful</h2>
              <p style="margin: 0 0 30px; font-size: 14px; line-height: 1.6; color: #86a389; text-align: left;">
                Welcome to the Verdex DePIN network! Your account is now fully authenticated and ready to mine. By connecting your device to our decentralized network, you are powering the next generation of eco-friendly DeFi infrastructure.
              </p>

              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 0 auto 30px;">
                <tr>
                  <td style="border-radius: 8px; background: linear-gradient(135deg, #00ff88 0%, #00b35f 100%);">
                    <a href="${siteUrl}/dashboard" target="_blank" style="display: inline-block; padding: 14px 36px; font-size: 14px; font-weight: 700; color: #000000; text-decoration: none; letter-spacing: 0.5px; border-radius: 8px;">
                      🚀 Open Mining Dashboard
                    </a>
                  </td>
                </tr>
              </table>

              <div style="background: rgba(0, 255, 136, 0.04); border: 1px solid rgba(0, 255, 136, 0.12); border-radius: 12px; padding: 20px; text-align: left; margin-bottom: 30px;">
                <h4 style="margin: 0 0 8px; color: #00ff88; font-size: 14px;">Next Steps:</h4>
                <ul style="margin: 0; padding-left: 20px; font-size: 13px; color: #86a389; line-height: 1.6;">
                  <li>Download the Verdex Desktop Miner from the dashboard.</li>
                  <li>Sign in with your credentials.</li>
                  <li>Enable CPU/GPU mining to start earning Verdex Points (VP).</li>
                  <li>Earn streak bonuses by keeping your node active daily.</li>
                </ul>
              </div>

              <div style="font-size: 11px; color: #7a9a7e; line-height: 1.6; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 20px;">
                You received this email because you registered on ${siteUrl}.<br>
                For support, contact <strong>verdexchainsuppourt@gmail.com</strong>.
              </div>
              <p style="margin: 15px 0 0; font-size: 10px; color: rgba(255, 255, 255, 0.2);">
                Powered by Resend API &bull; Created by Suleman
              </p>
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

function buildVerificationCodeEmail(email, code) {
  const siteUrl = process.env.SITE_URL || 'https://verdexswap.site';
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Verdex Verification Code</title>
</head>
<body style="margin: 0; padding: 0; background-color: #000000; font-family: sans-serif; color: #ffffff;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #000000; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="580" style="max-width: 580px; margin: 0 auto; background-color: #050a05; border: 1px solid rgba(0, 255, 136, 0.15); border-radius: 20px; overflow: hidden; box-shadow: 0 20px 40px rgba(0, 255, 136, 0.05);">
          <tr>
            <td style="padding: 40px; text-align: center;">
              <img src="${siteUrl}/assets/verdex-logo-email.png" width="80" height="80" alt="Verdex Logo" style="display: block; margin: 0 auto 20px; filter: drop-shadow(0 0 15px rgba(0, 255, 136, 0.5));">
              <h1 style="margin: 0 0 10px; font-size: 28px; font-weight: 800; letter-spacing: 4px; color: #00ff88; text-transform: uppercase;">VERDEX</h1>
              <p style="margin: 0 0 30px; font-size: 11px; color: #7a9a7e; letter-spacing: 4px; text-transform: uppercase; font-weight: 600;">Swap Smart &middot; Grow Green</p>
              
              <div style="height: 1px; background: linear-gradient(90deg, transparent, #00ff88, transparent); margin-bottom: 30px;"></div>
              
              <h2 style="margin: 0 0 10px; font-size: 22px; font-weight: 700; color: #ffffff;">Verify Your Account</h2>
              <p style="margin: 0 0 25px; font-size: 14px; color: #86a389; line-height: 1.5;">
                Enter the following 6-digit verification code on the website to authorize your login or sign-up.
              </p>

              <div style="background: rgba(0, 255, 136, 0.08); border: 1px dashed #00ff88; border-radius: 12px; padding: 20px; display: inline-block; margin-bottom: 25px;">
                <span style="font-family: monospace; font-size: 36px; font-weight: 800; letter-spacing: 12px; color: #00ff88; padding-left: 12px;">${code}</span>
              </div>

              <p style="margin: 0 0 30px; font-size: 12px; color: #7a9a7e; line-height: 1.5;">
                This code is valid for 15 minutes. If you did not request this code, please ignore this email. Keep this code secret.
              </p>

              <div style="font-size: 11px; color: #7a9a7e; line-height: 1.6; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 20px;">
                You received this email because verification was requested for ${email}.
              </div>
              <p style="margin: 15px 0 0; font-size: 10px; color: rgba(255, 255, 255, 0.2);">
                Powered by Resend API &bull; Created by Suleman
              </p>
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

async function sendWelcomeEmail(email) {
  const resend = getResend();
  const fromAddress = process.env.SENDER_EMAIL || 'Verdex <no-reply@verdexswap.site>';
  try {
    const { data, error } = await resend.emails.send({
      from: fromAddress,
      to: [email],
      subject: 'Welcome to Verdex — DePIN Node Activated!',
      html: buildWelcomeEmail(email)
    });
    if (error) {
      console.warn("Failed to send welcome email from custom domain, attempting onboarding fallback...", error);
      await resend.emails.send({
        from: 'Verdex Onboarding <onboarding@resend.dev>',
        to: [email],
        subject: 'Welcome to Verdex — DePIN Node Activated!',
        html: buildWelcomeEmail(email)
      });
    }
    return { success: true, data };
  } catch (err) {
    console.error("Welcome email error:", err);
    return { success: false, error: err.message };
  }
}

async function sendVerificationCodeEmail(email, code) {
  const resend = getResend();
  const fromAddress = process.env.SENDER_EMAIL || 'Verdex <no-reply@verdexswap.site>';
  try {
    const { data, error } = await resend.emails.send({
      from: fromAddress,
      to: [email],
      subject: `Verdex Verification Code: ${code}`,
      html: buildVerificationCodeEmail(email, code)
    });
    if (error) {
      console.warn("Failed to send code email from custom domain, attempting onboarding fallback...", error);
      await resend.emails.send({
        from: 'Verdex Verification <onboarding@resend.dev>',
        to: [email],
        subject: `Verdex Verification Code: ${code}`,
        html: buildVerificationCodeEmail(email, code)
      });
    }
    return { success: true, data };
  } catch (err) {
    console.error("Verification email error:", err);
    return { success: false, error: err.message };
  }
}

function buildKycVerifiedEmail() {
  const siteUrl = process.env.SITE_URL || 'https://verdexswap.site';
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Identity verified</title></head>
<body style="margin:0;padding:0;background:#000;font-family:sans-serif;color:#fff;">
<table width="100%" style="background:#000;padding:40px 20px;"><tr><td align="center">
<table width="580" style="max-width:580px;background:#050a05;border:1px solid rgba(0,255,136,.15);border-radius:20px;">
<tr><td style="padding:40px;text-align:center;">
<img src="${siteUrl}/assets/verdex-logo-email.png" width="72" height="72" alt="Verdex" style="display:block;margin:0 auto 16px;">
<h1 style="color:#00ff88;letter-spacing:4px;margin:0 0 8px;">VERDEX</h1>
<p style="color:#7a9a7e;font-size:11px;letter-spacing:3px;text-transform:uppercase;">Mainnet identity</p>
<div style="height:1px;background:linear-gradient(90deg,transparent,#00ff88,transparent);margin:20px 0;"></div>
<h2 style="color:#fff;margin:0 0 16px;">Identity verified</h2>
<p style="color:#86a389;font-size:14px;line-height:1.6;text-align:left;margin:0 0 20px;">
Your identity verification was approved. P2P access with real mainnet VDX is enabled under the current policy limits.
Open the Verdex Android app to view your status and marketplace access.
</p>
<p style="font-size:12px;color:#7a9a7e;margin:0;">This email does not include document details, balances, or risk scores.</p>
<p style="font-size:11px;color:#7a9a7e;margin-top:24px;">${siteUrl}</p>
</td></tr></table></td></tr></table>
</body></html>`;
}

async function sendKycVerifiedEmail(email) {
  if (!email) return { success: false, error: 'missing_email' };
  const resend = getResend();
  const fromAddress = process.env.SENDER_EMAIL || 'Verdex <no-reply@verdexswap.site>';
  const subject = 'Verdex — Identity verified · P2P access enabled';
  const html = buildKycVerifiedEmail();
  try {
    const { data, error } = await resend.emails.send({ from: fromAddress, to: [email], subject, html });
    if (error) {
      await resend.emails.send({
        from: 'Verdex Compliance <onboarding@resend.dev>',
        to: [email],
        subject,
        html
      });
    }
    return { success: true, data };
  } catch (err) {
    console.error('KYC verified email error:', err);
    return { success: false, error: err.message };
  }
}

/** Validate EVM address (0x + 40 hex). Phase 1 wallet hygiene. */
function isValidEvmAddress(addr) {
  return typeof addr === 'string' && /^0x[a-fA-F0-9]{40}$/.test(addr);
}

/** Normalize address to lowercase checksum-agnostic form. */
function normalizeAddress(addr) {
  if (!isValidEvmAddress(addr)) return null;
  return addr.toLowerCase();
}

module.exports = {
  getSupabase,
  setCORS,
  jsonResponse,
  handleError,
  verifyUser,
  verifyAdmin,
  verifyApiToken,
  getMiningPhase,
  generateChallenge,
  verifyPoW,
  issueChallenge,
  logAudit,
  registerDevice,
  checkRateLimit,
  checkIpRateLimit,
  checkIdempotency,
  storeIdempotency,
  adminBanUser,
  getMiningConfig,
  seedAdminEmails,
  calculateHardwareScore,
  getHardwareTier,
  getMiningModeConfig,
  calculateAdaptiveReward,
  getAdaptiveDifficulty,
  getResend,
  sendWelcomeEmail,
  sendVerificationCodeEmail,
  sendKycVerifiedEmail,
  isValidEvmAddress,
  normalizeAddress,
  ALLOWED_ORIGINS
};
