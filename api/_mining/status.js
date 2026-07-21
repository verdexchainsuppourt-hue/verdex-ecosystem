// /api/mining/status — returns mining stats for authenticated user
const { verifyUser, getSupabase, jsonResponse, handleError, setCORS } = require('../../lib/api-lib');

module.exports = async (req, res) => {
  setCORS(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return jsonResponse(res, 405, { error: 'Method not allowed' });

  try {
    const user = await verifyUser(req);
    if (!user) return jsonResponse(res, 401, { error: 'Not authenticated' });

    const supabase = getSupabase();

    // Fetch sessions and wallet
    const [sessionsResult, walletResult, heartbeatResult] = await Promise.all([
      supabase.from('mining_sessions')
        .select('*').eq('user_id', user.id)
        .order('created_at', { ascending: false }).limit(10),
      supabase.from('wallets')
        .select('*').eq('user_id', user.id).single(),
      supabase.from('heartbeats')
        .select('created_at').eq('user_id', user.id)
        .eq('valid', true)
        .order('created_at', { ascending: false }).limit(1)
    ]);

    const sessions = sessionsResult.data || [];
    const wallet = walletResult.data || {};
    const lastHeartbeat = heartbeatResult.data?.[0];

    // Active session
    const activeSession = sessions.find(s => s.status === 'active');

    // Calculate uptime today
    let uptimeToday = 0;
    if (activeSession && activeSession.last_heartbeat_at) {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const hbTime = new Date(activeSession.last_heartbeat_at);
      if (hbTime > startOfDay) {
        uptimeToday = Math.round((hbTime - startOfDay) / 1000);
      }
    }

    // Calculate rank (simple: count users with higher VP balance)
    const { count: higherCount } = await supabase
      .from('wallets')
      .select('*', { count: 'exact', head: true })
      .gt('vp_balance_cached', wallet.vp_balance_cached || 0);

    const rank = (higherCount || 0) + 1;

    return jsonResponse(res, 200, {
      is_mining: !!activeSession,
      active_session: activeSession || null,
      sessions: sessions,
      uptime_today_seconds: uptimeToday,
      total_uptime_seconds: activeSession?.total_uptime_seconds || 0,
      vp_balance: wallet.vp_balance_cached || 0,
      streak: wallet.current_streak || 0,
      longest_streak: wallet.longest_streak || 0,
      rank: rank,
      last_heartbeat: lastHeartbeat?.created_at || null
    });
  } catch (err) {
    return handleError(res, err, 'mining/status');
  }
};
