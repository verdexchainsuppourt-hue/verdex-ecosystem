// /api/cron/daily-credit — runs daily via Vercel Cron
// Credits VP to all users who had valid uptime in the last 24h
// Applies streak bonus + referral earnings
const { getSupabase, getMiningConfig, logAudit, jsonResponse } = require('../../lib/api-lib');

module.exports = async (req, res) => {
  // Verify this is a Vercel Cron call (CRON_SECRET header)
  if (process.env.CRON_SECRET && req.headers['authorization'] !== `Bearer ${process.env.CRON_SECRET}`) {
    return jsonResponse(res, 401, { error: 'Unauthorized' });
  }

  try {
    const supabase = getSupabase();
    const config = await getMiningConfig();

    const baseVp = parseInt(config.daily_vp_base) || 10;
    const streakBonusPerDay = parseInt(config.streak_bonus_per_day) || 2;
    const streakBonusCap = parseInt(config.streak_bonus_cap) || 20;
    const referralPercentage = parseInt(config.referral_percentage) || 10;
    const tolerance = parseInt(config.heartbeat_tolerance_seconds) || 600;
    const dailyCap = parseInt(config.daily_uptime_cap_seconds) || 86400;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);

    // Find all sessions that had heartbeats in the last 24h
    const { data: activeHeartbeats, error: hbError } = await supabase
      .from('heartbeats')
      .select('user_id, session_id, created_at')
      .eq('valid', true)
      .gte('created_at', yesterday.toISOString())
      .order('user_id')
      .order('created_at', { ascending: true });

    if (hbError) throw hbError;

    // Group by user: calculate total valid uptime in the last 24h
    const userUptime = {};
    (activeHeartbeats || []).forEach(hb => {
      if (!userUptime[hb.user_id]) {
        userUptime[hb.user_id] = { seconds: 0, lastHb: null, firstHb: null };
      }
      const u = userUptime[hb.user_id];
      if (u.lastHb) {
        const gap = (new Date(hb.created_at) - new Date(u.lastHb)) / 1000;
        if (gap <= tolerance) {
          u.seconds += Math.min(gap, dailyCap - u.seconds);
        }
      }
      u.lastHb = hb.created_at;
      if (!u.firstHb) u.firstHb = hb.created_at;
    });

    // Credit VP to each eligible user
    const results = [];
    const todayStr = today.toISOString().split('T')[0];

    for (const [userId, data] of Object.entries(userUptime)) {
      // Only credit if user had at least 1 hour of uptime
      if (data.seconds < 3600) continue;

      // Get user's wallet for streak tracking
      const { data: wallet } = await supabase
        .from('wallets')
        .select('current_streak, last_credit_date')
        .eq('user_id', userId)
        .single();

      if (!wallet) continue;

      // Skip if already credited today
      if (wallet.last_credit_date && wallet.last_credit_date === todayStr) continue;

      // Update streak via the stored function
      const { data: newStreak } = await supabase.rpc('update_streak', {
        p_user_id: userId,
        p_credit_date: todayStr
      });

      // Calculate VP: base + streak bonus (capped)
      const streak = newStreak || 1;
      const streakBonus = Math.min((streak - 1) * streakBonusPerDay, streakBonusCap);
      const totalVp = baseVp + streakBonus;

      // Credit VP via stored function
      await supabase.rpc('credit_vp', {
        p_user_id: userId,
        p_amount: totalVp,
        p_type: 'mining',
        p_description: `Daily mining reward (${Math.round(data.seconds / 3600)}h uptime, ${streak} day streak)`,
        p_source_type: 'mining_session',
        p_metadata: { uptime_seconds: data.seconds, streak: streak }
      });

      results.push({ user_id: userId, vp: totalVp, uptime: data.seconds, streak });

      // Process referral earnings
      const { data: profile } = await supabase
        .from('profiles')
        .select('referred_by')
        .eq('id', userId)
        .single();

      if (profile?.referred_by) {
        const referralVp = Math.round(totalVp * referralPercentage / 100);
        if (referralVp > 0) {
          await supabase.rpc('credit_vp', {
            p_user_id: profile.referred_by,
            p_amount: referralVp,
            p_type: 'referral',
            p_description: `Referral earnings from user`,
            p_referrer_id: profile.referred_by,
            p_metadata: { referred_user: userId, source_vp: totalVp }
          });
        }
      }
    }

    await logAudit(null, 'daily_credit_cron', {
      success: true,
      metadata: { users_credited: results.length, date: todayStr }
    });

    return jsonResponse(res, 200, {
      success: true,
      date: todayStr,
      users_credited: results.length,
      details: results
    });
  } catch (err) {
    console.error('[cron/daily-credit] Error:', err);
    return jsonResponse(res, 500, { error: 'Cron job failed', message: err.message });
  }
};
