// /api/mining/leaderboard — global rankings
const { getSupabase, jsonResponse, handleError, setCORS, verifyUser } = require('../../lib/api-lib');

module.exports = async (req, res) => {
  setCORS(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return jsonResponse(res, 405, { error: 'Method not allowed' });

  try {
    const supabase = getSupabase();
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);

    // Get top users by VP balance
    const { data: topWallets, error } = await supabase
      .from('wallets')
      .select('user_id, vp_balance_cached, current_streak, longest_streak')
      .order('vp_balance_cached', { ascending: false })
      .limit(limit);

    if (error) throw error;

    // Get profile info for each user
    const userIds = (topWallets || []).map(w => w.user_id);
    let profilesMap = {};
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username, avatar_url')
        .in('id', userIds);
      (profiles || []).forEach(p => { profilesMap[p.id] = p; });
    }

    let totalMiners = null;
    let myRank = null;

    // Check if user is authenticated to show their own rank
    const user = await verifyUser(req);
    if (user) {
      const { count: totalCount } = await supabase
        .from('wallets')
        .select('*', { count: 'exact', head: true })
        .gt('vp_balance_cached', 0);
      totalMiners = totalCount;
      
      const { data: myWallet } = await supabase
        .from('wallets')
        .select('vp_balance_cached, current_streak')
        .eq('user_id', user.id)
        .single();

      const { count: higherCount } = await supabase
        .from('wallets')
        .select('*', { count: 'exact', head: true })
        .gt('vp_balance_cached', myWallet?.vp_balance_cached || 0);

      myRank = (higherCount || 0) + 1;
    }

    const leaderboard = (topWallets || []).map((w, i) => ({
      rank: i + 1,
      username: profilesMap[w.user_id]?.username || 'Anonymous',
      avatar_url: profilesMap[w.user_id]?.avatar_url,
      vp_balance: w.vp_balance_cached || 0,
      current_streak: w.current_streak || 0,
      longest_streak: w.longest_streak || 0
    }));

    return jsonResponse(res, 200, {
      leaderboard,
      my_rank: myRank,
      total_miners: totalMiners
    });
  } catch (err) {
    return handleError(res, err, 'mining/leaderboard');
  }
};
