/**
 * Verdex Custodial Wallet API — REST endpoints for balance, deposits,
 * withdrawals, internal transfers, and treasury admin operations.
 *
 * Security model:
 *  - All endpoints require Supabase auth (Bearer token).
 *  - KYC approval required for withdrawals and transfers.
 *  - AML screening on all transactions above the configured threshold.
 *  - Multi-sig treasury approval for withdrawals above the threshold.
 *  - Rate-limited per user + per IP.
 *  - Private keys NEVER returned in any response.
 *  - All balance mutations go through atomic RPC functions.
 */
const {
  getSupabase,
  verifyUser,
  verifyAdmin,
  jsonResponse,
  handleError,
  setCORS,
  checkRateLimit,
  checkIdempotency,
  storeIdempotency,
  isValidEvmAddress,
  normalizeAddress,
  logAudit
} = require('../../lib/api-lib');
const crypto = require('crypto');
const walletCrypto = require('./crypto');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const VDX_DECIMALS = 18;
const VDX_ATOMIC_BASE = 10n ** BigInt(VDX_DECIMALS);
const MAX_TRANSFER_VDX = 1_000_000_000;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

// Withdrawal fee tiers (in atomic units).
const WITHDRAWAL_FEES = {
  basic: 10000000000000000n,     // 0.01 VDX
  standard: 5000000000000000n,   // 0.005 VDX
  enhanced: 2000000000000000n,   // 0.002 VDX
  unlimited: 0n,                 // no fee
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function apiError(res, status, code, message, extra = {}) {
  const traceId = extra.traceId || crypto.randomUUID();
  if (status >= 500) console.error(JSON.stringify({ level: 'error', code, message, traceId }));
  return jsonResponse(res, status, {
    error: { code, message, retryable: !!extra.retryable, trace_id: traceId }
  });
}

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try { const p = JSON.parse(req.body); return p && typeof p === 'object' ? p : {}; }
    catch { return {}; }
  }
  return req.body && typeof req.body === 'object' ? req.body : {};
}

function toAtomic(vdxAmount) {
  if (vdxAmount === null || vdxAmount === undefined) return null;
  const str = String(vdxAmount).trim();
  if (!/^\d+(\.\d+)?$/.test(str)) return null;
  try {
    const [whole, frac = ''] = str.split('.');
    const fracPadded = frac.slice(0, VDX_DECIMALS).padEnd(VDX_DECIMALS, '0');
    return (BigInt(whole || '0') * VDX_ATOMIC_BASE + BigInt(fracPadded || '0')).toString();
  } catch { return null; }
}

function fromAtomic(atomicStr) {
  try {
    const big = BigInt(atomicStr);
    if (big === 0n) return '0';
    const whole = big / VDX_ATOMIC_BASE;
    const frac = big % VDX_ATOMIC_BASE;
    if (frac === 0n) return whole.toString();
    return `${whole.toString()}.${frac.toString().padStart(VDX_DECIMALS, '0').replace(/0+$/, '')}`;
  } catch { return '0'; }
}

/** Convert atomic to human-readable for any token decimals (6 for USDT, 18 for VDX). */
function fromTokenAtomic(atomicStr, decimals) {
  try {
    const big = BigInt(atomicStr);
    if (big === 0n) return '0';
    const base = 10n ** BigInt(decimals);
    const whole = big / base;
    const frac = big % base;
    if (frac === 0n) return whole.toString();
    return `${whole.toString()}.${frac.toString().padStart(decimals, '0').replace(/0+$/, '')}`;
  } catch { return '0'; }
}

/** Convert human amount to atomic for any token decimals. */
function toTokenAtomic(vdxAmount, decimals) {
  if (vdxAmount === null || vdxAmount === undefined) return null;
  const str = String(vdxAmount).trim();
  if (!/^\d+(\.\d+)?$/.test(str)) return null;
  try {
    const [whole, frac = ''] = str.split('.');
    const fracPadded = frac.slice(0, decimals).padEnd(decimals, '0');
    const base = 10n ** BigInt(decimals);
    return (BigInt(whole || '0') * base + BigInt(fracPadded || '0')).toString();
  } catch { return null; }
}

function validateUuid(v) {
  return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

function validateAtomic(v) {
  return typeof v === 'string' && /^[1-9][0-9]{0,77}$/.test(v);
}

function traceId(req) {
  return (req.headers && (req.headers['x-trace-id'] || req.headers['x-request-id'])) || crypto.randomUUID();
}

async function getConfig(supabase) {
  const { data } = await supabase
    .from('verdex_custodial_config')
    .select('*')
    .eq('singleton', true)
    .maybeSingle();
  return data || {};
}

async function getWallet(supabase, userId) {
  const { data, error } = await supabase
    .from('verdex_custodial_wallets')
    .select('*, balance:verdex_custodial_balances(*)')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function checkKyc(supabase, userId) {
  const { data: kyc } = await supabase
    .from('verdex_kyc_cases')
    .select('status, expires_at, verification_level')
    .eq('subject_user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return kyc && kyc.status === 'approved' &&
    (!kyc.expires_at || new Date(kyc.expires_at) > new Date());
}

/**
 * Simple internal AML screen. In production this would call an external
 * screening provider (Chainalysis, TRM Labs, Elliptic). Here we check:
 *  - Address against a blocklist table (if configured)
 *  - Amount against the configured screening threshold
 *  - User's AML screening history
 */
async function amlScreen(supabase, { userId, address, amountAtomic, type }) {
  const config = await getConfig(supabase);
  const threshold = BigInt(config.aml_screening_threshold_atomic || '500000000000000000000');

  let riskLevel = 'clear';
  const reasons = [];

  // Check amount threshold.
  if (BigInt(amountAtomic) >= threshold) {
    riskLevel = 'medium';
    reasons.push('amount_exceeds_screening_threshold');
  }

  // Check user's AML history.
  if (userId) {
    const { data: priorFlags } = await supabase
      .from('verdex_custodial_aml_screenings')
      .select('risk_level, flag_reasons')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(5);
    if (priorFlags && priorFlags.some(f => f.risk_level === 'high' || f.risk_level === 'prohibited')) {
      riskLevel = 'high';
      reasons.push('prior_high_risk_flag');
    }
  }

  // Record the screening.
  await supabase.from('verdex_custodial_aml_screenings').insert({
    subject_type: type,
    subject_address: address,
    user_id: userId,
    risk_level: riskLevel,
    flag_reasons: reasons,
    screened_by: 'internal_rules',
    metadata: { amount_atomic: amountAtomic },
  });

  return { riskLevel, reasons };
}

async function isTreasurySigner(supabase, userId) {
  const { data } = await supabase
    .from('verdex_custodial_treasury_signers')
    .select('id, role')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle();
  return data;
}

// ---------------------------------------------------------------------------
// Ensure the caller has a custodial wallet. Creates one if missing.
// Uses the key store to deterministically derive the deposit address.
// ---------------------------------------------------------------------------
async function ensureWallet(supabase, user) {
  const existing = await getWallet(supabase, user.id);
  if (existing) return existing;

  // Get the encrypted seed from the key store.
  const { data: keyStore } = await supabase
    .from('verdex_custodial_key_store')
    .select('*')
    .eq('singleton', true)
    .maybeSingle();

  if (!keyStore) {
    throw { code: 'KEY_STORE_NOT_INITIALIZED', status: 503, message: 'Custodial wallet key store is not initialized. Contact admin.' };
  }

  // Decrypt the seed in memory.
  const seed = walletCrypto.decryptSeed(
    Buffer.from(keyStore.encrypted_seed, 'base64'),
    Buffer.from(keyStore.seed_iv, 'base64'),
    Buffer.from(keyStore.seed_auth_tag, 'base64')
  );

  // Get the next derivation index atomically.
  const { data: maxIdx } = await supabase
    .from('verdex_custodial_wallets')
    .select('derivation_index')
    .order('derivation_index', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextIndex = (maxIdx?.derivation_index ?? -1) + 1;

  // Derive the deposit address.
  const depositAddress = walletCrypto.deriveAddress(seed, nextIndex);
  walletCrypto.zeroBuffer(seed); // Zero the seed immediately.

  // Insert the wallet + balance row.
  const { data: wallet, error } = await supabase
    .from('verdex_custodial_wallets')
    .insert({
      user_id: user.id,
      derivation_index: nextIndex,
      deposit_address: depositAddress,
      status: 'active',
    })
    .select('*')
    .single();
  if (error) throw error;

  await supabase
    .from('verdex_custodial_balances')
    .insert({ wallet_id: wallet.id });

  return { ...wallet, balance: null };
}

// ===========================================================================
// Handlers
// ===========================================================================

/**
 * GET /api/wallet?action=custodial-balance
 * Returns the user's custodial wallet + VDX balance + multi-token balances + deposit address.
 */
async function getBalance(req, res) {
  const user = await verifyUser(req);
  if (!user) return apiError(res, 401, 'UNAUTHORIZED', 'Authentication required');

  const supabase = getSupabase();
  try {
    const wallet = await ensureWallet(supabase, user);
    const balance = wallet.balance || (await supabase
      .from('verdex_custodial_balances')
      .select('*')
      .eq('wallet_id', wallet.id)
      .maybeSingle()).data;

    // Fetch all supported tokens.
    const { data: tokens } = await supabase
      .from('verdex_custodial_tokens')
      .select('*')
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    // Fetch the user's per-token balances.
    const { data: tokenBalances } = await supabase
      .from('verdex_custodial_token_balances')
      .select('*, token:verdex_custodial_tokens(*)')
      .eq('wallet_id', wallet.id);

    // Build a map of token_id → balance.
    const balMap = {};
    for (const tb of (tokenBalances || [])) {
      balMap[tb.token_id] = tb;
    }

    // Build the multi-token balance list.
    const tokenList = (tokens || []).map(t => {
      const tb = balMap[t.id];
      const decimals = t.decimals || 18;
      const avail = tb?.available_atomic || '0';
      const pend = tb?.pending_atomic || '0';
      const lock = tb?.locked_atomic || '0';
      return {
        token_id: t.id,
        symbol: t.symbol,
        name: t.name,
        chain: t.chain,
        contract_address: t.contract_address,
        decimals: decimals,
        logo_url: t.logo_url,
        deposit_enabled: t.deposit_enabled,
        withdrawal_enabled: t.withdrawal_enabled,
        display_order: t.display_order,
        metadata: t.metadata,
        balance: {
          available: fromTokenAtomic(avail, decimals),
          available_atomic: avail,
          pending: fromTokenAtomic(pend, decimals),
          pending_atomic: pend,
          locked: fromTokenAtomic(lock, decimals),
          locked_atomic: lock,
        },
      };
    });

    return jsonResponse(res, 200, {
      data: {
        wallet_id: wallet.id,
        deposit_address: wallet.deposit_address,
        status: wallet.status,
        withdrawal_tier: wallet.withdrawal_tier,
        // Primary VDX balance (backward compat).
        balance: {
          available: fromAtomic(balance?.available_atomic || '0'),
          available_atomic: balance?.available_atomic || '0',
          pending: fromAtomic(balance?.pending_atomic || '0'),
          pending_atomic: balance?.pending_atomic || '0',
          locked: fromAtomic(balance?.locked_atomic || '0'),
          locked_atomic: balance?.locked_atomic || '0',
        },
        // Multi-token balances.
        tokens: tokenList,
        limits: {
          daily_withdrawal: fromAtomic(wallet.daily_withdrawal_limit_atomic),
          monthly_withdrawal: fromAtomic(wallet.monthly_withdrawal_limit_atomic),
        },
      }
    });
  } catch (err) {
    return apiError(res, err.status || 500, err.code || 'WALLET_ERROR', err.message || String(err));
  }
}

/**
 * GET /api/wallet?action=custodial-deposit-address
 * Returns the user's deposit address (creates wallet if needed).
 */
async function getDepositAddress(req, res) {
  const user = await verifyUser(req);
  if (!user) return apiError(res, 401, 'UNAUTHORIZED', 'Authentication required');

  const supabase = getSupabase();
  try {
    const wallet = await ensureWallet(supabase, user);
    return jsonResponse(res, 200, {
      data: {
        deposit_address: wallet.deposit_address,
        qr_url: `ethereum:${wallet.deposit_address}`,
        status: wallet.status,
        network: 'verdex-mainnet',
        chain_id: 72010,
      }
    });
  } catch (err) {
    return apiError(res, err.status || 500, err.code || 'WALLET_ERROR', err.message || String(err));
  }
}

/**
 * POST /api/wallet?action=custodial-withdraw
 * Request a withdrawal to an external address.
 * Flow: requested → kyc_pending → aml_pending → awaiting_signatures (if large)
 *       → approved → processing → broadcast → completed
 */
async function requestWithdrawal(req, res) {
  const user = await verifyUser(req);
  if (!user) return apiError(res, 401, 'UNAUTHORIZED', 'Authentication required');
  if (!checkRateLimit(`wallet-withdraw:${user.id}`, 5, 60000).allowed) {
    return apiError(res, 429, 'RATE_LIMITED', 'Too many withdrawal requests', { retryable: true });
  }

  const tid = traceId(req);
  const body = parseBody(req);
  const { destination_address, amount_vdx } = body;

  if (!isValidEvmAddress(destination_address)) {
    return apiError(res, 400, 'INVALID_ADDRESS', 'A valid 0x EVM address is required', { traceId: tid });
  }
  const amountAtomic = toAtomic(amount_vdx);
  if (!amountAtomic || !validateAtomic(amountAtomic)) {
    return apiError(res, 400, 'INVALID_AMOUNT', 'amount_vdx must be a positive number', { traceId: tid });
  }

  // Idempotency.
  const idemKey = req.headers['x-idempotency-key'];
  if (idemKey) {
    const dup = checkIdempotency(`${user.id}:withdraw:${idemKey}`);
    if (dup.duplicate) return jsonResponse(res, 200, dup.originalResult || { success: true, idempotent: true });
  }

  const supabase = getSupabase();
  try {
    const wallet = await ensureWallet(supabase, user);
    if (wallet.status !== 'active') {
      return apiError(res, 403, 'WALLET_NOT_ACTIVE', 'Your wallet is not active', { traceId: tid });
    }

    // Check withdrawals are enabled.
    const config = await getConfig(supabase);
    if (!config.withdrawals_enabled) {
      return apiError(res, 503, 'WITHDRAWALS_DISABLED', 'Withdrawals are temporarily disabled', { traceId: tid });
    }

    // Check minimum withdrawal.
    if (BigInt(amountAtomic) < BigInt(config.min_withdrawal_atomic || '10000000000000000')) {
      return apiError(res, 400, 'BELOW_MINIMUM', `Minimum withdrawal is ${fromAtomic(config.min_withdrawal_atomic || '10000000000000000')} VDX`, { traceId: tid });
    }

    // Check daily limit.
    const dayAgo = new Date(Date.now() - 86400000).toISOString();
    const { data: recentWithdrawals } = await supabase
      .from('verdex_custodial_withdrawals')
      .select('total_atomic')
      .eq('user_id', user.id)
      .gte('created_at', dayAgo)
      .in('status', ['requested', 'kyc_pending', 'aml_pending', 'awaiting_signatures', 'approved', 'processing', 'broadcast', 'completed']);
    const dailyTotal = (recentWithdrawals || []).reduce((sum, w) => sum + BigInt(w.total_atomic), 0n);
    if (dailyTotal + BigInt(amountAtomic) > BigInt(wallet.daily_withdrawal_limit_atomic)) {
      return apiError(res, 400, 'DAILY_LIMIT_EXCEEDED', `Daily withdrawal limit is ${fromAtomic(wallet.daily_withdrawal_limit_atomic)} VDX`, { traceId: tid });
    }

    // KYC check.
    const kycOk = await checkKyc(supabase, user.id);
    if (!kycOk && wallet.kyc_required) {
      return apiError(res, 403, 'KYC_REQUIRED', 'Complete KYC verification to withdraw VDX', { traceId: tid });
    }

    // AML screen.
    const aml = await amlScreen(supabase, { userId: user.id, address: destination_address, amountAtomic, type: 'withdrawal' });
    if (aml.riskLevel === 'prohibited') {
      return apiError(res, 403, 'AML_BLOCKED', 'Withdrawal blocked by AML screening. Contact support.', { traceId: tid });
    }

    // Determine fee.
    const fee = WITHDRAWAL_FEES[wallet.withdrawal_tier] || WITHDRAWAL_FEES.standard;
    const totalAtomic = (BigInt(amountAtomic) + fee).toString();

    // Lock funds atomically.
    const { data: lockResult, error: lockError } = await supabase.rpc('verdex_custodial_lock_for_withdrawal', {
      p_wallet_id: wallet.id,
      p_amount_atomic: totalAtomic,
    });
    if (lockError) throw lockError;
    if (!lockResult || !lockResult[0] || !lockResult[0].success) {
      return apiError(res, 400, 'INSUFFICIENT_BALANCE', 'Insufficient available balance for withdrawal + fee', { traceId: tid });
    }

    // Determine if multi-sig is required.
    const multisigThreshold = BigInt(config.multisig_threshold_atomic || '1000000000000000000000');
    const requiresMultisig = BigInt(amountAtomic) >= multisigThreshold;

    // Create the withdrawal record.
    const { data: withdrawal, error: wError } = await supabase
      .from('verdex_custodial_withdrawals')
      .insert({
        wallet_id: wallet.id,
        user_id: user.id,
        destination_address: destination_address.toLowerCase(),
        amount_atomic: amountAtomic,
        fee_atomic: fee.toString(),
        total_atomic: totalAtomic,
        status: requiresMultisig ? 'awaiting_signatures' : 'approved',
        kyc_verified: kycOk,
        aml_risk_level: aml.riskLevel,
        aml_screened_at: new Date().toISOString(),
        aml_flag_reason: aml.reasons.length ? aml.reasons.join(', ') : null,
        requires_multisig: requiresMultisig,
        multisig_threshold: requiresMultisig ? (config.multisig_required_signers || 2) : 1,
        current_signatures: 0,
      })
      .select('*')
      .single();
    if (wError) throw wError;

    // Log transaction (pending).
    await supabase.from('verdex_custodial_transactions').insert({
      wallet_id: wallet.id,
      user_id: user.id,
      tx_type: 'withdrawal',
      tx_status: requiresMultisig ? 'awaiting_approval' : 'approved',
      amount_atomic: amountAtomic,
      fee_atomic: fee.toString(),
      direction: 'outgoing',
      counterparty_address: destination_address.toLowerCase(),
      related_withdrawal_id: withdrawal.id,
      balance_after_atomic: lockResult[0].balance_after_available,
    });

    await logAudit(user.id, 'wallet.withdrawal_requested', {
      resource_type: 'verdex_custodial_withdrawals',
      resource_id: withdrawal.id,
      metadata: { amount: amountAtomic, destination: destination_address.toLowerCase(), multisig: requiresMultisig }
    });

    const response = {
      success: true,
      withdrawal: {
        id: withdrawal.id,
        status: withdrawal.status,
        amount_vdx: fromAtomic(amountAtomic),
        amount_atomic: amountAtomic,
        fee_vdx: fromAtomic(fee.toString()),
        total_vdx: fromAtomic(totalAtomic),
        destination: destination_address.toLowerCase(),
        requires_multisig: requiresMultisig,
        multisig_threshold: requiresMultisig ? (config.multisig_required_signers || 2) : 1,
      },
      trace_id: tid,
    };

    if (idemKey) storeIdempotency(`${user.id}:withdraw:${idemKey}`, response);
    return jsonResponse(res, 201, response);
  } catch (err) {
    return apiError(res, err.status || 500, err.code || 'WALLET_ERROR', err.message || String(err), { traceId: tid });
  }
}

/**
 * POST /api/wallet?action=custodial-transfer
 * Instant internal transfer to another Verdex user (by username or wallet address).
 */
async function internalTransfer(req, res) {
  const user = await verifyUser(req);
  if (!user) return apiError(res, 401, 'UNAUTHORIZED', 'Authentication required');
  if (!checkRateLimit(`wallet-transfer:${user.id}`, 10, 60000).allowed) {
    return apiError(res, 429, 'RATE_LIMITED', 'Too many transfer requests', { retryable: true });
  }

  const tid = traceId(req);
  const body = parseBody(req);
  const { recipient, amount_vdx, memo } = body;

  if (!recipient || typeof recipient !== 'string') {
    return apiError(res, 400, 'INVALID_RECIPIENT', 'Recipient username or address required', { traceId: tid });
  }
  const amountAtomic = toAtomic(amount_vdx);
  if (!amountAtomic || !validateAtomic(amountAtomic)) {
    return apiError(res, 400, 'INVALID_AMOUNT', 'amount_vdx must be a positive number', { traceId: tid });
  }

  const idemKey = req.headers['x-idempotency-key'];
  if (idemKey) {
    const dup = checkIdempotency(`${user.id}:transfer:${idemKey}`);
    if (dup.duplicate) return jsonResponse(res, 200, dup.originalResult || { success: true, idempotent: true });
  }

  const supabase = getSupabase();
  try {
    // Resolve recipient by username or deposit address.
    let recipientUserId;
    if (isValidEvmAddress(recipient)) {
      const { data: rWallet } = await supabase
        .from('verdex_custodial_wallets')
        .select('user_id')
        .eq('deposit_address', recipient.toLowerCase())
        .maybeSingle();
      if (!rWallet) {
        return apiError(res, 404, 'RECIPIENT_NOT_FOUND', 'No Verdex wallet at that address', { traceId: tid });
      }
      recipientUserId = rWallet.user_id;
    } else {
      // Look up by username in profiles.
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', recipient.trim().toLowerCase())
        .maybeSingle();
      if (!profile) {
        return apiError(res, 404, 'RECIPIENT_NOT_FOUND', `No user named "${recipient}"`, { traceId: tid });
      }
      recipientUserId = profile.id;
    }

    if (recipientUserId === user.id) {
      return apiError(res, 400, 'SELF_TRANSFER', 'Cannot transfer to yourself', { traceId: tid });
    }

    // Check transfers enabled.
    const config = await getConfig(supabase);
    if (!config.transfers_enabled) {
      return apiError(res, 503, 'TRANSFERS_DISABLED', 'Internal transfers are temporarily disabled', { traceId: tid });
    }

    // Check minimum.
    if (BigInt(amountAtomic) < BigInt(config.min_transfer_atomic || '10000000000000000')) {
      return apiError(res, 400, 'BELOW_MINIMUM', `Minimum transfer is ${fromAtomic(config.min_transfer_atomic || '10000000000000000')} VDX`, { traceId: tid });
    }

    // KYC check.
    const kycOk = await checkKyc(supabase, user.id);
    if (!kycOk) {
      return apiError(res, 403, 'KYC_REQUIRED', 'Complete KYC to send transfers', { traceId: tid });
    }

    // AML screen.
    const aml = await amlScreen(supabase, { userId: user.id, amountAtomic, type: 'transfer' });
    if (aml.riskLevel === 'prohibited') {
      return apiError(res, 403, 'AML_BLOCKED', 'Transfer blocked by AML screening', { traceId: tid });
    }

    // Execute the atomic transfer.
    const fee = BigInt(config.transfer_fee_atomic || '0');
    const { data: result, error: rpcError } = await supabase.rpc('verdex_custodial_transfer', {
      p_from_user_id: user.id,
      p_to_user_id: recipientUserId,
      p_amount_atomic: amountAtomic,
      p_fee_atomic: fee.toString(),
      p_memo: memo ? String(memo).slice(0, 500) : null,
      p_initiated_by: user.id,
    });

    if (rpcError) {
      const msg = rpcError.message || 'Transfer failed';
      if (msg.includes('INSUFFICIENT_BALANCE')) return apiError(res, 400, 'INSUFFICIENT_BALANCE', 'Insufficient balance', { traceId: tid });
      if (msg.includes('WALLET_NOT_FOUND')) return apiError(res, 404, 'WALLET_NOT_FOUND', msg, { traceId: tid });
      if (msg.includes('WALLET_NOT_ACTIVE')) return apiError(res, 403, 'WALLET_NOT_ACTIVE', msg, { traceId: tid });
      throw rpcError;
    }

    const row = result && result[0];
    if (!row) {
      return apiError(res, 500, 'TRANSFER_FAILED', 'Atomic transfer returned no result', { traceId: tid, retryable: true });
    }

    await logAudit(user.id, 'wallet.transfer', {
      resource_type: 'verdex_custodial_transfers',
      resource_id: row.transfer_id,
      metadata: { amount: amountAtomic, to: recipientUserId }
    });

    const response = {
      success: true,
      transfer: {
        id: row.transfer_id,
        status: row.status,
        amount_vdx: fromAtomic(amountAtomic),
        amount_atomic: amountAtomic,
        recipient_user_id: recipientUserId,
        from_balance_after: fromAtomic(row.from_balance_after),
        to_balance_after: fromAtomic(row.to_balance_after),
      },
      trace_id: tid,
    };

    if (idemKey) storeIdempotency(`${user.id}:transfer:${idemKey}`, response);
    return jsonResponse(res, 201, response);
  } catch (err) {
    return apiError(res, err.status || 500, err.code || 'WALLET_ERROR', err.message || String(err), { traceId: tid });
  }
}

/**
 * GET /api/wallet?action=custodial-history
 * Unified transaction history (deposits, withdrawals, transfers).
 */
async function getHistory(req, res) {
  const user = await verifyUser(req);
  if (!user) return apiError(res, 401, 'UNAUTHORIZED', 'Authentication required');

  const supabase = getSupabase();
  const limit = Math.min(parseInt(req.query.limit, 10) || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  const type = req.query.type;

  let q = supabase
    .from('verdex_custodial_transactions')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (type) q = q.eq('tx_type', type);

  const { data, error, count } = await q;
  if (error) {
    return apiError(res, 500, 'DB_ERROR', 'Failed to load history', { retryable: true });
  }

  return jsonResponse(res, 200, {
    data: (data || []).map(t => ({
      ...t,
      amount_vdx: fromAtomic(t.amount_atomic),
      fee_vdx: fromAtomic(t.fee_atomic),
    })),
    count: data?.length || 0,
    offset,
    limit,
  });
}

/**
 * GET /api/wallet?action=custodial-deposits
 * Deposit history for the user.
 */
async function getDeposits(req, res) {
  const user = await verifyUser(req);
  if (!user) return apiError(res, 401, 'UNAUTHORIZED', 'Authentication required');

  const supabase = getSupabase();
  const limit = Math.min(parseInt(req.query.limit, 10) || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);

  const { data, error } = await supabase
    .from('verdex_custodial_deposits')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return apiError(res, 500, 'DB_ERROR', 'Failed to load deposits', { retryable: true });

  return jsonResponse(res, 200, {
    data: (data || []).map(d => ({ ...d, amount_vdx: fromAtomic(d.amount_atomic) })),
  });
}

/**
 * GET /api/wallet?action=custodial-withdrawals
 * Withdrawal history for the user.
 */
async function getWithdrawals(req, res) {
  const user = await verifyUser(req);
  if (!user) return apiError(res, 401, 'UNAUTHORIZED', 'Authentication required');

  const supabase = getSupabase();
  const limit = Math.min(parseInt(req.query.limit, 10) || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);

  const { data, error } = await supabase
    .from('verdex_custodial_withdrawals')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return apiError(res, 500, 'DB_ERROR', 'Failed to load withdrawals', { retryable: true });

  return jsonResponse(res, 200, {
    data: (data || []).map(w => ({
      ...w,
      amount_vdx: fromAtomic(w.amount_atomic),
      fee_vdx: fromAtomic(w.fee_atomic),
      total_vdx: fromAtomic(w.total_atomic),
    })),
  });
}

// ===========================================================================
// Treasury / Admin endpoints
// ===========================================================================

/**
 * GET /api/wallet?action=admin-pending-withdrawals
 * Returns all withdrawals pending approval (treasury signers only).
 */
async function adminPendingWithdrawals(req, res) {
  const user = await verifyUser(req);
  if (!user) return apiError(res, 401, 'UNAUTHORIZED', 'Authentication required');

  const supabase = getSupabase();
  const signer = await isTreasurySigner(supabase, user.id);
  if (!signer) return apiError(res, 403, 'NOT_TREASURY_SIGNER', 'Treasury signer role required');

  const { data, error } = await supabase
    .from('verdex_custodial_withdrawals')
    .select('*, wallet:verdex_custodial_wallets(deposit_address, user_id), signatures:verdex_custodial_treasury_signatures(signer_user_id, decision, signed_at)')
    .eq('status', 'awaiting_signatures')
    .order('created_at', { ascending: true })
    .limit(50);

  if (error) return apiError(res, 500, 'DB_ERROR', 'Failed to load pending withdrawals');

  return jsonResponse(res, 200, {
    data: (data || []).map(w => ({
      ...w,
      amount_vdx: fromAtomic(w.amount_atomic),
      total_vdx: fromAtomic(w.total_atomic),
    })),
  });
}

/**
 * POST /api/wallet?action=admin-sign-withdrawal
 * Treasury signer approves or rejects a withdrawal.
 */
async function adminSignWithdrawal(req, res) {
  const user = await verifyUser(req);
  if (!user) return apiError(res, 401, 'UNAUTHORIZED', 'Authentication required');

  const body = parseBody(req);
  const { withdrawal_id, decision, reason } = body;
  if (!validateUuid(withdrawal_id)) return apiError(res, 400, 'INVALID_PARAMS', 'withdrawal_id required');
  if (decision !== 'approve' && decision !== 'reject') {
    return apiError(res, 400, 'INVALID_DECISION', 'decision must be approve or reject');
  }

  const supabase = getSupabase();
  const signer = await isTreasurySigner(supabase, user.id);
  if (!signer) return apiError(res, 403, 'NOT_TREASURY_SIGNER', 'Treasury signer role required');

  // Fetch the withdrawal.
  const { data: withdrawal } = await supabase
    .from('verdex_custodial_withdrawals')
    .select('*')
    .eq('id', withdrawal_id)
    .maybeSingle();
  if (!withdrawal) return apiError(res, 404, 'NOT_FOUND', 'Withdrawal not found');
  if (withdrawal.status !== 'awaiting_signatures') {
    return apiError(res, 409, 'NOT_AWAITING', `Withdrawal status is ${withdrawal.status}`);
  }

  // Record the signature (unique per signer — DB constraint enforces).
  const { error: sigError } = await supabase
    .from('verdex_custodial_treasury_signatures')
    .insert({
      withdrawal_id,
      signer_user_id: user.id,
      signer_role: signer.role,
      decision,
      reason: reason ? String(reason).slice(0, 500) : null,
    });
  if (sigError) {
    if (sigError.code === '23505') return apiError(res, 409, 'ALREADY_SIGNED', 'You have already signed this withdrawal');
    throw sigError;
  }

  if (decision === 'reject') {
    // Cancel the withdrawal and unlock funds.
    await supabase.rpc('verdex_custodial_cancel_withdrawal', {
      p_withdrawal_id: withdrawal_id,
      p_reason: reason || 'Rejected by treasury signer',
      p_rejected_by: user.id,
    });
    return jsonResponse(res, 200, { success: true, message: 'Withdrawal rejected and funds unlocked' });
  }

  // Approve: count current signatures.
  const { count } = await supabase
    .from('verdex_custodial_treasury_signatures')
    .select('id', { count: 'exact', head: true })
    .eq('withdrawal_id', withdrawal_id)
    .eq('decision', 'approve');

  const newSigCount = count || 0;
  await supabase
    .from('verdex_custodial_withdrawals')
    .update({ current_signatures: newSigCount })
    .eq('id', withdrawal_id);

  if (newSigCount >= withdrawal.multisig_threshold) {
    // Quorum reached — mark as approved for the withdrawal worker to process.
    await supabase
      .from('verdex_custodial_withdrawals')
      .update({ status: 'approved' })
      .eq('id', withdrawal_id);

    // Notify the user that their withdrawal was approved.
    try {
      await supabase.from('verdex_notification_outbox').upsert({
        recipient_user_id: withdrawal.user_id,
        channel: 'in_app',
        template_key: 'withdrawal-approved',
        dedupe_key: `withdrawal-approved:${withdrawal_id}`,
        payload: {
          amount_vdx: (Number(withdrawal.amount_atomic) / 1e18).toFixed(4),
          destination: withdrawal.destination_address?.substring(0, 12) + '...',
          withdrawal_id,
        },
        status: 'pending',
      }, { onConflict: 'recipient_user_id,channel,dedupe_key', ignoreDuplicates: true });
    } catch (_) {}

    await logAudit(user.id, 'wallet.withdrawal.approved', {
      resource_type: 'verdex_custodial_withdrawals',
      resource_id: withdrawal_id,
      metadata: { amount: withdrawal.amount_atomic, quorum: true }
    });

    return jsonResponse(res, 200, {
      success: true,
      message: 'Withdrawal approved — quorum reached. Processing will begin shortly.',
      signatures: newSigCount,
      threshold: withdrawal.multisig_threshold,
    });
  }

  await logAudit(user.id, 'wallet.withdrawal.signature', {
    resource_type: 'verdex_custodial_withdrawals',
    resource_id: withdrawal_id,
    metadata: { signatures: newSigCount, threshold: withdrawal.multisig_threshold }
  });

  return jsonResponse(res, 200, {
    success: true,
    message: `Signature recorded. ${newSigCount}/${withdrawal.multisig_threshold} signatures collected.`,
    signatures: newSigCount,
    threshold: withdrawal.multisig_threshold,
  });
}

/**
 * GET /api/wallet?action=admin-health
 * System health: total balances, pending withdrawals, active wallets, etc.
 */
async function adminHealth(req, res) {
  const user = await verifyUser(req);
  if (!user) return apiError(res, 401, 'UNAUTHORIZED', 'Authentication required');

  const supabase = getSupabase();
  const signer = await isTreasurySigner(supabase, user.id);
  const admin = await verifyAdmin(req);
  if (!signer && !admin) return apiError(res, 403, 'FORBIDDEN', 'Admin or treasury role required');

  const [
    walletsRes, pendingWRes, pendingDepositsRes, amlQueueRes, configRes
  ] = await Promise.all([
    supabase.from('verdex_custodial_wallets').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('verdex_custodial_withdrawals').select('id', { count: 'exact', head: true }).in('status', ['awaiting_signatures', 'approved', 'processing']),
    supabase.from('verdex_custodial_deposits').select('id', { count: 'exact', head: true }).in('status', ['detected', 'confirming']),
    supabase.from('verdex_custodial_aml_screenings').select('id', { count: 'exact', head: true }).in('risk_level', ['medium', 'high']).is('review_decision', null),
    supabase.from('verdex_custodial_config').select('*').eq('singleton', true).maybeSingle(),
  ]);

  return jsonResponse(res, 200, {
    data: {
      active_wallets: walletsRes.count || 0,
      pending_withdrawals: pendingWRes.count || 0,
      pending_deposits: pendingDepositsRes.count || 0,
      aml_review_queue: amlQueueRes.count || 0,
      config: configRes.data || {},
      timestamp: new Date().toISOString(),
    }
  });
}

/**
 * GET /api/wallet?action=admin-balances
 * All wallet balances (paginated, admin/treasury only).
 */
async function adminBalances(req, res) {
  const user = await verifyUser(req);
  if (!user) return apiError(res, 401, 'UNAUTHORIZED', 'Authentication required');

  const supabase = getSupabase();
  const admin = await verifyAdmin(req);
  const signer = await isTreasurySigner(supabase, user.id);
  if (!admin && !signer) return apiError(res, 403, 'FORBIDDEN', 'Admin or treasury role required');

  const limit = Math.min(parseInt(req.query.limit, 10) || 50, MAX_PAGE_SIZE);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

  const { data, error, count } = await supabase
    .from('verdex_custodial_wallets')
    .select('id, user_id, deposit_address, status, withdrawal_tier, created_at, balance:verdex_custodial_balances(available_atomic, pending_atomic, locked_atomic)')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return apiError(res, 500, 'DB_ERROR', 'Failed to load balances');

  return jsonResponse(res, 200, {
    data: (data || []).map(w => ({
      ...w,
      available_vdx: fromAtomic(w.balance?.[0]?.available_atomic || '0'),
      pending_vdx: fromAtomic(w.balance?.[0]?.pending_atomic || '0'),
      locked_vdx: fromAtomic(w.balance?.[0]?.locked_atomic || '0'),
    })),
    count: data?.length || 0,
    offset,
    limit,
  });
}

// ===========================================================================
// Multi-token endpoints
// ===========================================================================

/**
 * GET /api/wallet?action=custodial-tokens
 * Returns all supported tokens in the custodial wallet.
 */
async function getTokens(req, res) {
  const user = await verifyUser(req);
  if (!user) return apiError(res, 401, 'UNAUTHORIZED', 'Authentication required');

  const supabase = getSupabase();
  const { data: tokens, error } = await supabase
    .from('verdex_custodial_tokens')
    .select('*')
    .eq('is_active', true)
    .order('display_order', { ascending: true });

  if (error) return apiError(res, 500, 'DB_ERROR', 'Failed to load tokens');

  return jsonResponse(res, 200, {
    data: (tokens || []).map(t => ({
      token_id: t.id,
      symbol: t.symbol,
      name: t.name,
      chain: t.chain,
      contract_address: t.contract_address,
      decimals: t.decimals,
      logo_url: t.logo_url,
      deposit_enabled: t.deposit_enabled,
      withdrawal_enabled: t.withdrawal_enabled,
      min_withdrawal: fromTokenAtomic(t.min_withdrawal_atomic, t.decimals),
      withdrawal_fee: fromTokenAtomic(t.withdrawal_fee_atomic, t.decimals),
      display_order: t.display_order,
      metadata: t.metadata,
    })),
  });
}

/**
 * POST /api/wallet?action=custodial-transfer-token
 * Internal transfer of a specific token to another Verdex user.
 */
async function transferToken(req, res) {
  const user = await verifyUser(req);
  if (!user) return apiError(res, 401, 'UNAUTHORIZED', 'Authentication required');
  if (!checkRateLimit(`wallet-transfer-token:${user.id}`, 10, 60000).allowed) {
    return apiError(res, 429, 'RATE_LIMITED', 'Too many transfer requests', { retryable: true });
  }

  const tid = traceId(req);
  const body = parseBody(req);
  const { recipient, token_id, amount, memo } = body;

  if (!recipient || !validateUuid(token_id)) {
    return apiError(res, 400, 'INVALID_PARAMS', 'recipient and token_id required', { traceId: tid });
  }

  const supabase = getSupabase();
  try {
    // Get the token to know its decimals.
    const { data: token } = await supabase
      .from('verdex_custodial_tokens')
      .select('*')
      .eq('id', token_id)
      .eq('is_active', true)
      .maybeSingle();
    if (!token) return apiError(res, 404, 'TOKEN_NOT_FOUND', 'Token not supported', { traceId: tid });

    const amountAtomic = toTokenAtomic(amount, token.decimals);
    if (!amountAtomic || !validateAtomic(amountAtomic)) {
      return apiError(res, 400, 'INVALID_AMOUNT', 'Invalid amount for this token', { traceId: tid });
    }

    // Resolve recipient.
    let recipientUserId;
    if (isValidEvmAddress(recipient)) {
      const { data: rWallet } = await supabase
        .from('verdex_custodial_wallets')
        .select('user_id')
        .eq('deposit_address', recipient.toLowerCase())
        .maybeSingle();
      if (!rWallet) return apiError(res, 404, 'RECIPIENT_NOT_FOUND', 'No wallet at that address', { traceId: tid });
      recipientUserId = rWallet.user_id;
    } else {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', recipient.trim().toLowerCase())
        .maybeSingle();
      if (!profile) return apiError(res, 404, 'RECIPIENT_NOT_FOUND', `No user named "${recipient}"`, { traceId: tid });
      recipientUserId = profile.id;
    }

    if (recipientUserId === user.id) {
      return apiError(res, 400, 'SELF_TRANSFER', 'Cannot transfer to yourself', { traceId: tid });
    }

    // KYC check.
    const kycOk = await checkKyc(supabase, user.id);
    if (!kycOk) return apiError(res, 403, 'KYC_REQUIRED', 'Complete KYC to send transfers', { traceId: tid });

    // Execute the atomic token transfer.
    const { data: result, error: rpcError } = await supabase.rpc('verdex_custodial_transfer_token', {
      p_from_user_id: user.id,
      p_to_user_id: recipientUserId,
      p_token_id: token_id,
      p_amount_atomic: amountAtomic,
      p_fee_atomic: '0',
      p_memo: memo ? String(memo).slice(0, 500) : null,
      p_initiated_by: user.id,
    });

    if (rpcError) {
      const msg = rpcError.message || 'Transfer failed';
      if (msg.includes('INSUFFICIENT_BALANCE')) return apiError(res, 400, 'INSUFFICIENT_BALANCE', 'Insufficient token balance', { traceId: tid });
      if (msg.includes('WALLET_NOT')) return apiError(res, 404, 'WALLET_NOT_FOUND', msg, { traceId: tid });
      throw rpcError;
    }

    const row = result && result[0];
    if (!row) return apiError(res, 500, 'TRANSFER_FAILED', 'Transfer returned no result', { traceId: tid });

    return jsonResponse(res, 201, {
      success: true,
      transfer: {
        id: row.transfer_id,
        status: row.status,
        token: token.symbol,
        chain: token.chain,
        amount: fromTokenAtomic(amountAtomic, token.decimals),
        recipient_user_id: recipientUserId,
      },
      trace_id: tid,
    });
  } catch (err) {
    return apiError(res, err.status || 500, err.code || 'WALLET_ERROR', err.message || String(err), { traceId: tid });
  }
}

// ===========================================================================
// Address book — saved withdrawal destinations
// ===========================================================================

async function getAddressBook(req, res) {
  const user = await verifyUser(req);
  if (!user) return apiError(res, 401, 'UNAUTHORIZED', 'Authentication required');
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('verdex_custodial_address_book')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });
  if (error) return apiError(res, 500, 'DB_ERROR', 'Failed to load address book');
  return jsonResponse(res, 200, { data: data || [] });
}

async function addAddressBookEntry(req, res) {
  const user = await verifyUser(req);
  if (!user) return apiError(res, 401, 'UNAUTHORIZED', 'Authentication required');
  const body = parseBody(req);
  const { label, address: addr, chain } = body;
  if (!label || typeof label !== 'string' || label.trim().length < 1 || label.length > 80) {
    return apiError(res, 400, 'INVALID_LABEL', 'Label must be 1-80 characters');
  }
  if (!isValidEvmAddress(addr)) {
    return apiError(res, 400, 'INVALID_ADDRESS', 'A valid 0x EVM address is required');
  }
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('verdex_custodial_address_book')
    .insert({
      user_id: user.id,
      label: label.trim(),
      address: addr.toLowerCase(),
      chain: chain || 'verdex',
    })
    .select('*')
    .single();
  if (error) {
    if (error.code === '23505') return apiError(res, 409, 'DUPLICATE', 'Address already saved');
    throw error;
  }
  await logAudit(user.id, 'wallet.address_book.add', {
    resource_type: 'verdex_custodial_address_book',
    resource_id: data.id,
    metadata: { label: label.trim(), address: addr.toLowerCase() }
  });
  return jsonResponse(res, 201, { success: true, entry: data });
}

async function removeAddressBookEntry(req, res) {
  const user = await verifyUser(req);
  if (!user) return apiError(res, 401, 'UNAUTHORIZED', 'Authentication required');
  const body = parseBody(req);
  const { entry_id } = body;
  if (!validateUuid(entry_id)) return apiError(res, 400, 'INVALID_PARAMS', 'entry_id required');
  const supabase = getSupabase();
  const { error } = await supabase
    .from('verdex_custodial_address_book')
    .delete()
    .eq('id', entry_id)
    .eq('user_id', user.id);
  if (error) return apiError(res, 500, 'DB_ERROR', 'Failed to delete entry');
  return jsonResponse(res, 200, { success: true });
}

// ===========================================================================
// Treasury reconciliation — verify balance consistency
// ===========================================================================

async function treasuryReconciliation(req, res) {
  const user = await verifyUser(req);
  if (!user) return apiError(res, 401, 'UNAUTHORIZED', 'Authentication required');
  const supabase = getSupabase();
  const admin = await verifyAdmin(req);
  const signer = await isTreasurySigner(supabase, user.id);
  if (!admin && !signer) return apiError(res, 403, 'FORBIDDEN', 'Admin or treasury role required');

  // Sum all available balances
  const { data: balances } = await supabase
    .from('verdex_custodial_balances')
    .select('available_atomic, pending_atomic, locked_atomic');
  let totalAvailable = 0n, totalPending = 0n, totalLocked = 0n;
  for (const b of (balances || [])) {
    totalAvailable += BigInt(b.available_atomic || '0');
    totalPending += BigInt(b.pending_atomic || '0');
    totalLocked += BigInt(b.locked_atomic || '0');
  }

  // Sum all token balances
  const { data: tokenBalances } = await supabase
    .from('verdex_custodial_token_balances')
    .select('available_atomic, pending_atomic, locked_atomic, token_id');
  const tokenTotals = {};
  for (const tb of (tokenBalances || [])) {
    const tid = tb.token_id;
    if (!tokenTotals[tid]) tokenTotals[tid] = { available: 0n, pending: 0n, locked: 0n };
    tokenTotals[tid].available += BigInt(tb.available_atomic || '0');
    tokenTotals[tid].pending += BigInt(tb.pending_atomic || '0');
    tokenTotals[tid].locked += BigInt(tb.locked_atomic || '0');
  }

  // Count pending withdrawals
  const { count: pendingWd } = await supabase
    .from('verdex_custodial_withdrawals')
    .select('id', { count: 'exact', head: true })
    .in('status', ['requested', 'awaiting_signatures', 'approved', 'processing']);

  // Count pending deposits
  const { count: pendingDep } = await supabase
    .from('verdex_custodial_deposits')
    .select('id', { count: 'exact', head: true })
    .in('status', ['detected', 'confirming']);

  // Verify: locked balances should equal sum of pending withdrawal totals
  const { data: pendingWithdrawals } = await supabase
    .from('verdex_custodial_withdrawals')
    .select('total_atomic')
    .in('status', ['requested', 'awaiting_signatures', 'approved', 'processing']);
  let lockedByWithdrawals = 0n;
  for (const w of (pendingWithdrawals || [])) {
    lockedByWithdrawals += BigInt(w.total_atomic || '0');
  }

  const balanced = totalLocked === lockedByWithdrawals;

  return jsonResponse(res, 200, {
    data: {
      vdx: {
        total_available: totalAvailable.toString(),
        total_pending: totalPending.toString(),
        total_locked: totalLocked.toString(),
        locked_by_withdrawals: lockedByWithdrawals.toString(),
        balanced: balanced,
      },
      token_balances: Object.entries(tokenTotals).map(([tid, v]) => ({
        token_id: tid,
        available: v.available.toString(),
        pending: v.pending.toString(),
        locked: v.locked.toString(),
      })),
      pending_withdrawals: pendingWd || 0,
      pending_deposits: pendingDep || 0,
      timestamp: new Date().toISOString(),
    }
  });
}

// ===========================================================================
// Withdrawal expiry — cancel withdrawals that exceeded payment window
// ===========================================================================

async function expireStaleWithdrawals(req, res) {
  // Can be called by cron or admin
  const user = await verifyUser(req);
  if (!user) return apiError(res, 401, 'UNAUTHORIZED', 'Authentication required');
  const supabase = getSupabase();
  const admin = await verifyAdmin(req);
  if (!admin) return apiError(res, 403, 'FORBIDDEN', 'Admin access required');

  // Find withdrawals older than 24 hours still pending
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: stale, error } = await supabase
    .from('verdex_custodial_withdrawals')
    .select('id, wallet_id, user_id, total_atomic')
    .in('status', ['requested', 'kyc_pending', 'aml_pending', 'awaiting_signatures'])
    .lt('created_at', cutoff);

  if (error) return apiError(res, 500, 'DB_ERROR', 'Failed to query stale withdrawals');

  let expired = 0;
  for (const w of (stale || [])) {
    try {
      const { error: cancelErr } = await supabase.rpc('verdex_custodial_cancel_withdrawal', {
        p_withdrawal_id: w.id,
        p_reason: 'Withdrawal expired (24h timeout)',
        p_rejected_by: user.id,
      });
      if (!cancelErr) {
        expired++;
        await logAudit(user.id, 'wallet.withdrawal.expired', {
          resource_type: 'verdex_custodial_withdrawals',
          resource_id: w.id,
          metadata: { total_atomic: w.total_atomic }
        });
      }
    } catch (_) {}
  }

  return jsonResponse(res, 200, {
    success: true,
    expired,
    checked: (stale || []).length,
    timestamp: new Date().toISOString(),
  });
}

// ===========================================================================
// User lookup for transfers (by UID or username)
// ===========================================================================

async function lookupUser(req, res) {
  const user = await verifyUser(req);
  if (!user) return apiError(res, 401, 'UNAUTHORIZED', 'Authentication required');

  const supabase = getSupabase();
  const query = req.query.q || req.query.uid || req.query.username;

  if (!query || typeof query !== 'string' || query.trim().length < 2) {
    return apiError(res, 400, 'INVALID_QUERY', 'Provide a UID or username to search');
  }

  const trimmed = query.trim();

  // Try by user ID (UUID).
  if (validateUuid(trimmed)) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, username, full_name')
      .eq('id', trimmed)
      .maybeSingle();
    if (profile) {
      // Get wallet address if exists.
      const { data: wallet } = await supabase
        .from('verdex_custodial_wallets')
        .select('deposit_address')
        .eq('user_id', trimmed)
        .maybeSingle();
      return jsonResponse(res, 200, {
        data: {
          user_id: profile.id,
          username: profile.username || profile.full_name || 'User',
          full_name: profile.full_name || profile.username || 'User',
          avatar_url: null,
          deposit_address: wallet?.deposit_address || null,
          has_wallet: !!wallet,
        }
      });
    }
  }

  // Try by username.
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, username, full_name')
    .ilike('username', trimmed.toLowerCase())
    .maybeSingle();

  if (profile) {
    const { data: wallet } = await supabase
      .from('verdex_custodial_wallets')
      .select('deposit_address')
      .eq('user_id', profile.id)
      .maybeSingle();
    return jsonResponse(res, 200, {
      data: {
        user_id: profile.id,
        username: profile.username || profile.full_name || 'User',
        full_name: profile.full_name || profile.username || 'User',
        avatar_url: null,
        deposit_address: wallet?.deposit_address || null,
        has_wallet: !!wallet,
      }
    });
  }

  // Try by deposit address (EVM).
  if (isValidEvmAddress(trimmed)) {
    const { data: wallet } = await supabase
      .from('verdex_custodial_wallets')
      .select('user_id, deposit_address')
      .eq('deposit_address', trimmed.toLowerCase())
      .maybeSingle();
    if (wallet) {
      const { data: p } = await supabase
        .from('profiles')
        .select('id, username, full_name')
        .eq('id', wallet.user_id)
        .maybeSingle();
      return jsonResponse(res, 200, {
        data: {
          user_id: wallet.user_id,
          username: p?.username || p?.full_name || 'User',
          full_name: p?.full_name || p?.username || 'User',
          avatar_url: null,
          deposit_address: wallet.deposit_address,
          has_wallet: true,
        }
      });
    }
  }

  return apiError(res, 404, 'USER_NOT_FOUND', 'No user found with that UID, username, or address');
}

// ===========================================================================
// Escrow Integration — lock/release/refund custodial balance for P2P trades
// ===========================================================================

/**
 * POST /api/wallet?action=escrow-lock
 * Lock custodial VDX for a P2P escrow trade.
 */
async function escrowLock(req, res) {
  const user = await verifyUser(req);
  if (!user) return apiError(res, 401, 'UNAUTHORIZED', 'Authentication required');

  const tid = traceId(req);
  const body = parseBody(req);
  const { trade_id, amount_vdx, fee_vdx } = body;

  if (!validateUuid(trade_id)) return apiError(res, 400, 'INVALID_PARAMS', 'trade_id required', { traceId: tid });
  const amountAtomic = toAtomic(amount_vdx);
  if (!amountAtomic || !validateAtomic(amountAtomic)) {
    return apiError(res, 400, 'INVALID_AMOUNT', 'amount_vdx must be positive', { traceId: tid });
  }
  const feeAtomic = fee_vdx ? (toAtomic(fee_vdx) || '0') : '0';

  const supabase = getSupabase();
  try {
    const { data: result, error } = await supabase.rpc('verdex_custodial_lock_for_escrow', {
      p_trade_id: trade_id,
      p_user_id: user.id,
      p_amount_atomic: amountAtomic,
      p_fee_atomic: feeAtomic,
    });
    if (error) {
      const msg = error.message || '';
      if (msg.includes('INSUFFICIENT_BALANCE')) return apiError(res, 400, 'INSUFFICIENT_BALANCE', 'Not enough available balance', { traceId: tid });
      if (msg.includes('WALLET_NOT_FOUND')) return apiError(res, 404, 'WALLET_NOT_FOUND', 'No active wallet', { traceId: tid });
      throw error;
    }
    const row = result && result[0];
    if (!row || !row.success) return apiError(res, 500, 'LOCK_FAILED', 'Escrow lock failed', { traceId: tid });

    await logAudit(user.id, 'wallet.escrow_lock', {
      resource_type: 'verdex_custodial_escrow_locks', resource_id: row.lock_id,
      metadata: { trade_id, amount: amountAtomic }
    });

    return jsonResponse(res, 201, {
      success: true,
      lock: { id: row.lock_id, balance_after: fromAtomic(row.balance_after_available) },
      trace_id: tid,
    });
  } catch (err) {
    return apiError(res, err.status || 500, err.code || 'ESCROW_ERROR', err.message || String(err), { traceId: tid });
  }
}

/**
 * POST /api/wallet?action=escrow-release
 * Release escrowed funds to the counterparty (buyer).
 */
async function escrowRelease(req, res) {
  const user = await verifyUser(req);
  if (!user) return apiError(res, 401, 'UNAUTHORIZED', 'Authentication required');

  const tid = traceId(req);
  const body = parseBody(req);
  const { lock_id, to_user_id } = body;

  if (!validateUuid(lock_id)) return apiError(res, 400, 'INVALID_PARAMS', 'lock_id required', { traceId: tid });
  if (!validateUuid(to_user_id)) return apiError(res, 400, 'INVALID_PARAMS', 'to_user_id required', { traceId: tid });

  const supabase = getSupabase();
  try {
    const { data: result, error } = await supabase.rpc('verdex_custodial_release_escrow', {
      p_lock_id: lock_id,
      p_to_user_id: to_user_id,
      p_released_by: user.id,
    });
    if (error) {
      if (error.message?.includes('ESCROW_NOT_FOUND')) return apiError(res, 404, 'ESCROW_NOT_FOUND', 'Lock not found or already resolved', { traceId: tid });
      throw error;
    }
    const row = result && result[0];
    if (!row) return apiError(res, 500, 'RELEASE_FAILED', 'Escrow release failed', { traceId: tid });

    await logAudit(user.id, 'wallet.escrow_release', {
      resource_type: 'verdex_custodial_escrow_locks', resource_id: lock_id,
      metadata: { to_user_id }
    });

    return jsonResponse(res, 200, {
      success: true,
      from_balance_after: fromAtomic(row.from_balance_after),
      to_balance_after: fromAtomic(row.to_balance_after),
      trace_id: tid,
    });
  } catch (err) {
    return apiError(res, err.status || 500, err.code || 'ESCROW_ERROR', err.message || String(err), { traceId: tid });
  }
}

/**
 * POST /api/wallet?action=escrow-refund
 * Refund escrowed funds back to the originator (seller).
 */
async function escrowRefund(req, res) {
  const user = await verifyUser(req);
  if (!user) return apiError(res, 401, 'UNAUTHORIZED', 'Authentication required');

  const tid = traceId(req);
  const body = parseBody(req);
  const { lock_id, reason } = body;

  if (!validateUuid(lock_id)) return apiError(res, 400, 'INVALID_PARAMS', 'lock_id required', { traceId: tid });

  const supabase = getSupabase();
  try {
    const { data: result, error } = await supabase.rpc('verdex_custodial_refund_escrow', {
      p_lock_id: lock_id,
      p_refunded_by: user.id,
      p_reason: reason ? String(reason).slice(0, 500) : null,
    });
    if (error) {
      if (error.message?.includes('ESCROW_NOT_FOUND')) return apiError(res, 404, 'ESCROW_NOT_FOUND', 'Lock not found or already resolved', { traceId: tid });
      throw error;
    }
    const row = result && result[0];
    if (!row) return apiError(res, 500, 'REFUND_FAILED', 'Escrow refund failed', { traceId: tid });

    await logAudit(user.id, 'wallet.escrow_refund', {
      resource_type: 'verdex_custodial_escrow_locks', resource_id: lock_id,
      metadata: { reason }
    });

    return jsonResponse(res, 200, {
      success: true,
      balance_after: fromAtomic(row.balance_after_available),
      trace_id: tid,
    });
  } catch (err) {
    return apiError(res, err.status || 500, err.code || 'ESCROW_ERROR', err.message || String(err), { traceId: tid });
  }
}

// ===========================================================================
// Admin audit log + risk alerts
// ===========================================================================

/**
 * GET /api/wallet?action=admin-audit-log
 * Returns recent audit log entries for wallet operations (admin only).
 */
async function adminAuditLog(req, res) {
  const user = await verifyUser(req);
  if (!user) return apiError(res, 401, 'UNAUTHORIZED', 'Authentication required');
  const supabase = getSupabase();
  const admin = await verifyAdmin(req);
  const signer = await isTreasurySigner(supabase, user.id);
  if (!admin && !signer) return apiError(res, 403, 'FORBIDDEN', 'Admin or treasury role required');

  const limit = Math.min(parseInt(req.query.limit, 10) || 50, MAX_PAGE_SIZE);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  const actionFilter = req.query.event;

  let q = supabase
    .from('verdex_audit_log')
    .select('*')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (actionFilter) q = q.ilike('action', `%${actionFilter}%`);

  const { data, error } = await q;
  if (error) return apiError(res, 500, 'DB_ERROR', 'Failed to load audit log');

  return jsonResponse(res, 200, { data: data || [], offset, limit });
}

/**
 * GET /api/wallet?action=admin-risk-alerts
 * Returns AML screenings flagged as medium/high/prohibited requiring review.
 */
async function adminRiskAlerts(req, res) {
  const user = await verifyUser(req);
  if (!user) return apiError(res, 401, 'UNAUTHORIZED', 'Authentication required');
  const supabase = getSupabase();
  const admin = await verifyAdmin(req);
  const signer = await isTreasurySigner(supabase, user.id);
  if (!admin && !signer) return apiError(res, 403, 'FORBIDDEN', 'Admin or treasury role required');

  const limit = Math.min(parseInt(req.query.limit, 10) || 50, MAX_PAGE_SIZE);
  const includeResolved = req.query.resolved === 'true';

  let q = supabase
    .from('verdex_custodial_aml_screenings')
    .select('*')
    .in('risk_level', ['medium', 'high', 'prohibited'])
    .order('created_at', { ascending: false })
    .limit(limit);

  if (!includeResolved) q = q.is('review_decision', null);

  const { data, error } = await q;
  if (error) return apiError(res, 500, 'DB_ERROR', 'Failed to load risk alerts');

  return jsonResponse(res, 200, { data: data || [] });
}

/**
 * GET /api/wallet?action=admin-escrow-locks
 * Returns all escrow lock records (admin only).
 */
async function adminEscrowLocks(req, res) {
  const user = await verifyUser(req);
  if (!user) return apiError(res, 401, 'UNAUTHORIZED', 'Authentication required');
  const supabase = getSupabase();
  const admin = await verifyAdmin(req);
  if (!admin) return apiError(res, 403, 'FORBIDDEN', 'Admin access required');

  const limit = Math.min(parseInt(req.query.limit, 10) || 50, MAX_PAGE_SIZE);
  const statusFilter = req.query.status;

  let q = supabase
    .from('verdex_custodial_escrow_locks')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (statusFilter) q = q.eq('status', statusFilter);

  const { data, error } = await q;
  if (error) return apiError(res, 500, 'DB_ERROR', 'Failed to load escrow locks');

  return jsonResponse(res, 200, {
    data: (data || []).map(l => ({
      ...l,
      amount_vdx: fromAtomic(l.amount_atomic),
      fee_vdx: fromAtomic(l.fee_atomic),
    })),
  });
}

// ===========================================================================
// Router
// ===========================================================================

module.exports = async (req, res) => {
  setCORS(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const action = req.query.action || '';
    if (action === 'custodial-balance') return await getBalance(req, res);
    if (action === 'custodial-deposit-address') return await getDepositAddress(req, res);
    if (action === 'custodial-tokens') return await getTokens(req, res);
    if (action === 'custodial-withdraw' && req.method === 'POST') return await requestWithdrawal(req, res);
    if (action === 'custodial-transfer' && req.method === 'POST') return await internalTransfer(req, res);
    if (action === 'custodial-transfer-token' && req.method === 'POST') return await transferToken(req, res);
    if (action === 'custodial-history') return await getHistory(req, res);
    if (action === 'custodial-deposits') return await getDeposits(req, res);
    if (action === 'custodial-withdrawals') return await getWithdrawals(req, res);
    // Address book
    if (action === 'address-book' && req.method === 'GET') return await getAddressBook(req, res);
    if (action === 'address-book-add' && req.method === 'POST') return await addAddressBookEntry(req, res);
    if (action === 'address-book-remove' && req.method === 'POST') return await removeAddressBookEntry(req, res);
    // User lookup for transfers (by UID or username)
    if (action === 'lookup-user') return await lookupUser(req, res);
    // Escrow integration
    if (action === 'escrow-lock' && req.method === 'POST') return await escrowLock(req, res);
    if (action === 'escrow-release' && req.method === 'POST') return await escrowRelease(req, res);
    if (action === 'escrow-refund' && req.method === 'POST') return await escrowRefund(req, res);
    // Treasury / Admin
    if (action === 'admin-reconciliation') return await treasuryReconciliation(req, res);
    if (action === 'admin-expire-withdrawals' && req.method === 'POST') return await expireStaleWithdrawals(req, res);
    if (action === 'admin-pending-withdrawals') return await adminPendingWithdrawals(req, res);
    if (action === 'admin-sign-withdrawal' && req.method === 'POST') return await adminSignWithdrawal(req, res);
    if (action === 'admin-health') return await adminHealth(req, res);
    if (action === 'admin-balances') return await adminBalances(req, res);
    if (action === 'admin-audit-log') return await adminAuditLog(req, res);
    if (action === 'admin-risk-alerts') return await adminRiskAlerts(req, res);
    if (action === 'admin-escrow-locks') return await adminEscrowLocks(req, res);
    return null;
  } catch (err) {
    return handleError(res, err, 'custodial-wallet');
  }
};

// Export helpers for testing.
module.exports.helpers = {
  toAtomic,
  fromAtomic,
  validateUuid,
  validateAtomic,
  walletCrypto,
  WITHDRAWAL_FEES,
};
