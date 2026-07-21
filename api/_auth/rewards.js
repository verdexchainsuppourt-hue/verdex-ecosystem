const { verifyUser, getSupabase, jsonResponse, handleError, setCORS } = require('../../lib/api-lib');

module.exports = async (req, res) => {
  setCORS(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const user = await verifyUser(req);
    if (!user) return jsonResponse(res, 401, { error: 'Not authenticated' });

    const supabase = getSupabase();
    const action = req.query.action || 'status';

    if (action === 'status') {
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);

      const { data: txs } = await supabase
        .from('point_transactions')
        .select('amount')
        .eq('user_id', user.id)
        .eq('type', 'bonus')
        .gte('created_at', today.toISOString());

      const claimedToday = (txs || []).reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
      return jsonResponse(res, 200, {
        data: {
          claimed_today: claimedToday,
          daily_cap: 25,
          cap_reached: claimedToday >= 25
        }
      });
    }

    if (action === 'spin') {
      if (req.method !== 'POST') {
        return jsonResponse(res, 405, { error: 'Method not allowed' });
      }

      // Check daily UTC cap first
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);

      const { data: txs } = await supabase
        .from('point_transactions')
        .select('amount')
        .eq('user_id', user.id)
        .eq('type', 'bonus')
        .gte('created_at', today.toISOString());

      const claimedToday = (txs || []).reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
      if (claimedToday >= 25) {
        return jsonResponse(res, 400, { error: 'Daily VDX limit reached. Try again after midnight UTC.' });
      }

      // Check if they spun in the last 24h
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const { data: recentSpins } = await supabase
        .from('point_transactions')
        .select('id')
        .eq('user_id', user.id)
        .eq('type', 'bonus')
        .like('description', '%Daily spin reward%')
        .gte('created_at', oneDayAgo.toISOString());

      if (recentSpins && recentSpins.length > 0) {
        return jsonResponse(res, 400, { error: 'You have already spun the wheel today. Try again in 24 hours.' });
      }

      // Select random reward amount: [1, 2, 3, 5, 8, 10]
      const rewardOptions = [1, 2, 3, 5, 8, 10];
      let reward = rewardOptions[Math.floor(Math.random() * rewardOptions.length)];

      // Ensure we don't exceed the 25 daily cap
      if (claimedToday + reward > 25) {
        reward = Math.max(1, 25 - claimedToday);
      }

      // Query current balance to derive balance_after
      const { data: wallet } = await supabase
        .from('wallets')
        .select('*')
        .eq('user_id', user.id)
        .single();

      const currentBalance = Number(wallet?.vp_balance_cached || 0);
      const newBalance = currentBalance + reward;

      // Atomic insert transaction
      await supabase.from('point_transactions').insert({
        user_id: user.id,
        amount: reward,
        type: 'bonus',
        description: 'Daily spin reward',
        balance_after: newBalance
      });

      // Update cached wallet balance
      await supabase
        .from('wallets')
        .update({ vp_balance_cached: newBalance })
        .eq('user_id', user.id);

      return jsonResponse(res, 200, {
        data: {
          success: true,
          granted_vdx: reward,
          reward_balance_vdx: newBalance
        }
      });
    }

    return jsonResponse(res, 404, { error: `Unknown rewards action: ${action}` });
  } catch (err) {
    return handleError(res, err, 'auth/rewards');
  }
};
