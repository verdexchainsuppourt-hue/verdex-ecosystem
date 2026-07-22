// /api/wallet — wallet + P2P marketplace + custodial wallet subsystem
const { verifyUser, getSupabase, jsonResponse, handleError, setCORS } = require('../lib/api-lib');

module.exports = async (req, res) => {
  if (req.query.ns === 'p2p') {
    return require('./_p2p/handler')(req, res);
  }

  // Custodial wallet subsystem — new actions.
  const custodialActions = [
    'custodial-balance', 'custodial-deposit-address', 'custodial-tokens',
    'custodial-withdraw', 'custodial-transfer', 'custodial-transfer-token',
    'custodial-history', 'custodial-deposits', 'custodial-withdrawals',
    'address-book', 'address-book-add', 'address-book-remove',
    'lookup-user',
    'escrow-lock', 'escrow-release', 'escrow-refund',
    'convert-vp-to-vdx', 'get-vp-balance',
    'admin-reconciliation', 'admin-expire-withdrawals',
    'admin-pending-withdrawals', 'admin-sign-withdrawal',
    'admin-health', 'admin-balances',
    'admin-audit-log', 'admin-risk-alerts', 'admin-escrow-locks'
  ];
  if (custodialActions.includes(req.query.action)) {
    return require('./_wallet/handler')(req, res);
  }

  // Handle profile / app-prefs update without requiring vdx_address
  if (req.query.action === 'profile') {
    try {
      const user = await verifyUser(req);
      if (!user) return jsonResponse(res, 401, { error: 'Not authenticated' });
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const supabase = getSupabase();

      const userMetadataUpdates = {};
      if (body.full_name) userMetadataUpdates.full_name = body.full_name;
      if (body.username) userMetadataUpdates.username = body.username;
      if (body.avatar_url) userMetadataUpdates.avatar_url = body.avatar_url;
      if (body.app_prefs) userMetadataUpdates.app_prefs = body.app_prefs;

      if (Object.keys(userMetadataUpdates).length > 0) {
        await supabase.auth.admin.updateUserById(user.id, {
          user_metadata: { ...(user.user_metadata || {}), ...userMetadataUpdates }
        }).catch(() => {});

        const profileUpdates = {};
        if (body.full_name) profileUpdates.full_name = body.full_name;
        if (body.username) profileUpdates.username = body.username;
        if (body.avatar_url) profileUpdates.avatar_url = body.avatar_url;
        if (Object.keys(profileUpdates).length > 0) {
          try {
            await supabase.from('profiles').update(profileUpdates).eq('id', user.id);
          } catch (_) {}
        }
      }

      return jsonResponse(res, 200, { success: true, message: 'Profile updated successfully.' });
    } catch (err) {
      return handleError(res, err, 'wallet/profile');
    }
  }

  // Legacy self-custody wallet address sync (backward compatible).
  if (req.method === 'POST' || req.method === 'PUT') {
    try {
      const user = await verifyUser(req);
      if (!user) return jsonResponse(res, 401, { error: 'Not authenticated' });

      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const { vdx_address } = body;

      if (!vdx_address || !/^0x[a-fA-F0-9]{40}$/.test(vdx_address)) {
        return jsonResponse(res, 400, { error: 'Invalid VDX address format' });
      }

      const supabase = getSupabase();
      const { data: existing } = await supabase.from('wallets').select('id').eq('user_id', user.id).maybeSingle();
      let error;
      if (existing) {
        const r = await supabase.from('wallets').update({ vdx_address, wallet_set_up: true }).eq('user_id', user.id);
        error = r.error;
      } else {
        const r = await supabase.from('wallets').insert({ user_id: user.id, vdx_address, wallet_set_up: true });
        error = r.error;
      }

      if (error) throw error;

      return jsonResponse(res, 200, { success: true, message: 'Wallet address synchronized.' });
    } catch (err) {
      return handleError(res, err, 'wallet/update');
    }
  }

  if (req.method !== 'GET') return jsonResponse(res, 405, { error: 'Method not allowed' });

  // Legacy: return VP wallet + point transactions.
  try {
    const user = await verifyUser(req);
    if (!user) return jsonResponse(res, 401, { error: 'Not authenticated' });

    const supabase = getSupabase();
    const limit = parseInt(req.query.limit) || 20;

    const [walletResult, txResult] = await Promise.all([
      supabase.from('wallets').select('*').eq('user_id', user.id).single(),
      supabase.from('point_transactions')
        .select('*').eq('user_id', user.id)
        .order('created_at', { ascending: false }).limit(limit)
    ]);

    return jsonResponse(res, 200, {
      wallet: walletResult.data || { vp_balance_cached: 0 },
      transactions: txResult.data || []
    });
  } catch (err) {
    return handleError(res, err, 'wallet');
  }
};
