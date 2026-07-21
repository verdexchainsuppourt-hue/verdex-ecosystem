const { getSupabase, verifyAdmin, jsonResponse, adminBanUser, logAudit, setCORS } = require('../lib/api-lib');

const ALLOWED_TABLES = [
  'profiles',
  'mining_sessions',
  'device_fingerprints',
  'point_transactions',
  'mining_config',
  'audit_logs',
  'wallets',
  'verdex_custodial_wallets',
  'verdex_p2p_orders',
  'verdex_p2p_trades',
  'verdex_kyc_cases',
  'verdex_kyc_review_actions',
  'chain_blocks',
  'chain_accounts',
  'chain_transactions',
  'chain_validators',
  'chain_meta'
];

// Per-table column allowlist — prevents admin from overwriting primary keys,
// privilege columns, or arbitrary fields via the PATCH endpoint.
const ALLOWED_FIELDS = {
  profiles: ['is_banned', 'ban_reason', 'full_name', 'username'],
  mining_config: ['value', 'description'],
  device_fingerprints: ['is_banned', 'ban_reason'],
  mining_sessions: ['status'],
  wallets: ['vdx_address', 'wallet_set_up'],
  chain_blocks: [],
  chain_accounts: [],
  chain_transactions: [],
  chain_validators: [],
  chain_meta: [],
  audit_logs: [],
  point_transactions: [],
};

function filterBody(table, body) {
  const allowed = ALLOWED_FIELDS[table];
  if (!allowed || allowed.length === 0) return {};
  const filtered = {};
  for (const key of allowed) {
    if (body.hasOwnProperty(key)) filtered[key] = body[key];
  }
  return filtered;
}

module.exports = async (req, res) => {
  setCORS(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const admin = await verifyAdmin(req);
    if (!admin) {
      return jsonResponse(res, 401, { error: 'Authenticated administrator access is required' });
    }

    const action = req.query.action;
    const supabase = getSupabase();

    // Mainnet admin dashboard endpoints.
    const mainnetActions = ['validators', 'blocks', 'treasury', 'users', 'kyc-queue', 'system-health', 'chain-consistency'];
    if (mainnetActions.includes(action)) {
      return require('./_mainnet/handler')(req, res);
    }

    if (action === 'verify') {
      return jsonResponse(res, 200, { success: true, user: { id: admin.id, email: admin.email } });
    }

    if (action === 'get') {
      const table = req.query.table;
      if (!ALLOWED_TABLES.includes(table)) {
        return jsonResponse(res, 400, { error: `Table '${table}' not whitelisted for admin access` });
      }

      const select = req.query.select || '*';
      const filter = req.query.filter;
      const search = req.query.search;
      const order = req.query.order;
      const offset = parseInt(req.query.offset) || 0;
      const limit = parseInt(req.query.limit) || 50;

      let query = supabase.from(table).select(select, { count: 'exact' });

      // Apply simple filter (e.g. status=eq.active)
      if (filter) {
        const parts = filter.split('&');
        for (const part of parts) {
          const [key, opVal] = part.split('=');
          if (key && opVal) {
            const [op, val] = opVal.split('.');
            if (op === 'eq') query = query.eq(key, val);
            else if (op === 'neq') query = query.neq(key, val);
            else if (op === 'gte') query = query.gte(key, val);
            else if (op === 'lte') query = query.lte(key, val);
            else if (op === 'like') query = query.like(key, val);
            else if (op === 'ilike') query = query.ilike(key, val);
          }
        }
      }

      // Apply search
      if (search) {
        if (search.startsWith('or=')) {
          // Pass direct OR string, stripping the or= prefix
          query = query.or(search.slice(3));
        } else {
          // If simple text, search columns depending on table
          if (table === 'profiles') {
            query = query.or(`full_name.ilike.*${search}*,username.ilike.*${search}*`);
          } else if (table === 'mining_sessions') {
            query = query.or(`device_name.ilike.*${search}*,device_fingerprint.ilike.*${search}*`);
          } else {
            query = query.ilike('name', `%${search}%`);
          }
        }
      }

      // Apply order (e.g. created_at.desc)
      if (order) {
        const [col, dir] = order.split('.');
        query = query.order(col, { ascending: dir === 'asc' });
      }

      // Range (Pagination)
      query = query.range(offset, offset + limit - 1);

      const { data, count, error } = await query;
      if (error) throw error;

      // Enrich profiles with email metadata from auth API
      if (table === 'profiles' && data && data.length > 0) {
        const enriched = await Promise.all(data.map(async (u) => {
          try {
            const { data: { user }, error: authErr } = await supabase.auth.admin.getUserById(u.id);
            if (authErr) throw authErr;
            return { ...u, email: user ? user.email : 'unknown' };
          } catch (e) {
            return { ...u, email: 'unknown' };
          }
        }));
        return jsonResponse(res, 200, { data: enriched, count });
      }

      return jsonResponse(res, 200, { data, count });
    }

    if (action === 'patch') {
      const table = req.query.table;
      if (!ALLOWED_TABLES.includes(table)) {
        return jsonResponse(res, 400, { error: `Table '${table}' not whitelisted for admin access` });
      }

      const filter = req.query.filter; // e.g. id=eq.user_id
      const body = req.body || {};

      if (!filter) {
        return jsonResponse(res, 400, { error: 'Filter query parameter is required for PATCH updates' });
      }

      // Extract target ID
      let targetId = null;
      const [key, opVal] = filter.split('=');
      if (key && opVal) {
        const [op, val] = opVal.split('.');
        if (op === 'eq') targetId = val;
      }

      if (!targetId) {
        return jsonResponse(res, 400, { error: 'Invalid filter format. Expected eq comparison.' });
      }

      // Cascade ban logic on profiles
      if (table === 'profiles' && body.is_banned !== undefined) {
        const isBanned = body.is_banned === true;
        if (isBanned) {
          // Banning: terminates sessions and bans all associated devices
          await adminBanUser(targetId, body.ban_reason || 'Banned by admin');
          // Also set is_banned on profile table
          const { error } = await supabase.from('profiles').update({
            is_banned: true,
            ban_reason: body.ban_reason || 'Banned by admin',
            updated_at: new Date().toISOString()
          }).eq('id', targetId);
          if (error) throw error;
        } else {
          // Unbanning user
          const { error } = await supabase.from('profiles').update({
            is_banned: false,
            ban_reason: null,
            updated_at: new Date().toISOString()
          }).eq('id', targetId);
          if (error) throw error;

          // Unban devices associated with this user
          await supabase.from('device_fingerprints').update({
            is_banned: false,
            ban_reason: null
          }).contains('known_user_ids', [targetId]);

          await logAudit(admin.id, 'user_unbanned', {
            resource_type: 'user',
            resource_id: targetId,
            success: true
          });
        }

        return jsonResponse(res, 200, { success: true });
      }

      // Standard update — filter body to allowed columns only
      const safeBody = filterBody(table, body);
      if (Object.keys(safeBody).length === 0) {
        return jsonResponse(res, 400, { error: 'No allowed fields to update for this table' });
      }
      let query = supabase.from(table).update(safeBody);
      if (key && opVal) {
        const [op, val] = opVal.split('.');
        if (op === 'eq') query = query.eq(key, val);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Log configuration updates in audit logs
      if (table === 'mining_config') {
        await logAudit(admin.id, 'config_updated', {
          resource_type: 'config',
          resource_id: targetId,
          metadata: { key: targetId, value: body.value }
        });
      }

      // Log manual device bans
      if (table === 'device_fingerprints' && body.is_banned !== undefined) {
        await logAudit(admin.id, body.is_banned ? 'device_banned' : 'device_unbanned', {
          resource_type: 'device',
          resource_id: targetId,
          metadata: { reason: body.ban_reason }
        });
      }

      return jsonResponse(res, 200, { success: true, data });
    }

    if (action === 'post') {
      const table = req.query.table;
      if (!ALLOWED_TABLES.includes(table)) {
        return jsonResponse(res, 400, { error: `Table '${table}' not whitelisted for admin access` });
      }

      const body = req.body || {};

      const { data, error } = await supabase.from(table).insert(body);
      if (error) throw error;

      // Log config created
      if (table === 'mining_config') {
        await logAudit(admin.id, 'config_updated', {
          resource_type: 'config',
          resource_id: body.key,
          metadata: { key: body.key, value: body.value }
        });
      }

      return jsonResponse(res, 200, { success: true, data });
    }

    return jsonResponse(res, 400, { error: `Invalid admin action: ${action}` });

  } catch (err) {
    console.error('[Admin Endpoint Exception]:', err);
    return jsonResponse(res, 500, { error: err.message || 'Internal server error' });
  }
};
