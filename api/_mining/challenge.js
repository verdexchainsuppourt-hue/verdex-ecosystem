const { verifyApiToken, getSupabase, jsonResponse, handleError, setCORS, issueChallenge, checkRateLimit, getMiningPhase, calculateHardwareScore, getAdaptiveDifficulty, getMiningModeConfig } = require('../../lib/api-lib');

module.exports = async (req, res) => {
  setCORS(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return jsonResponse(res, 405, { error: 'Method not allowed' });

  try {
    const tokenRecord = await verifyApiToken(req);
    if (!tokenRecord) return jsonResponse(res, 401, { error: 'Invalid or expired device token' });

    const rl = checkRateLimit(`challenge:${tokenRecord.id}`, 30, 300000);
    if (!rl.allowed) return jsonResponse(res, 429, { error: 'Too many challenge requests' });

    const supabase = getSupabase();
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});

    // Extract hardware profile and mining mode from request
    const hardwareProfile = body.hardware_profile || null;
    const miningMode = body.mining_mode || 'normal'; // 'eco', 'normal', 'pro'
    const miningSource = body.mining_source || 'cli'; // 'cli', 'desktop', 'web', 'mobile', 'termux'

    // Calculate hardware score from reported profile
    const hardwareScore = calculateHardwareScore(hardwareProfile);

    const { data: sessions } = await supabase
      .from('mining_sessions')
      .select('*')
      .eq('api_token_id', tokenRecord.id)
      .order('created_at', { ascending: false })
      .limit(1);

    let session;
    
    if (sessions && sessions.length > 0) {
      session = sessions[0];
      const updates = {};
      if (hardwareProfile) {
        updates.hardware_score = hardwareScore;
        updates.hardware_profile = hardwareProfile;
      }
      if (miningMode !== (session.mining_mode || 'normal')) {
        updates.mining_mode = miningMode;
      }
      if (Object.keys(updates).length > 0) {
        try {
          await supabase.from('mining_sessions').update(updates).eq('id', session.id);
        } catch (e) {
          // Ignore updates if columns don't exist
        }
      }
    } else {
      // Create session
      const { data: newSession, error: sessionError } = await supabase
        .from('mining_sessions')
        .insert({
          user_id: tokenRecord.user_id,
          api_token_id: tokenRecord.id,
          status: 'active',
          device_fingerprint: tokenRecord.device_fingerprint || 'cli-' + tokenRecord.id,
          device_name: tokenRecord.device_name || 'CLI Miner',
          started_at: new Date().toISOString(),
          total_uptime_seconds: 0,
          hardware_score: hardwareScore,
          hardware_profile: hardwareProfile || {},
          mining_mode: miningMode
        })
        .select()
        .single();
        
      if (sessionError) {
        if (sessionError.code === 'PGRST204') {
          const { data: newSessionBase, error: baseError } = await supabase
            .from('mining_sessions')
            .insert({
              user_id: tokenRecord.user_id,
              api_token_id: tokenRecord.id,
              status: 'active',
              device_fingerprint: tokenRecord.device_fingerprint || 'cli-' + tokenRecord.id,
              device_name: tokenRecord.device_name || 'CLI Miner',
              started_at: new Date().toISOString(),
              total_uptime_seconds: 0
            })
            .select()
            .single();
          if (baseError) return jsonResponse(res, 500, { error: 'Failed to create base session: ' + baseError.message });
          session = newSessionBase;
        } else {
          return jsonResponse(res, 500, { error: 'Failed to create session: ' + sessionError.message });
        }
      } else {
        session = newSession;
      }
    }

    if (session.status === 'terminated') return jsonResponse(res, 403, { error: 'Mining session terminated' });
    if (session.status === 'paused') {
      await supabase.from('mining_sessions').update({ status: 'active' }).eq('id', session.id);
    }

    // Get user's VP balance to determine mining phase difficulty
    const { data: wallet } = await supabase
      .from('wallets')
      .select('vp_balance_cached')
      .eq('user_id', tokenRecord.user_id)
      .single();
    const phase = await getMiningPhase(wallet?.vp_balance_cached || 0);

    // Calculate adaptive difficulty based on phase + hardware + mode
    const adaptiveDifficulty = getAdaptiveDifficulty(phase.difficulty, hardwareScore, miningMode);
    const modeConfig = getMiningModeConfig(miningMode, hardwareScore);

    // Issue challenge with adaptive difficulty
    const challenge = await issueChallenge(session.id, tokenRecord.user_id, adaptiveDifficulty);

    return jsonResponse(res, 200, {
      success: true,
      session_id: session.id,
      ...challenge,
      // Phase info
      phase: phase.phase,
      phase_label: phase.label,
      reward_per_share: phase.rewardPerShare,
      min_block_sec: phase.minBlockSec,
      // Adaptive mining info
      mining_mode: miningMode,
      mining_mode_label: modeConfig.label,
      hardware_score: hardwareScore,
      hardware_tier: modeConfig.hardwareTier.label,
      effective_multiplier: modeConfig.effectiveMultiplier,
      adaptive_difficulty: adaptiveDifficulty,
      // Estimated reward for this block
      estimated_reward: Math.max(1, Math.floor(phase.rewardPerShare * modeConfig.effectiveMultiplier * ({ cli: 1, desktop: 1, web: 0.6, mobile: 0.5, termux: 0.7 }[miningSource] || 1)))
    });
  } catch (err) {
    return handleError(res, err, 'mining/challenge');
  }
};
