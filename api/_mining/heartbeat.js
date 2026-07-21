const crypto = require('crypto');
const { verifyApiToken, getSupabase, jsonResponse, handleError, setCORS, logAudit, verifyPoW, getMiningPhase, calculateHardwareScore, calculateAdaptiveReward, getAdaptiveDifficulty, checkRateLimit, checkIdempotency, storeIdempotency } = require('../../lib/api-lib');

module.exports = async (req, res) => {
  setCORS(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return jsonResponse(res, 405, { error: 'Method not allowed' });

  try {
    const tokenRecord = await verifyApiToken(req);
    if (!tokenRecord) return jsonResponse(res, 401, { error: 'Invalid or expired device token' });

    // Phase 1: per-token rate limit (max 30 heartbeats / 5 min)
    const hbRl = checkRateLimit('hb:' + tokenRecord.id, 30, 5 * 60 * 1000);
    if (!hbRl.allowed) {
      return jsonResponse(res, 429, { error: 'Heartbeat rate limit exceeded', retryAt: hbRl.retryAt });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { nonce, pow_solution } = body;
    if (!nonce || !pow_solution) {
      return jsonResponse(res, 400, { error: 'Missing required fields: nonce, pow_solution' });
    }

    // Phase 1: Idempotency — prevent duplicate VP credit on retry
    const idempotencyKey = req.headers['x-idempotency-key'] || body.idempotency_key || null;
    if (idempotencyKey) {
      const idem = checkIdempotency('hb:' + tokenRecord.id + ':' + idempotencyKey);
      if (idem.duplicate) {
        return jsonResponse(res, 200, { ...idem.originalResult, deduplicated: true });
      }
    }

    // Extract adaptive mining params
    const miningMode = body.mining_mode || 'normal';
    const miningSource = body.mining_source || 'cli';
    const hardwareProfile = body.hardware_profile || null;
    const reportedHashrate = body.hashrate || 0;

    const supabase = getSupabase();
    const ip = req.headers['x-forwarded-for']?.split(',')[0] || 'unknown';
    const userAgent = req.headers['user-agent'] || 'verdex-cli';

    // Find the user's wallet to determine mining phase
    const { data: wallet } = await supabase
      .from('wallets')
      .select('vp_balance_cached, current_streak')
      .eq('user_id', tokenRecord.user_id)
      .single();
    const vpBalance = wallet?.vp_balance_cached || 0;
    const phase = await getMiningPhase(vpBalance);

    // Find active session
    const { data: sessions } = await supabase
      .from('mining_sessions')
      .select('*')
      .eq('api_token_id', tokenRecord.id)
      .order('created_at', { ascending: false })
      .limit(1);
    let session = sessions?.[0];
    if (!session) {
      const { data: newSession } = await supabase
        .from('mining_sessions')
        .insert({
          user_id: tokenRecord.user_id,
          api_token_id: tokenRecord.id,
          status: 'active',
          device_fingerprint: tokenRecord.device_fingerprint || 'cli-' + tokenRecord.id,
          device_name: tokenRecord.device_name || 'CLI Miner',
          started_at: new Date().toISOString(),
          last_heartbeat_at: new Date().toISOString(),
          total_uptime_seconds: 0,
          hardware_score: calculateHardwareScore(hardwareProfile),
          hardware_profile: hardwareProfile || {},
          mining_mode: miningMode
        })
        .select()
        .single();
      session = newSession;
    }
    if (session.status === 'terminated') {
      return jsonResponse(res, 403, { error: 'Mining session terminated.' });
    }

    // Phase 1: Check if device is banned (Sybil protection)
    if (session.device_fingerprint) {
      const { data: deviceRecord } = await supabase
        .from('device_fingerprints')
        .select('is_banned, ban_reason')
        .eq('fingerprint_hash', session.device_fingerprint)
        .single();
      if (deviceRecord && deviceRecord.is_banned) {
        return jsonResponse(res, 403, { error: 'Device suspended: ' + (deviceRecord.ban_reason || 'Contact support') });
      }
    }

    // Get hardware score from session or recalculate
    const hardwareScore = session.hardware_score || calculateHardwareScore(hardwareProfile);

    // Enforce minimum block time based on phase
    const now = new Date();
    if (session.last_heartbeat_at) {
      const elapsed = (now - new Date(session.last_heartbeat_at)) / 1000;
      if (elapsed < phase.minBlockSec) {
        const wait = Math.ceil(phase.minBlockSec - elapsed);
        return jsonResponse(res, 429, {
          error: `Phase ${phase.phase} (${phase.label}): wait ${wait}s before next block`,
          phase: phase.phase,
          phase_label: phase.label,
          wait_seconds: wait,
          difficulty: phase.difficulty,
          reward_per_share: phase.rewardPerShare,
          mining_mode: miningMode,
          hardware_score: hardwareScore
        });
      }
    }

    // Verify the pending challenge exists and validate PoW
    const { data: pendingChallenges } = await supabase
      .from('heartbeats')
      .select('*')
      .eq('session_id', session.id)
      .eq('valid', false)
      .eq('rejection_reason', 'pending')
      .order('created_at', { ascending: false })
      .limit(1);

    const pendingChallenge = pendingChallenges?.[0];
    if (!pendingChallenge) {
      return jsonResponse(res, 400, { error: 'No pending challenge. Request a challenge first via /api/mining/challenge' });
    }

    // Check challenge expiry (10 min TTL to support slower devices and block spacing)
    const challengeAge = (now - new Date(pendingChallenge.created_at)) / 1000;
    if (challengeAge > 600) {
      await supabase
        .from('heartbeats')
        .update({ rejection_reason: 'expired', valid: false })
        .eq('id', pendingChallenge.id);
      return jsonResponse(res, 400, { error: 'Challenge expired. Request a new one.' });
    }

    // Calculate adaptive difficulty (same as what was issued)
    const adaptiveDifficulty = getAdaptiveDifficulty(phase.difficulty, hardwareScore, miningMode);

    // Validate PoW solution against adaptive difficulty
    const isValid = verifyPoW(pendingChallenge.pow_challenge, pow_solution, adaptiveDifficulty);
    if (!isValid) {
      await supabase
        .from('heartbeats')
        .update({ rejection_reason: 'invalid_pow', valid: false, pow_solution: pow_solution, pow_valid: false })
        .eq('id', pendingChallenge.id);
      return jsonResponse(res, 400, { error: `Invalid PoW solution. Need ${adaptiveDifficulty} leading zeros.` });
    }

    // PoW valid — calculate adaptive reward
    const adaptiveResult = calculateAdaptiveReward(phase.rewardPerShare, hardwareScore, miningMode, miningSource);
    const rewardVP = adaptiveResult.reward;

    let addedUptime = 0;
    if (session.last_heartbeat_at) {
      const gap = (now - new Date(session.last_heartbeat_at)) / 1000;
      if (gap <= 600) addedUptime = Math.round(gap);
    }
    const totalUptime = (session.total_uptime_seconds || 0) + addedUptime;

    // Mark the challenge as solved
    await supabase
      .from('heartbeats')
      .update({
        pow_solution: pow_solution,
        pow_valid: true,
        valid: true,
        rejection_reason: null,
        nonce: nonce,
        ip_address: ip,
        user_agent: userAgent,
        created_at: now.toISOString()
      })
      .eq('id', pendingChallenge.id);

    // Credit VP with adaptive reward
    try {
      await supabase.rpc('credit_vp', {
        p_user_id: tokenRecord.user_id,
        p_amount: rewardVP,
        p_type: 'mining',
        p_description: `Phase ${phase.phase} (${phase.label}) | ${adaptiveResult.breakdown.miningMode} | ${adaptiveResult.breakdown.hardwareTier} | ${adaptiveDifficulty} zeros`,
        p_source_id: session.id,
        p_source_type: 'mining_session',
        p_metadata: {
          phase: phase.phase,
          phase_label: phase.label,
          difficulty: adaptiveDifficulty,
          nonce: nonce,
          challenge_id: pendingChallenge.id,
          mining_mode: miningMode,
          mining_source: miningSource,
          hardware_score: hardwareScore,
          hardware_tier: adaptiveResult.breakdown.hardwareTier,
          reward_breakdown: adaptiveResult.breakdown,
          hashrate: reportedHashrate,
          timestamp: now.toISOString()
        }
      });
    } catch (rpcErr) {
      const { data: walletData } = await supabase
        .from('wallets')
        .select('vp_balance_cached')
        .eq('user_id', tokenRecord.user_id)
        .single();
      const currentBalance = walletData?.vp_balance_cached || 0;
      await supabase.from('point_transactions').insert({
        user_id: tokenRecord.user_id,
        amount: rewardVP,
        type: 'mining',
        description: `Phase ${phase.phase} block | ${adaptiveResult.breakdown.miningMode}`,
        source_id: session.id,
        source_type: 'mining_session',
        balance_after: currentBalance + rewardVP,
        metadata: {
          phase: phase.phase,
          difficulty: adaptiveDifficulty,
          nonce: nonce,
          mining_mode: miningMode,
          hardware_score: hardwareScore,
          reward_breakdown: adaptiveResult.breakdown
        }
      });
      await supabase.from('wallets').update({
        vp_balance_cached: currentBalance + rewardVP
      }).eq('user_id', tokenRecord.user_id);
    }

    // Update session
    await supabase
      .from('mining_sessions')
      .update({
        last_heartbeat_at: now.toISOString(),
        total_uptime_seconds: totalUptime,
        status: 'active',
        mining_mode: miningMode,
        hardware_score: hardwareScore
      })
      .eq('id', session.id);

    // Get updated wallet
    const { data: updatedWallet } = await supabase
      .from('wallets')
      .select('vp_balance_cached, current_streak')
      .eq('user_id', tokenRecord.user_id)
      .single();

    // Log audit
    await logAudit(tokenRecord.user_id, 'block_mined', {
      resource_type: 'mining',
      resource_id: session.id,
      ip_address: ip,
      metadata: {
        phase: phase.phase,
        phase_label: phase.label,
        reward: rewardVP,
        difficulty: adaptiveDifficulty,
        mining_mode: miningMode,
        hardware_score: hardwareScore,
        hardware_tier: adaptiveResult.breakdown.hardwareTier,
        source: miningSource
      }
    });

    const result = {
      success: true,
      message: `Block accepted — Phase ${phase.phase} (${phase.label}) | ${adaptiveResult.breakdown.miningMode}`,
      // Phase info
      phase: phase.phase,
      phase_label: phase.label,
      difficulty: adaptiveDifficulty,
      // Reward info
      reward_vp: rewardVP,
      reward_breakdown: adaptiveResult.breakdown,
      // Session info
      uptime_total_seconds: totalUptime,
      vp_balance: updatedWallet?.vp_balance_cached || 0,
      streak: updatedWallet?.current_streak || 0,
      // Adaptive info
      mining_mode: miningMode,
      hardware_score: hardwareScore,
      hardware_tier: adaptiveResult.breakdown.hardwareTier,
      effective_multiplier: adaptiveResult.breakdown.effectiveMultiplier,
      // Next block
      next_min_block_sec: phase.minBlockSec,
      vp_to_next_phase: phase.phase === 1 ? 100 - vpBalance : phase.phase === 2 ? 500 - vpBalance : null
    };

    // Store idempotency result so retries return the same response
    if (idempotencyKey) {
      storeIdempotency('hb:' + tokenRecord.id + ':' + idempotencyKey, result);
    }

    return jsonResponse(res, 200, result);
  } catch (err) {
    return handleError(res, err, 'mining/heartbeat');
  }
};
