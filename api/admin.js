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

const rateLimitMap = new Map();

function checkAdminRateLimit(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip) || { count: 0, reset: now + 900000 };
  if (now > entry.reset) {
    entry.count = 0;
    entry.reset = now + 900000;
  }
  if (entry.count >= 10) {
    return { allowed: false, ttl: Math.ceil((entry.reset - now) / 1000) };
  }
  entry.count++;
  rateLimitMap.set(ip, entry);
  return { allowed: true };
}

module.exports = async (req, res) => {
  setCORS(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const clientIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
    const passcode = req.headers['x-admin-passcode'] || req.query.passcode || (req.body && req.body.passcode);

    if (passcode !== 'ch.199456') {
      const rl = checkAdminRateLimit(clientIp);
      if (!rl.allowed) {
        return jsonResponse(res, 429, { error: `Too many invalid admin attempts from IP. Locked out for ${rl.ttl} seconds.` });
      }
      return jsonResponse(res, 403, { error: 'Access Denied: Invalid Master Admin Passcode (ch.199456 required)' });
    }

    const admin = await verifyAdmin(req);
    if (!admin) {
      return jsonResponse(res, 401, { error: 'Authenticated administrator access is required' });
    }

    const action = req.query.action;
    const supabase = getSupabase();

    if (action === 'ban-user') {
      const { user_id, reason } = req.body || {};
      if (!user_id) return jsonResponse(res, 400, { error: 'user_id required' });

      await adminBanUser(user_id, reason || 'Banned by admin via master panel');
      await supabase.from('profiles').update({
        is_banned: true,
        ban_reason: reason || 'Banned by admin',
        updated_at: new Date().toISOString()
      }).eq('id', user_id);

      await logAudit(admin.id, 'user_banned', { resource_type: 'user', resource_id: user_id, metadata: { reason } });
      return jsonResponse(res, 200, { success: true, message: `User ${user_id} has been banned and sessions terminated.` });
    }

    if (action === 'unban-user') {
      const { user_id } = req.body || {};
      if (!user_id) return jsonResponse(res, 400, { error: 'user_id required' });

      await supabase.from('profiles').update({
        is_banned: false,
        ban_reason: null,
        updated_at: new Date().toISOString()
      }).eq('id', user_id);

      await supabase.from('device_fingerprints').update({
        is_banned: false,
        ban_reason: null
      }).contains('known_user_ids', [user_id]);

      await logAudit(admin.id, 'user_unbanned', { resource_type: 'user', resource_id: user_id });
      return jsonResponse(res, 200, { success: true, message: `User ${user_id} has been unbanned and restored.` });
    }

    if (action === 'ban-wallet') {
      const { wallet_address, reason } = req.body || {};
      if (!wallet_address) return jsonResponse(res, 400, { error: 'wallet_address required' });

      const normAddr = wallet_address.trim().toLowerCase();
      const { data: wal } = await supabase
        .from('wallets')
        .select('user_id')
        .ilike('vdx_address', normAddr)
        .maybeSingle();

      if (wal && wal.user_id) {
        await supabase.from('profiles').update({
          is_banned: true,
          ban_reason: reason || `Wallet ${normAddr} banned by admin`
        }).eq('id', wal.user_id);
      }

      await logAudit(admin.id, 'wallet_banned', { resource_type: 'wallet', resource_id: normAddr, metadata: { reason } });
      return jsonResponse(res, 200, { success: true, message: `Wallet ${normAddr} and associated profile have been banned.` });
    }

    if (action === 'unban-wallet') {
      const { wallet_address } = req.body || {};
      if (!wallet_address) return jsonResponse(res, 400, { error: 'wallet_address required' });

      const normAddr = wallet_address.trim().toLowerCase();
      const { data: wal } = await supabase
        .from('wallets')
        .select('user_id')
        .ilike('vdx_address', normAddr)
        .maybeSingle();

      if (wal && wal.user_id) {
        await supabase.from('profiles').update({
          is_banned: false,
          ban_reason: null
        }).eq('id', wal.user_id);
      }

      await logAudit(admin.id, 'wallet_unbanned', { resource_type: 'wallet', resource_id: normAddr });
      return jsonResponse(res, 200, { success: true, message: `Wallet ${normAddr} and associated profile have been unbanned.` });
    }

    if (action === 'resolve-dispute') {
      const { trade_id, resolution, reason } = req.body || {};
      if (!trade_id || !resolution) return jsonResponse(res, 400, { error: 'trade_id and resolution required' });

      const now = new Date().toISOString();
      const { data: trade, error: fetchErr } = await supabase
        .from('verdex_p2p_trades')
        .select('*')
        .eq('id', trade_id)
        .maybeSingle();

      if (fetchErr || !trade) return jsonResponse(res, 404, { error: 'P2P Trade not found' });

      let newStatus = 'resolved';
      let escrowStatus = resolution === 'release_to_buyer' ? 'released' : 'refunded';

      if (resolution === 'release_to_buyer') {
        const { data: buyerCust } = await supabase
          .from('verdex_custodial_balances')
          .select('id, balance')
          .eq('user_id', trade.buyer_user_id)
          .eq('asset_symbol', 'VDX')
          .maybeSingle();

        const addAmt = Number(trade.amount_vdx || 0);
        if (buyerCust) {
          await supabase.from('verdex_custodial_balances').update({
            balance: Number(buyerCust.balance) + addAmt,
            updated_at: now
          }).eq('id', buyerCust.id);
        } else {
          await supabase.from('verdex_custodial_balances').insert({
            user_id: trade.buyer_user_id,
            asset_symbol: 'VDX',
            balance: addAmt,
            updated_at: now
          });
        }
      } else if (resolution === 'refund_to_seller') {
        const { data: sellerCust } = await supabase
          .from('verdex_custodial_balances')
          .select('id, balance')
          .eq('user_id', trade.seller_user_id)
          .eq('asset_symbol', 'VDX')
          .maybeSingle();

        const addAmt = Number(trade.amount_vdx || 0);
        if (sellerCust) {
          await supabase.from('verdex_custodial_balances').update({
            balance: Number(sellerCust.balance) + addAmt,
            updated_at: now
          }).eq('id', sellerCust.id);
        } else {
          await supabase.from('verdex_custodial_balances').insert({
            user_id: trade.seller_user_id,
            asset_symbol: 'VDX',
            balance: addAmt,
            updated_at: now
          });
        }
      } else if (resolution === 'cancel') {
        newStatus = 'cancelled';
        escrowStatus = 'cancelled';
      }

      await supabase.from('verdex_p2p_trades').update({
        status: newStatus,
        escrow_status: escrowStatus,
        resolution_notes: reason || `Admin resolved dispute: ${resolution}`,
        updated_at: now
      }).eq('id', trade_id);

      await logAudit(admin.id, 'p2p_dispute_resolved', {
        resource_type: 'trade',
        resource_id: trade_id,
        metadata: { resolution, reason }
      });

      return jsonResponse(res, 200, {
        success: true,
        message: `Trade ${trade_id} dispute resolved: ${resolution}`,
        trade_id,
        resolution,
        escrow_status: escrowStatus
      });
    }

    if (action === 'transfer-token') {
      const { recipient_address, recipient_user_id, recipient, token_symbol, amount, notes } = req.body || {};
      const targetInput = (recipient_user_id || recipient_address || recipient || '').trim();
      const symbol = (token_symbol || 'VDX').toUpperCase();
      const numAmt = Number(amount || 0);

      if (!targetInput || numAmt <= 0) {
        return jsonResponse(res, 400, { error: 'Recipient address/UID and positive amount required' });
      }

      let targetUserId = null;
      let targetAddress = targetInput.startsWith('0x') ? targetInput.toLowerCase() : null;

      if (!targetAddress && targetInput.length >= 20) {
        targetUserId = targetInput;
      }

      if (targetAddress && !targetUserId) {
        const { data: wal } = await supabase.from('wallets').select('user_id').ilike('vdx_address', targetAddress).maybeSingle();
        if (wal && wal.user_id) targetUserId = wal.user_id;
      }

      if (!targetUserId) {
        const { data: prof } = await supabase.from('profiles').select('id').or(`id.eq.${targetInput},username.eq.${targetInput},email.eq.${targetInput}`).maybeSingle();
        if (prof && prof.id) targetUserId = prof.id;
      }

      if (!targetUserId) {
        return jsonResponse(res, 404, { error: `Recipient user not found for input: ${targetInput}` });
      }

      const now = new Date().toISOString();

      if (symbol === 'VP') {
        const { data: wal } = await supabase.from('wallets').select('id, vp_balance_cached').eq('user_id', targetUserId).maybeSingle();
        if (wal) {
          await supabase.from('wallets').update({
            vp_balance_cached: Number(wal.vp_balance_cached || 0) + numAmt,
            updated_at: now
          }).eq('id', wal.id);
        } else {
          await supabase.from('wallets').insert({
            user_id: targetUserId,
            vp_balance_cached: numAmt,
            wallet_set_up: true
          });
        }
      } else {
        const { data: custBal } = await supabase.from('verdex_custodial_balances').select('id, balance').eq('user_id', targetUserId).eq('asset_symbol', symbol).maybeSingle();
        if (custBal) {
          await supabase.from('verdex_custodial_balances').update({
            balance: Number(custBal.balance) + numAmt,
            updated_at: now
          }).eq('id', custBal.id);
        } else {
          await supabase.from('verdex_custodial_balances').insert({
            user_id: targetUserId,
            asset_symbol: symbol,
            balance: numAmt,
            updated_at: now
          });
        }
      }

      await supabase.from('verdex_custodial_history').insert({
        user_id: admin.id || targetUserId,
        counterparty_user_id: targetUserId,
        type: 'admin_grant',
        asset_symbol: symbol,
        amount: numAmt,
        status: 'completed',
        memo: notes || 'Admin token transfer',
        created_at: now
      }).catch(() => {});

      await logAudit(admin.id, 'admin_token_transfer', {
        resource_type: 'user',
        resource_id: targetUserId,
        metadata: { symbol, amount: numAmt, notes }
      });

      return jsonResponse(res, 200, {
        success: true,
        message: `Successfully transferred ${numAmt} ${symbol} to user ${targetUserId}.`
      });
    }

    if (action === 'reverse-transfer') {
      const { transfer_id, reason } = req.body || {};
      if (!transfer_id) return jsonResponse(res, 400, { error: 'transfer_id required' });

      const now = new Date().toISOString();
      const { data: tx, error: txErr } = await supabase
        .from('verdex_custodial_history')
        .select('*')
        .eq('id', transfer_id)
        .maybeSingle();

      if (txErr || !tx) return jsonResponse(res, 404, { error: 'Transfer record not found' });

      const amt = Number(tx.amount || tx.amount_vdx || 0);
      if (amt <= 0 || !tx.user_id || !tx.counterparty_user_id) {
        return jsonResponse(res, 400, { error: 'Invalid transfer record for reversal' });
      }

      const { data: recvBal } = await supabase
        .from('verdex_custodial_balances')
        .select('id, balance')
        .eq('user_id', tx.counterparty_user_id)
        .eq('asset_symbol', tx.asset_symbol || 'VDX')
        .maybeSingle();

      if (recvBal) {
        await supabase.from('verdex_custodial_balances').update({
          balance: Math.max(0, Number(recvBal.balance) - amt),
          updated_at: now
        }).eq('id', recvBal.id);
      }

      const { data: sendBal } = await supabase
        .from('verdex_custodial_balances')
        .select('id, balance')
        .eq('user_id', tx.user_id)
        .eq('asset_symbol', tx.asset_symbol || 'VDX')
        .maybeSingle();

      if (sendBal) {
        await supabase.from('verdex_custodial_balances').update({
          balance: Number(sendBal.balance) + amt,
          updated_at: now
        }).eq('id', sendBal.id);
      }

      await logAudit(admin.id, 'transfer_reversed', {
        resource_type: 'transfer',
        resource_id: transfer_id,
        metadata: { amount: amt, from: tx.user_id, to: tx.counterparty_user_id, reason }
      });

      return jsonResponse(res, 200, {
        success: true,
        message: `Transfer ${transfer_id} of ${amt} ${tx.asset_symbol || 'VDX'} reversed successfully.`
      });
    }

    if (action === 'freeze-wallet') {
      const { wallet_address, is_frozen, reason } = req.body || {};
      if (!wallet_address) return jsonResponse(res, 400, { error: 'wallet_address required' });

      const normAddr = wallet_address.trim().toLowerCase();
      const { data: wal } = await supabase
        .from('wallets')
        .select('id')
        .ilike('vdx_address', normAddr)
        .maybeSingle();

      if (!wal) return jsonResponse(res, 404, { error: 'Wallet not found' });

      await supabase.from('wallets').update({
        is_frozen: !!is_frozen,
        freeze_reason: is_frozen ? (reason || 'Admin freeze') : null,
        updated_at: new Date().toISOString()
      }).eq('id', wal.id);

      await logAudit(admin.id, 'wallet_frozen', { resource_type: 'wallet', resource_id: normAddr, metadata: { is_frozen, reason } });
      return jsonResponse(res, 200, { success: true, message: `Wallet ${normAddr} frozen status set to ${!!is_frozen}` });
    }

    if (action === 'review-kyc') {
      const { case_id, decision, reason } = req.body || {};
      if (!case_id || !decision) return jsonResponse(res, 400, { error: 'case_id and decision required' });

      const now = new Date().toISOString();
      const newStatus = decision === 'approve' ? 'approved' : 'rejected';

      const { data: kycCase } = await supabase
        .from('verdex_kyc_cases')
        .select('*')
        .eq('id', case_id)
        .maybeSingle();

      if (!kycCase) return jsonResponse(res, 404, { error: 'KYC Case not found' });

      await supabase.from('verdex_kyc_cases').update({
        status: newStatus,
        updated_at: now
      }).eq('id', case_id);

      await supabase.from('profiles').update({
        kyc_status: newStatus,
        kyc_tier: decision === 'approve' ? 2 : 1,
        updated_at: now
      }).eq('id', kycCase.subject_user_id);

      await supabase.from('verdex_kyc_review_actions').insert({
        case_id: case_id,
        reviewer_user_id: admin.id,
        action: decision,
        from_status: kycCase.status,
        to_status: newStatus,
        reason_code: reason || `ADMIN_${decision.toUpperCase()}`,
        metadata: { admin_id: admin.id, timestamp: now }
      }).catch(() => {});

      await logAudit(admin.id, 'kyc_reviewed', {
        resource_type: 'kyc_case',
        resource_id: case_id,
        metadata: { decision, reason }
      });

      return jsonResponse(res, 200, {
        success: true,
        message: `KYC case ${case_id} ${newStatus}`,
        case_id,
        status: newStatus
      });
    }

    // Mainnet admin dashboard endpoints.
    const mainnetActions = ['validators', 'blocks', 'treasury', 'users', 'kyc-queue', 'system-health', 'chain-consistency'];
    if (mainnetActions.includes(action)) {
      return require('./_mainnet/handler')(req, res);
    }

    if (action === 'verify') {
      return jsonResponse(res, 200, { success: true, user: { id: admin.id, email: admin.email } });
    }

    if (action === 'transfer-token') {
      const { recipient_user_id, recipient_address, amount, token_symbol, notes } = req.body || {};
      const numAmount = Number(amount);
      if (!numAmount || numAmount <= 0) {
        return jsonResponse(res, 400, { error: 'Valid positive amount required' });
      }

      let targetUserId = recipient_user_id;

      if (!targetUserId && recipient_address) {
        const { data: wal } = await supabase
          .from('wallets')
          .select('user_id')
          .eq('vdx_address', recipient_address)
          .maybeSingle();
        if (wal) targetUserId = wal.user_id;
      }

      if (!targetUserId) {
        return jsonResponse(res, 404, { error: 'Recipient user or wallet address not found' });
      }

      const symbol = (token_symbol || 'VDX').toUpperCase();
      const now = new Date().toISOString();

      if (symbol === 'VP') {
        const { data: prof } = await supabase.from('profiles').select('vp_balance').eq('id', targetUserId).single();
        const newBal = (prof?.vp_balance || 0) + Math.round(numAmount);
        await supabase.from('profiles').update({ vp_balance: newBal, updated_at: now }).eq('id', targetUserId);
      } else {
        const { data: cust } = await supabase
          .from('verdex_custodial_balances')
          .select('id, balance')
          .eq('user_id', targetUserId)
          .eq('asset_symbol', symbol)
          .maybeSingle();

        const currentBal = Number(cust?.balance || 0);
        const newBal = currentBal + numAmount;

        if (cust) {
          await supabase.from('verdex_custodial_balances').update({ balance: newBal, updated_at: now }).eq('id', cust.id);
        } else {
          await supabase.from('verdex_custodial_balances').insert({
            user_id: targetUserId,
            asset_symbol: symbol,
            balance: newBal,
            updated_at: now
          });
        }
      }

      await logAudit(admin.id, 'admin_token_transfer', {
        resource_type: 'transfer',
        resource_id: targetUserId,
        metadata: { amount: numAmount, symbol, notes, recipient_address }
      });

      return jsonResponse(res, 200, {
        success: true,
        message: `Successfully transferred ${numAmount} ${symbol} to user ${targetUserId}`,
        amount: numAmount,
        symbol,
        recipient_user_id: targetUserId
      });
    }

    if (action === 'token-supply') {
      const totalSupply = 1000000000;
      const { data: custs } = await supabase.from('verdex_custodial_balances').select('balance, asset_symbol');
      const { data: profs } = await supabase.from('profiles').select('vp_balance');

      let totalCustodialVdx = 0;
      if (custs) {
        custs.forEach(c => {
          if (c.asset_symbol === 'VDX') totalCustodialVdx += Number(c.balance || 0);
        });
      }

      let totalMinedVp = 0;
      if (profs) {
        profs.forEach(p => {
          totalMinedVp += Number(p.vp_balance || 0);
        });
      }

      const circulatingSupply = totalCustodialVdx + (totalMinedVp / 100);

      return jsonResponse(res, 200, {
        success: true,
        total_supply: totalSupply,
        circulating_supply: circulatingSupply,
        custodial_vdx_pool: totalCustodialVdx,
        total_mined_vp: totalMinedVp,
        vdx_conversion_rate: '100 VP = 1 VDX',
        max_supply_label: '1,000,000,000 VDX'
      });
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
