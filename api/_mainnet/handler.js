/**
 * Verdex Mainnet Admin Dashboard API — validator status, block production,
 * treasury balances, KYC review, user management, and system health.
 *
 * All endpoints require admin or treasury signer authentication.
 */
const {
  getSupabase,
  verifyUser,
  verifyAdmin,
  jsonResponse,
  handleError,
  setCORS,
  checkRateLimit,
  isValidEvmAddress,
  logAudit
} = require('../../lib/api-lib');
const crypto = require('crypto');

function apiError(res, status, code, message) {
  return jsonResponse(res, status, {
    error: { code, message, trace_id: crypto.randomUUID() }
  });
}

// ---------------------------------------------------------------------------
// Validator Status — queries the RPC to get real-time validator info
// ---------------------------------------------------------------------------

async function validatorStatus(req, res) {
  const user = await verifyUser(req);
  if (!user) return apiError(res, 401, 'UNAUTHORIZED', 'Authentication required');
  const supabase = getSupabase();
  const admin = await verifyAdmin(req);
  if (!admin) return apiError(res, 403, 'FORBIDDEN', 'Admin access required');

  const rpcUrl = process.env.VDX_RPC_URL;
  if (!rpcUrl) {
    return jsonResponse(res, 200, {
      data: {
        status: 'mainnet_not_configured',
        validators: [],
        message: 'Mainnet RPC not yet configured. Set VDX_RPC_URL in environment.',
      }
    });
  }

  try {
    // Query the RPC for node info
    const [blockRes, syncRes, peerRes, validatorRes] = await Promise.all([
      rpcCall(rpcUrl, 'eth_blockNumber'),
      rpcCall(rpcUrl, 'eth_syncing'),
      rpcCall(rpcUrl, 'net_peerCount'),
      rpcCall(rpcUrl, 'qbft_getValidatorsByBlockNumber', ['latest']),
    ]);

    const blockNumber = blockRes?.result ? parseInt(blockRes.result, 16) : 0;
    const syncing = syncRes?.result !== false;
    const peers = peerRes?.result ? parseInt(peerRes.result, 16) : 0;
    const validators = validatorRes?.result || [];

    return jsonResponse(res, 200, {
      data: {
        status: syncing ? 'syncing' : 'synced',
        block_number: blockNumber,
        peers: peers,
        validator_count: validators.length,
        validators: validators.map(addr => ({
          address: addr,
          status: 'active',
        })),
        rpc_url: rpcUrl.replace(/\/$/, ''),
        chain_id: Number(process.env.VERDEX_MAINNET_CHAIN_ID || 72010),
        timestamp: new Date().toISOString(),
      }
    });
  } catch (e) {
    return jsonResponse(res, 200, {
      data: {
        status: 'rpc_unreachable',
        error: e.message,
        validators: [],
        timestamp: new Date().toISOString(),
      }
    });
  }
}

async function rpcCall(rpcUrl, method, params = []) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`RPC HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// Block Production Stats
// ---------------------------------------------------------------------------

async function blockProduction(req, res) {
  const user = await verifyUser(req);
  if (!user) return apiError(res, 401, 'UNAUTHORIZED', 'Authentication required');
  const admin = await verifyAdmin(req);
  if (!admin) return apiError(res, 403, 'FORBIDDEN', 'Admin access required');

  const rpcUrl = process.env.VDX_RPC_URL;
  if (!rpcUrl) {
    return jsonResponse(res, 200, { data: { blocks: [], message: 'RPC not configured' } });
  }

  try {
    // Get latest 20 blocks
    const latestRes = await rpcCall(rpcUrl, 'eth_blockNumber');
    const latest = latestRes?.result ? parseInt(latestRes.result, 16) : 0;

    const blocks = [];
    for (let i = 0; i < Math.min(20, latest + 1); i++) {
      const blockNum = '0x' + (latest - i).toString(16);
      const blockRes = await rpcCall(rpcUrl, 'eth_getBlockByNumber', [blockNum, false]);
      if (blockRes?.result) {
        const b = blockRes.result;
        blocks.push({
          number: parseInt(b.number, 16),
          hash: b.hash,
          miner: b.miner,
          tx_count: b.transactions?.length || 0,
          gas_used: b.gasUsed ? parseInt(b.gasUsed, 16) : 0,
          gas_limit: b.gasLimit ? parseInt(b.gasLimit, 16) : 0,
          timestamp: b.timestamp ? parseInt(b.timestamp, 16) * 1000 : null,
          size: b.size ? parseInt(b.size, 16) : 0,
        });
      }
    }

    // Calculate block production rate (blocks per minute from timestamps)
    let bps = 0;
    if (blocks.length >= 2) {
      const timeSpan = (blocks[0].timestamp - blocks[blocks.length - 1].timestamp) / 1000;
      bps = timeSpan > 0 ? blocks.length / timeSpan : 0;
    }

    return jsonResponse(res, 200, {
      data: {
        latest_block: latest,
        blocks: blocks,
        blocks_per_second: bps.toFixed(2),
        avg_block_time: bps > 0 ? (1 / bps).toFixed(1) + 's' : '—',
        timestamp: new Date().toISOString(),
      }
    });
  } catch (e) {
    return apiError(res, 500, 'RPC_ERROR', 'Failed to fetch block data: ' + e.message);
  }
}

// ---------------------------------------------------------------------------
// Treasury Balances
// ---------------------------------------------------------------------------

async function treasuryBalances(req, res) {
  const user = await verifyUser(req);
  if (!user) return apiError(res, 401, 'UNAUTHORIZED', 'Authentication required');
  const admin = await verifyAdmin(req);
  if (!admin) return apiError(res, 403, 'FORBIDDEN', 'Admin access required');

  const supabase = getSupabase();

  // Get total custodial balances across all users
  const { data: walletBalances, error: wErr } = await supabase
    .from('verdex_custodial_balances')
    .select('available_atomic, pending_atomic, locked_atomic');

  const totals = {
    available: '0',
    pending: '0',
    locked: '0',
  };

  if (walletBalances) {
    let avail = 0n, pend = 0n, lock = 0n;
    for (const b of walletBalances) {
      avail += BigInt(b.available_atomic || '0');
      pend += BigInt(b.pending_atomic || '0');
      lock += BigInt(b.locked_atomic || '0');
    }
    totals.available = avail.toString();
    totals.pending = pend.toString();
    totals.locked = lock.toString();
  }

  // Get pending withdrawals
  const { count: pendingWithdrawals } = await supabase
    .from('verdex_custodial_withdrawals')
    .select('id', { count: 'exact', head: true })
    .in('status', ['requested', 'awaiting_signatures', 'approved', 'processing']);

  // Get total users with wallets
  const { count: totalWallets } = await supabase
    .from('verdex_custodial_wallets')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'active');

  // Get treasury signer info
  const { data: signers } = await supabase
    .from('verdex_custodial_treasury_signers')
    .select('user_id, role, is_active, granted_at')
    .eq('is_active', true);

  return jsonResponse(res, 200, {
    data: {
      custodial_totals: {
        available_vdx: (Number(totals.available) / 1e18).toFixed(4),
        available_atomic: totals.available,
        pending_vdx: (Number(totals.pending) / 1e18).toFixed(4),
        pending_atomic: totals.pending,
        locked_vdx: (Number(totals.locked) / 1e18).toFixed(4),
        locked_atomic: totals.locked,
      },
      pending_withdrawals: pendingWithdrawals || 0,
      active_wallets: totalWallets || 0,
      treasury_signers: signers || [],
      timestamp: new Date().toISOString(),
    }
  });
}

// ---------------------------------------------------------------------------
// User Management (admin)
// ---------------------------------------------------------------------------

async function userManagement(req, res) {
  const user = await verifyUser(req);
  if (!user) return apiError(res, 401, 'UNAUTHORIZED', 'Authentication required');
  const admin = await verifyAdmin(req);
  if (!admin) return apiError(res, 403, 'FORBIDDEN', 'Admin access required');

  const supabase = getSupabase();
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  const search = req.query.search;

  let q = supabase
    .from('profiles')
    .select('id, username, full_name, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (search) {
    q = q.or(`username.ilike.%${search}%,full_name.ilike.%${search}%`);
  }

  const { data, error, count } = await q;
  if (error) return apiError(res, 500, 'DB_ERROR', 'Failed to load users');

  return jsonResponse(res, 200, {
    data: data || [],
    total: count || 0,
    offset,
    limit,
  });
}

// ---------------------------------------------------------------------------
// KYC Review Queue (admin)
// ---------------------------------------------------------------------------

async function kycReviewQueue(req, res) {
  const user = await verifyUser(req);
  if (!user) return apiError(res, 401, 'UNAUTHORIZED', 'Authentication required');
  const admin = await verifyAdmin(req);
  if (!admin) return apiError(res, 403, 'FORBIDDEN', 'Admin access required');

  const supabase = getSupabase();
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);

  const { data, error } = await supabase
    .from('verdex_kyc_cases')
    .select('id, subject_user_id, status, country_code, verification_level, risk_tier, submitted_at, review_started_at, created_at')
    .in('status', ['submitted', 'in_review', 'needs_resubmission'])
    .order('submitted_at', { ascending: true })
    .limit(limit);

  if (error) return apiError(res, 500, 'DB_ERROR', 'Failed to load KYC queue');

  return jsonResponse(res, 200, {
    data: data || [],
    count: data?.length || 0,
  });
}

// ---------------------------------------------------------------------------
// System Health (comprehensive)
// ---------------------------------------------------------------------------

async function systemHealth(req, res) {
  const user = await verifyUser(req);
  if (!user) return apiError(res, 401, 'UNAUTHORIZED', 'Authentication required');
  const admin = await verifyAdmin(req);
  if (!admin) return apiError(res, 403, 'FORBIDDEN', 'Admin access required');

  const supabase = getSupabase();

  // Gather all health metrics in parallel
  const [
    walletsRes, kycPendingRes, withdrawalsRes, depositsRes,
    amlRes, p2pTradesRes, p2pDisputesRes, custodialConfigRes
  ] = await Promise.all([
    supabase.from('verdex_custodial_wallets').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('verdex_kyc_cases').select('id', { count: 'exact', head: true }).in('status', ['submitted', 'in_review']),
    supabase.from('verdex_custodial_withdrawals').select('id', { count: 'exact', head: true }).in('status', ['requested', 'awaiting_signatures', 'approved']),
    supabase.from('verdex_custodial_deposits').select('id', { count: 'exact', head: true }).in('status', ['detected', 'confirming']),
    supabase.from('verdex_custodial_aml_screenings').select('id', { count: 'exact', head: true }).in('risk_level', ['medium', 'high']).is('review_decision', null),
    supabase.from('verdex_p2p_trades').select('id', { count: 'exact', head: true }).in('status', ['awaiting_escrow', 'escrow_locked', 'payment_marked_sent', 'payment_confirmed']),
    supabase.from('verdex_p2p_disputes').select('id', { count: 'exact', head: true }).in('status', ['opened', 'evidence_collection', 'under_review']),
    supabase.from('verdex_custodial_config').select('*').eq('singleton', true).maybeSingle(),
  ]);

  // Check RPC health
  let rpcStatus = 'not_configured';
  let rpcBlock = null;
  const rpcUrl = process.env.VDX_RPC_URL;
  if (rpcUrl) {
    try {
      const blockRes = await rpcCall(rpcUrl, 'eth_blockNumber');
      rpcBlock = blockRes?.result ? parseInt(blockRes.result, 16) : null;
      rpcStatus = rpcBlock !== null ? 'online' : 'error';
    } catch {
      rpcStatus = 'offline';
    }
  }

  return jsonResponse(res, 200, {
    data: {
      blockchain: {
        rpc_status: rpcStatus,
        latest_block: rpcBlock,
        chain_id: Number(process.env.VERDEX_MAINNET_CHAIN_ID || 72010),
      },
      custodial_wallet: {
        active_wallets: walletsRes.count || 0,
        pending_deposits: depositsRes.count || 0,
        pending_withdrawals: withdrawalsRes.count || 0,
        aml_review_queue: amlRes.count || 0,
        config: {
          deposits_enabled: custodialConfigRes.data?.deposits_enabled ?? false,
          withdrawals_enabled: custodialConfigRes.data?.withdrawals_enabled ?? false,
          transfers_enabled: custodialConfigRes.data?.transfers_enabled ?? false,
        },
      },
      kyc: {
        pending_reviews: kycPendingRes.count || 0,
      },
      p2p: {
        active_trades: p2pTradesRes.count || 0,
        open_disputes: p2pDisputesRes.count || 0,
      },
      timestamp: new Date().toISOString(),
    }
  });
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
module.exports = async (req, res) => {
  setCORS(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const action = req.query.action || '';
    if (action === 'validators') return await validatorStatus(req, res);
    if (action === 'blocks') return await blockProduction(req, res);
    if (action === 'treasury') return await treasuryBalances(req, res);
    if (action === 'users') return await userManagement(req, res);
    if (action === 'kyc-queue') return await kycReviewQueue(req, res);
    if (action === 'system-health') return await systemHealth(req, res);
    if (action === 'chain-consistency') return await require('./consistency')(req, res);
    return apiError(res, 404, 'NOT_FOUND', `Unknown mainnet admin action: ${action}`);
  } catch (err) {
    return handleError(res, err, 'mainnet-admin');
  }
};
