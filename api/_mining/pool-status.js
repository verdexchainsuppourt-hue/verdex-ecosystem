// /api/mining/pool-status — Real-time mining pool state
// Returns: pool hashrate, active miners, round progress, leaderboard, shares
const { getSupabase, jsonResponse, handleError, setCORS, getMiningPhase } = require('../../lib/api-lib');

module.exports = async (req, res) => {
  setCORS(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET' && req.method !== 'POST') {
    return jsonResponse(res, 405, { error: 'Method not allowed' });
  }

  try {
    const supabase = getSupabase();
    const now = new Date();
    const fiveMinAgo = new Date(now - 5 * 60 * 1000).toISOString();
    const oneHourAgo = new Date(now - 60 * 60 * 1000).toISOString();
    const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();

    // 1. Active miners = sessions with heartbeat in last 5 min
    const { data: activeSessions, count: activeCount } = await supabase
      .from('mining_sessions')
      .select('id, user_id, device_name, mining_mode, hardware_score, last_heartbeat_at, total_uptime_seconds', { count: 'exact' })
      .eq('status', 'active')
      .gte('last_heartbeat_at', fiveMinAgo);

    // 2. Pool hashrate = sum from recent heartbeats
    const { data: recentHeartbeats } = await supabase
      .from('heartbeats')
      .select('session_id, created_at')
      .eq('valid', true)
      .gte('created_at', fiveMinAgo);

    // Estimate pool hashrate from solve frequency
    // Each valid heartbeat = 1 share. More shares per minute = higher hashrate
    const sharesLastFiveMin = recentHeartbeats?.length || 0;
    const estimatedPoolHashrate = Math.round(sharesLastFiveMin * 12000); // ~12K H/s per share/5min

    // 3. Round info — current hour is current round
    const currentHour = new Date(now);
    currentHour.setMinutes(0, 0, 0);
    const roundId = currentHour.toISOString().replace(/[:.]/g, '-').slice(0, 13);
    const roundStart = currentHour.toISOString();
    const nextRoundStart = new Date(currentHour.getTime() + 60 * 60 * 1000).toISOString();
    const roundProgress = now.getMinutes() / 60.0; // 0.0 to 1.0

    // 4. Shares this round (valid heartbeats this hour)
    const { data: roundShares, count: roundShareCount } = await supabase
      .from('heartbeats')
      .select('session_id, created_at', { count: 'exact' })
      .eq('valid', true)
      .gte('created_at', roundStart);

    // 5. Total shares today
    const { count: todayShareCount } = await supabase
      .from('heartbeats')
      .select('id', { count: 'exact', head: true })
      .eq('valid', true)
      .gte('created_at', oneDayAgo);

    // 6. Round reward pool calculation
    // Phase-based reward scaling
    const { data: configData } = await supabase
      .from('mining_config')
      .select('key, value')
      .in('key', ['base_reward_per_round', 'pool_bonus_multiplier', 'max_round_reward']);

    const config = {};
    (configData || []).forEach(c => { config[c.key] = parseFloat(c.value) || 0; });

    const baseRewardPerRound = config.base_reward_per_round || 10.0;
    const poolBonusMultiplier = config.pool_bonus_multiplier || 1.0;
    const maxRoundReward = config.max_round_reward || 100.0;

    // More active miners = bigger pool reward (network effect bonus)
    const minerBonus = 1 + Math.min(2.0, (activeCount || 0) * 0.1); // +10% per active miner, max 3x
    const roundRewardPool = Math.min(maxRoundReward,
      baseRewardPerRound * poolBonusMultiplier * minerBonus);

    // 7. Top contributors this round (leaderboard)
    const { data: roundContributions } = await supabase
      .from('heartbeats')
      .select('session_id')
      .eq('valid', true)
      .gte('created_at', roundStart);

    // Count shares per session
    const sessionShareMap = {};
    (roundContributions || []).forEach(h => {
      sessionShareMap[h.session_id] = (sessionShareMap[h.session_id] || 0) + 1;
    });

    // Map session IDs to user info for leaderboard
    const sessionIds = Object.keys(sessionShareMap);
    let leaderboard = [];
    if (sessionIds.length > 0) {
      const { data: sessionUsers } = await supabase
        .from('mining_sessions')
        .select('id, user_id, device_name, mining_mode, hardware_score')
        .in('id', sessionIds.slice(0, 50));

      const userIds = [...new Set((sessionUsers || []).map(s => s.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username, full_name, avatar_url')
        .in('id', userIds);

      const profileMap = {};
      (profiles || []).forEach(p => { profileMap[p.id] = p; });

      leaderboard = (sessionUsers || []).map(s => {
        const shares = sessionShareMap[s.id] || 0;
        const totalShares = roundShareCount || 1;
        const profile = profileMap[s.user_id] || {};
        return {
          username: profile.username || profile.full_name || 'Anonymous',
          avatar_url: profile.avatar_url || null,
          device_name: s.device_name,
          mining_mode: s.mining_mode,
          hardware_score: s.hardware_score || 0,
          shares: shares,
          share_percent: ((shares / totalShares) * 100).toFixed(1),
          estimated_reward: ((shares / totalShares) * roundRewardPool).toFixed(2),
        };
      }).sort((a, b) => b.shares - a.shares).slice(0, 20);
    }

    // 8. Per-user stats (if authenticated)
    let userPoolStats = null;
    const deviceToken = req.headers['x-device-token'];
    if (deviceToken) {
      try {
        const { verifyApiToken } = require('../../lib/api-lib');
        const tokenRecord = await verifyApiToken(req);
        if (tokenRecord) {
          // Get user's sessions
          const { data: userSessions } = await supabase
            .from('mining_sessions')
            .select('id')
            .eq('user_id', tokenRecord.user_id);

          const userSessionIds = (userSessions || []).map(s => s.id);
          let userShares = 0;
          let userSharesToday = 0;

          if (userSessionIds.length > 0) {
            // Shares this round
            const { count: userRoundShares } = await supabase
              .from('heartbeats')
              .select('id', { count: 'exact', head: true })
              .eq('valid', true)
              .in('session_id', userSessionIds)
              .gte('created_at', roundStart);
            userShares = userRoundShares || 0;

            // Shares today
            const { count: userDayShares } = await supabase
              .from('heartbeats')
              .select('id', { count: 'exact', head: true })
              .eq('valid', true)
              .in('session_id', userSessionIds)
              .gte('created_at', oneDayAgo);
            userSharesToday = userDayShares || 0;
          }

          const totalShares = roundShareCount || 1;
          const sharePercent = (userShares / totalShares) * 100;

          userPoolStats = {
            user_id: tokenRecord.user_id,
            shares_this_round: userShares,
            shares_today: userSharesToday,
            share_percent: sharePercent.toFixed(1),
            estimated_round_reward: ((userShares / totalShares) * roundRewardPool).toFixed(2),
            rank: leaderboard.findIndex(l => l.shares === userShares) + 1 || leaderboard.length + 1,
          };
        }
      } catch (e) {
        // Non-critical
      }
    }

    // 9. Network stats (all-time)
    const { count: totalBlocks } = await supabase
      .from('heartbeats')
      .select('id', { count: 'exact', head: true })
      .eq('valid', true);

    const { count: totalMiners } = await supabase
      .from('mining_sessions')
      .select('user_id', { count: 'exact', head: true });

    const { data: totalVPData } = await supabase
      .from('point_transactions')
      .select('amount')
      .eq('type', 'mining');
    const totalVPMined = (totalVPData || []).reduce((sum, t) => sum + (t.amount || 0), 0);

    return jsonResponse(res, 200, {
      success: true,
      pool: {
        // Real-time pool state
        hashrate: estimatedPoolHashrate,
        active_miners: activeCount || 0,
        active_sessions: (activeSessions || []).map(s => ({
          device_name: s.device_name,
          mining_mode: s.mining_mode,
          hardware_score: s.hardware_score,
        })),

        // Current round
        round: {
          id: roundId,
          started_at: roundStart,
          ends_at: nextRoundStart,
          progress: parseFloat(roundProgress.toFixed(3)),
          minutes_remaining: 60 - now.getMinutes(),
          shares_submitted: roundShareCount || 0,
          reward_pool: parseFloat(roundRewardPool.toFixed(2)),
          miner_bonus: parseFloat(minerBonus.toFixed(2)),
        },

        // Leaderboard
        leaderboard: leaderboard,

        // Your stats (if authenticated)
        your_stats: userPoolStats,

        // Network lifetime stats
        network: {
          total_blocks_mined: totalBlocks || 0,
          total_miners_ever: totalMiners || 0,
          total_vp_mined: parseFloat((totalVPMined || 0).toFixed(2)),
          shares_today: todayShareCount || 0,
        },
      },
      timestamp: now.toISOString(),
    });
  } catch (err) {
    return handleError(res, err, 'mining/pool-status');
  }
};
