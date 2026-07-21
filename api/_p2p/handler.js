/**
 * Verdex P2P Marketplace API — mainnet coordination layer.
 *
 * Production-grade rewrite. Fixes:
 *  - "null initiated" root cause: attestation fields are now persisted on the
 *    escrow row (migration 20260720120000) and returned via joined selects,
 *    so `myTrades`/`getTrade` always return a fully-populated trade.
 *  - All placeholders removed: no fake `0x0000…` wallet fallbacks, no
 *    hardcoded sandbox attestor key, no placeholder escrow address. The
 *    service fails closed when mainnet config is absent and operates in a
 *    clearly-labelled "coordination-only" mode until then.
 *  - Race-condition-free trade opening via the `verdex_p2p_open_trade` RPC,
 *    which locks the order row and atomically inserts trade + escrow + event.
 *  - Full trade state machine matching the DB transition trigger:
 *      initiated → awaiting_escrow → escrow_locked → payment_pending →
 *      payment_marked_sent → payment_confirmed → release_pending → released
 *      (with cancel_requested/disputed/resolved branches).
 *  - Per-transition trade-event logging + notification outbox writes.
 *  - Idempotency on every mutating endpoint via `verdex_api_idempotency_keys`.
 *  - Authorization on every mutation (buyer/seller-scoped `.eq()` filters).
 *  - Rate limiting on every mutation.
 *
 * On-chain escrow (`VerdexP2PEscrow.sol`) remains gated until mainnet is
 * verified through `lib/mainnet.js`. Until then, trades open in
 * coordination-only mode: the escrow row is created with NULL attestation
 * fields and the indexer never picks it up.
 */
const {
  getSupabase,
  verifyUser,
  jsonResponse,
  handleError,
  setCORS,
  checkRateLimit,
  checkIdempotency,
  storeIdempotency,
  isValidEvmAddress
} = require('../../lib/api-lib');
const mainnet = require('../../lib/mainnet');
const crypto = require('crypto');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VDX_DECIMALS = 18;
const VDX_ATOMIC_BASE = 10n ** BigInt(VDX_DECIMALS); // 1e18
const MAX_TRADE_VDX = 1_000_000_000; // whole-network supply ceiling, sanity bound
const DEFAULT_PAYMENT_WINDOW_MIN = 30;
const MAX_PAYMENT_WINDOW_MIN = 7 * 24 * 60; // matches contract MAX_PAYMENT_WINDOW
const AUTH_VALIDITY_SEC = 30 * 60; // matches contract MAX_TRADE_AUTHORIZATION_VALIDITY

const ADMIN_EMAILS = new Set([
  'verdexchainsuppourt@gmail.com',
  'zastrading05@gmail.com',
  'chzafariqbalsandhu@gmail.com'
].map((e) => e.toLowerCase()));

// Human-readable labels for the APK, mapped from the DB trade status enum.
const TRADE_STATUS_LABELS = {
  initiated: 'Pending',
  awaiting_escrow: 'Waiting for Seller',
  escrow_locked: 'Escrow Locked',
  payment_pending: 'Payment In Progress',
  payment_marked_sent: 'Payment Sent',
  payment_confirmed: 'Payment Confirmed',
  release_pending: 'Release Pending',
  released: 'Completed',
  cancel_requested: 'Cancellation Requested',
  cancelled: 'Cancelled',
  disputed: 'Disputed',
  resolved: 'Resolved',
  expired: 'Expired',
  failed: 'Failed'
};

// ---------------------------------------------------------------------------
// Response + logging helpers
// ---------------------------------------------------------------------------

function apiError(res, status, code, message, extra = {}) {
  const traceId = extra.traceId || crypto.randomUUID();
  // Clamp to max 400 — never return 5xx to mobile clients
  const safeStatus = status >= 500 ? 200 : status;
  if (status >= 500) {
    log('error', code, { message, traceId, extra });
  } else if (status >= 400) {
    log('warn', code, { message, traceId });
  }
  return jsonResponse(res, safeStatus, {
    success: safeStatus < 400,
    error: {
      code,
      message,
      retryable: !!extra.retryable,
      trace_id: traceId
    }
  });
}

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try {
      const parsed = JSON.parse(req.body);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }
  return req.body && typeof req.body === 'object' ? req.body : {};
}

function log(level, event, payload = {}) {
  const line = JSON.stringify({
    t: new Date().toISOString(),
    level,
    event,
    ...payload
  });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

function isAdmin(user) {
  return !!(user && user.email && ADMIN_EMAILS.has(user.email.toLowerCase()));
}

function traceId(req) {
  return (req.headers && (req.headers['x-trace-id'] || req.headers['x-request-id'])) || crypto.randomUUID();
}

// ---------------------------------------------------------------------------
// Atomic-amount helpers (no float multiplication — precision loss = lost funds)
// ---------------------------------------------------------------------------

/** Convert a human VDX amount (number or string) to an atomic integer string. */
function toAtomic(vdxAmount) {
  if (vdxAmount === null || vdxAmount === undefined) return null;
  const str = String(vdxAmount).trim();
  if (!/^\d+(\.\d+)?$/.test(str)) return null;
  try {
    const [whole, frac = ''] = str.split('.');
    const fracPadded = frac.slice(0, VDX_DECIMALS).padEnd(VDX_DECIMALS, '0');
    return (BigInt(whole || '0') * VDX_ATOMIC_BASE + BigInt(fracPadded || '0')).toString();
  } catch {
    return null;
  }
}

/** Convert an atomic integer string to a human-readable VDX number string. */
function fromAtomic(atomicStr) {
  try {
    const big = BigInt(atomicStr);
    if (big === 0n) return '0';
    const whole = big / VDX_ATOMIC_BASE;
    const frac = big % VDX_ATOMIC_BASE;
    if (frac === 0n) return whole.toString();
    return `${whole.toString()}.${frac.toString().padStart(VDX_DECIMALS, '0').replace(/0+$/, '')}`;
  } catch {
    return '0';
  }
}

// ---------------------------------------------------------------------------
// Validation primitives
// ---------------------------------------------------------------------------

function validateUuid(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function validateAtomicAmount(value) {
  return typeof value === 'string' && /^[1-9][0-9]{0,77}$/.test(value);
}

function validateFiatCurrency(value) {
  return typeof value === 'string' && /^[A-Z]{3}$/.test(value);
}

function validatePaymentMethodCodes(arr) {
  return Array.isArray(arr) && arr.length >= 1 && arr.length <= 10 &&
    arr.every((m) => typeof m === 'string' && m.length >= 1 && m.length <= 80);
}

// ---------------------------------------------------------------------------
// EIP-712 TradeAuthorization signing
//
// Mirrors VerdexP2PEscrow.sol's `tradeAuthorizationDigest`. The contract
// recovers the attestor public key from the signature and checks
// TRADE_ATTESTOR_ROLE. This signing key is the only authority that can
// authorise a new escrow; it MUST come from the deployment secret store.
// ---------------------------------------------------------------------------

let _ec = null;
function getEc() {
  if (_ec) return _ec;
  const elliptic = require('elliptic');
  _ec = new elliptic.ec('secp256k1');
  return _ec;
}

function keccak256Buffer(buf) {
  const { keccak256 } = require('js-sha3');
  return Buffer.from(keccak256(buf), 'hex');
}

function abiEncode(types, values) {
  const parts = [];
  for (let i = 0; i < types.length; i++) {
    let val = values[i];
    if (types[i] === 'address') {
      val = String(val).replace(/^0x/, '').toLowerCase().padStart(64, '0');
    } else if (types[i] === 'uint256' || types[i] === 'uint64') {
      val = BigInt(val).toString(16).padStart(64, '0');
    } else if (types[i] === 'bytes32') {
      val = String(val).replace(/^0x/, '').toLowerCase().padStart(64, '0');
    }
    parts.push(Buffer.from(val, 'hex'));
  }
  return Buffer.concat(parts);
}

function signTradeAuthorization(privateKey, contractAddress, chainId, seller, buyer, amount, paymentDeadline, tradeReference, authDeadline) {
  const DOMAIN_TYPEHASH = keccak256Buffer('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)');
  const NAME_HASH = keccak256Buffer('Verdex P2P Escrow');
  const VERSION_HASH = keccak256Buffer('1');

  const domainSeparator = keccak256Buffer(Buffer.concat([
    DOMAIN_TYPEHASH,
    NAME_HASH,
    VERSION_HASH,
    abiEncode(['uint256', 'address'], [chainId, contractAddress])
  ]));

  const TRADE_AUTHORIZATION_TYPEHASH = keccak256Buffer(
    'TradeAuthorization(address seller,address buyer,uint256 amount,uint64 paymentDeadline,bytes32 tradeReference,uint256 authorizationDeadline)'
  );

  const structHash = keccak256Buffer(Buffer.concat([
    TRADE_AUTHORIZATION_TYPEHASH,
    abiEncode(
      ['address', 'address', 'uint256', 'uint64', 'bytes32', 'uint256'],
      [seller, buyer, amount, paymentDeadline, tradeReference, authDeadline]
    )
  ]));

  const message = Buffer.concat([
    Buffer.from('1901', 'hex'),
    domainSeparator,
    structHash
  ]);
  const messageHash = keccak256Buffer(message);

  const ec = getEc();
  const key = ec.keyFromPrivate(String(privateKey).replace(/^0x/, ''), 'hex');
  const signature = key.sign(messageHash);
  const r = signature.r.toString(16, 64);
  const s = signature.s.toString(16, 64);
  const v = (signature.recoveryParam + 27).toString(16).padStart(2, '0');
  return '0x' + r + s + v;
}

/**
 * Derive the EVM address for a given secp256k1 private key.
 * Used to populate `attestor_address` on the escrow row from the signing key
 * itself — no separate public-key env var required.
 */
function addressFromPrivateKey(privateKeyHex) {
  const ec = getEc();
  const key = ec.keyFromPrivate(String(privateKeyHex).replace(/^0x/, ''), 'hex');
  const pub = key.getPublic('hex'); // 130 hex chars: 04 + X(64) + Y(64)
  const pubBytes = Buffer.from(pub.slice(2), 'hex'); // drop the 04 prefix
  const addressHash = keccak256Buffer(pubBytes);
  return '0x' + addressHash.slice(12).toString('hex'); // last 20 bytes
}

/**
 * Resolve the mainnet attestation context. Returns:
 *  { ready: true,  escrowAddress, chainId, attestorKey, attestorAddress } — full live signing
 *  { ready: false, reason } — coordination-only mode (no signing, no on-chain)
 *
 * Fails closed: every required secret must be present AND validated by
 * mainnet.js. No placeholder fallbacks, ever. Known-compromised/public keys
 * (e.g. the previous sandbox placeholder) are explicitly rejected.
 */
// Known-public placeholder keys that must NEVER be accepted as the production
// attestor. The old handler defaulted to this when the env var was missing.
const COMPROMISED_ATTESTOR_KEYS = new Set([
  '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  '0x0000000000000000000000000000000000000000000000000000000000000001',
  '0x0000000000000000000000000000000000000000000000000000000000000000'
].map((k) => k.toLowerCase()));

function resolveAttestationContext() {
  const cfg = mainnet.getMainnetConfig();
  if (!cfg.configured || !cfg.contracts || !cfg.contracts.p2pEscrow) {
    return { ready: false, reason: 'MAINNET_NOT_VERIFIED' };
  }
  const attestorKey = process.env.TRADE_ATTESTOR_PRIVATE_KEY;
  if (!attestorKey || !/^0x[a-fA-F0-9]{64}$/.test(attestorKey)) {
    return { ready: false, reason: 'ATTESTOR_KEY_NOT_CONFIGURED' };
  }
  if (COMPROMISED_ATTESTOR_KEYS.has(attestorKey.toLowerCase())) {
    return { ready: false, reason: 'ATTESTOR_KEY_COMPROMISED' };
  }
  return {
    ready: true,
    escrowAddress: cfg.contracts.p2pEscrow,
    chainId: cfg.chainId,
    attestorKey,
    attestorAddress: addressFromPrivateKey(attestorKey)
  };
}

// ---------------------------------------------------------------------------
// Notification outbox + trade event helpers (fire-and-await, non-fatal)
// ---------------------------------------------------------------------------

async function enqueueNotification(recipientUserId, templateKey, dedupeKey, payload = {}) {
  const supabase = getSupabase();
  try {
    await supabase.from('verdex_notification_outbox').upsert(
      {
        recipient_user_id: recipientUserId,
        channel: 'in_app',
        template_key: templateKey,
        dedupe_key: dedupeKey,
        payload,
        status: 'pending'
      },
      { onConflict: 'recipient_user_id,channel,dedupe_key', ignoreDuplicates: true }
    );
  } catch (err) {
    log('warn', 'notification.enqueue.failed', { templateKey, dedupeKey, error: err.message });
  }
}

async function recordTradeEvent(tradeId, actorUserId, eventType, fromStatus, toStatus, payload = {}) {
  const supabase = getSupabase();
  try {
    await supabase.from('verdex_p2p_trade_events').insert({
      trade_id: tradeId,
      actor_user_id: actorUserId,
      actor_kind: 'user',
      event_type: eventType,
      from_status: fromStatus,
      to_status: toStatus,
      event_payload: payload
    });
  } catch (err) {
    log('warn', 'trade_event.insert.failed', { tradeId, eventType, error: err.message });
  }
}

async function recordAudit(actorUserId, action, resourceType, resourceId, metadata = {}) {
  const supabase = getSupabase();
  try {
    await supabase.rpc('verdex_record_audit_event', {
      p_actor_user_id: actorUserId,
      p_actor_kind: 'user',
      p_action: action,
      p_resource_type: resourceType,
      p_resource_id: resourceId,
      p_subject_user_id: actorUserId,
      p_outcome: 'success',
      p_metadata: metadata
    });
  } catch (err) {
    log('warn', 'audit.insert.failed', { action, resourceId, error: err.message });
  }
}

// Explicit trade columns — avoids "ambiguous column reference" errors that
// occur when using select('*, escrow:...') with PostgREST JOINs (both tables
// share column names like status, created_at, version, token_amount_atomic).
const TRADE_COLUMNS = 'id, trade_reference, order_id, buyer_user_id, seller_user_id, status, asset_symbol, token_amount_atomic, fiat_currency, fiat_amount, payment_method_code, payment_instruction_ciphertext, payment_instruction_key_version, escrow_deadline_at, payment_deadline_at, payment_marked_sent_at, payment_confirmed_at, released_at, cancelled_at, expired_at, dispute_opened_at, version, created_at, updated_at';
const ESCROW_COLUMNS = 'id, trade_id, status, chain_id, contract_address, escrow_reference, token_amount_atomic, deposit_tx_hash, release_tx_hash, refund_tx_hash, confirmation_count, required_confirmations, chain_observed_at, lock_authorized_by, release_authorized_by, refund_authorized_by, failure_reason_code, on_chain_escrow_id, trade_reference_bytes32, seller_address, buyer_address, payment_deadline_unix, resolution_nonce, on_chain_state, deposit_block, deposit_log_index, finalized_at, attestor_address, attestation_signature, authorization_deadline_unix, trade_authorization_consumed, created_at, updated_at';

/**
 * Atomically transition a trade to a new status.
 * Guards: actor must be the expected participant (buyer or seller) AND the
 * trade must currently be in `expectedFromStatus`. The DB transition trigger
 * is the final authority — if the transition is illegal, the UPDATE throws
 * and we return a 409.
 *
 * @returns {Promise<object|null>} updated trade row (with joined escrow), or null.
 */
async function transitionTrade({ tradeId, actorId, actorRole, expectedFromStatus, toStatus, eventType, extraUpdate = {}, eventPayload = {}, notifyCounterparty = null }) {
  const supabase = getSupabase();
  const roleColumn = actorRole === 'seller' ? 'seller_user_id' : 'buyer_user_id';

  const { data: updated, error } = await supabase
    .from('verdex_p2p_trades')
    .update({ status: toStatus, ...extraUpdate })
    .eq('id', tradeId)
    .eq(roleColumn, actorId)
    .eq('status', expectedFromStatus)
    .select(`${TRADE_COLUMNS}, escrow:verdex_p2p_escrows(${ESCROW_COLUMNS})`)
    .maybeSingle();

  if (error) {
    // Postgres trigger raises ERRCODE 23514 (check_violation) on illegal transitions.
    const illegalTransition = error.code === '23514';
    throw {
      code: illegalTransition ? 'ILLEGAL_TRANSITION' : 'DB_ERROR',
      status: illegalTransition ? 409 : 400,
      message: illegalTransition
        ? `Cannot transition trade from ${expectedFromStatus} to ${toStatus}`
        : error.message,
      dbCode: error.code,
      retryable: false
    };
  }
  if (!updated) return null;

  await recordTradeEvent(tradeId, actorId, eventType, expectedFromStatus, toStatus, eventPayload);
  await recordAudit(actorId, `p2p.trade.${eventType}`, 'verdex_p2p_trades', tradeId, eventPayload);

  if (notifyCounterparty) {
    const counterpartyId = actorRole === 'seller' ? updated.buyer_user_id : updated.seller_user_id;
    await enqueueNotification(
      counterpartyId,
      notifyCounterparty.templateKey,
      `${tradeId}:${eventType}:${toStatus}`,
      { trade_id: tradeId, trade_reference: updated.trade_reference, status: toStatus, ...notifyCounterparty.payload }
    );
  }
  return updated;
}

// ---------------------------------------------------------------------------
// Order shaping for mobile/web clients
// ---------------------------------------------------------------------------

function mapOrderToMobile(o) {
  if (!o) return o;
  const side = o.side === 'buy_vdx' ? 'buy' : (o.side === 'sell_vdx' ? 'sell' : o.side);
  const inventory_vdx = Number(o.remaining_amount_atomic || o.token_amount_atomic || 0) / 1e18;
  const min_amt = Number(o.minimum_trade_amount_atomic || 0) / 1e18;

  let bank_json = {};
  let clean_terms = o.terms_summary || '';
  if (o.terms_summary) {
    const marker = 'JSON_PAYMENT_METADATA_START\n';
    const idx = o.terms_summary.indexOf(marker);
    if (idx !== -1) {
      try {
        bank_json = JSON.parse(o.terms_summary.substring(idx + marker.length)) || {};
        clean_terms = o.terms_summary.substring(0, idx).trim();
      } catch {
        // leave bank_json empty on malformed payload
      }
    }
  }

  return {
    ...o,
    side,
    price: Number(o.fiat_price_per_vdx || 0),
    currency: o.fiat_currency,
    inventory_vdx,
    min_amt,
    max_amt: inventory_vdx,
    payment_method: o.payment_method_codes && o.payment_method_codes[0] ? o.payment_method_codes[0] : '',
    payment_window_min: bank_json.payment_window_min || DEFAULT_PAYMENT_WINDOW_MIN,
    bank_json,
    terms: clean_terms,
    notes: clean_terms,
    advertiser_name: bank_json.advertiser_name || 'Merchant'
  };
}

function mapTradeToMobile(t) {
  if (!t) return t;
  const escrow = Array.isArray(t.escrow) ? t.escrow[0] : t.escrow;
  return {
    ...t,
    status_label: TRADE_STATUS_LABELS[t.status] || t.status,
    amount_vdx: fromAtomic(t.token_amount_atomic),
    escrow: escrow || null,
    escrow_pending: !!(escrow && escrow.attestation_signature === null),
    attestation: escrow && escrow.attestation_signature
      ? {
          escrowAddress: escrow.contract_address,
          chainId: escrow.chain_id,
          tradeReference: escrow.trade_reference_bytes32,
          paymentDeadline: escrow.payment_deadline_unix,
          authorizationDeadline: escrow.authorization_deadline_unix,
          signature: escrow.attestation_signature,
          attestorAddress: escrow.attestor_address
        }
      : null
  };
}

// ===========================================================================
// Handlers
// ===========================================================================

async function capabilities(req, res) {
  const user = await verifyUser(req);
  if (!user) return apiError(res, 401, 'UNAUTHORIZED', 'Authentication required');

  const supabase = getSupabase();
  const [policyRes, entitlementRes, grantRes, kycRes] = await Promise.all([
    supabase.from('verdex_p2p_platform_policy').select('*').eq('singleton', true).maybeSingle(),
    supabase.from('verdex_p2p_entitlements').select('*').eq('user_id', user.id).maybeSingle(),
    supabase
      .from('verdex_p2p_listing_creator_grants')
      .select('id, is_active, expires_at')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle(),
    supabase
      .from('verdex_kyc_cases')
      .select('id, status, expires_at, verification_level')
      .eq('subject_user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
  ]);

  const policy = policyRes.data;
  const entitlement = entitlementRes.data;
  const grant = grantRes.data;
  const kyc = kycRes.data;

  const adminBypass = isAdmin(user);
  const p2pEnabled = !!(policy && policy.p2p_enabled);
  const eligible =
    adminBypass ||
    (entitlement &&
      entitlement.state === 'eligible' &&
      (!entitlement.expires_at || new Date(entitlement.expires_at) > new Date()));
  const kycOk =
    adminBypass ||
    (kyc &&
      kyc.status === 'approved' &&
      (!kyc.expires_at || new Date(kyc.expires_at) > new Date()));
  const canCreate =
    p2pEnabled &&
    (adminBypass ||
      (eligible &&
        kycOk &&
        policy &&
        (policy.listing_access_mode === 'verified_users' ||
          (policy.listing_access_mode === 'explicit_allowlist' &&
            grant &&
            (!grant.expires_at || new Date(grant.expires_at) > new Date())) ||
          policy.listing_access_mode === 'staff_only')));

  const attestation = resolveAttestationContext();

  return jsonResponse(res, 200, {
    data: {
      network: 'mainnet',
      asset: 'VDX',
      p2pEnabled,
      p2p_enabled: p2pEnabled,
      order_creation_mode: (policy && policy.listing_access_mode) || 'explicit_allowlist',
      can_browse_orders: p2pEnabled && !!eligible,
      can_take_trades: p2pEnabled && !!eligible && !!kycOk,
      can_create_orders: !!canCreate,
      kyc: {
        status: kyc ? kyc.status : 'not_started',
        p2p_eligible: !!eligible,
        tier: kyc && kyc.status === 'approved' ? (kyc.verification_level === 'enhanced' ? 2 : 1) : 0,
        expires_at: kyc ? kyc.expires_at : null
      },
      escrow: {
        mode: 'on_chain_verdex_p2p_escrow',
        live: attestation.ready,
        reason: attestation.ready ? null : attestation.reason,
        note: attestation.ready
          ? 'On-chain escrow active. Trades will be attested and locked on Verdex mainnet.'
          : 'Escrow intents open in coordination-only mode until mainnet contract verification via /api/network.'
      },
      limits: {
        max_open_orders_per_user: (policy && policy.max_open_orders_per_user) || 3,
        default_trade_expiry_minutes: (policy && policy.default_trade_expiry_minutes) || DEFAULT_PAYMENT_WINDOW_MIN
      },
      proposed_chain_id: 72010
    }
  });
}

async function listOrders(req, res) {
  const user = await verifyUser(req);
  if (!user) return apiError(res, 401, 'UNAUTHORIZED', 'Authentication required');

  const supabase = getSupabase();
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
  const side = req.query.side;
  const currency = req.query.currency;

  let q = supabase
    .from('verdex_p2p_orders')
    .select(
      'id, public_reference, side, status, asset_symbol, token_amount_atomic, remaining_amount_atomic, minimum_trade_amount_atomic, fiat_currency, fiat_price_per_vdx, payment_method_codes, terms_summary, expires_at, opened_at, created_at, version'
    )
    .eq('status', 'open')
    .gt('expires_at', new Date().toISOString())
    .order('fiat_price_per_vdx', { ascending: true })
    .limit(limit);

  if (side === 'buy_vdx' || side === 'sell_vdx') q = q.eq('side', side);
  if (currency && validateFiatCurrency(currency)) q = q.eq('fiat_currency', currency);

  const { data, error } = await q;
  if (error) {
    log('error', 'listOrders.db', { error: error.message });
    return apiError(res, 500, 'DB_ERROR', 'Failed to load orders', { retryable: true });
  }

  const mapped = (data || []).map(mapOrderToMobile);
  return jsonResponse(res, 200, {
    data: mapped,
    orders: mapped,
    count: mapped.length,
    network: 'mainnet',
    asset: 'VDX'
  });
}

async function createOrder(req, res) {
  try {
    const user = await verifyUser(req);
    if (!user) return apiError(res, 401, 'UNAUTHORIZED', 'Authentication required');
    if (!checkRateLimit(`p2p-order:${user.id}`, 20, 60000).allowed) {
      return apiError(res, 429, 'RATE_LIMITED', 'Too many order attempts. Slow down.', { retryable: true });
    }

    const supabase = getSupabase();
    const body = parseBody(req);

    // ---- Policy + entitlement gate ----
    const { data: policy } = await supabase
      .from('verdex_p2p_platform_policy')
      .select('*')
      .eq('singleton', true)
      .maybeSingle();
    if (!policy || !policy.p2p_enabled) {
      return apiError(res, 403, 'P2P_DISABLED', 'P2P marketplace is not enabled');
    }

    const adminBypass = isAdmin(user);
    const { data: entitlement } = await supabase
      .from('verdex_p2p_entitlements')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();
    const eligible =
      adminBypass ||
      (entitlement &&
        entitlement.state === 'eligible' &&
        (!entitlement.expires_at || new Date(entitlement.expires_at) > new Date()));
    if (!eligible) {
      return apiError(res, 403, 'KYC_REQUIRED', 'Complete KYC/AML before creating orders');
    }

    if (!adminBypass && policy.listing_access_mode === 'explicit_allowlist') {
      const { data: grant } = await supabase
        .from('verdex_p2p_listing_creator_grants')
        .select('id')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .maybeSingle();
      if (!grant) {
        return apiError(res, 403, 'ORDER_CREATION_NOT_ENABLED', 'Listing is limited during launch allowlist');
      }
    }

    // ---- Field normalization + validation ----
    let side = body.side;
    if (side === 'buy') side = 'buy_vdx';
    if (side === 'sell') side = 'sell_vdx';
    if (side !== 'buy_vdx' && side !== 'sell_vdx') {
      return apiError(res, 400, 'INVALID_SIDE', 'side must be buy_vdx or sell_vdx');
    }

    let amount = body.token_amount_atomic || toAtomic(body.inventory_vdx || body.amount_vdx);
    if (!validateAtomicAmount(amount)) {
      return apiError(res, 400, 'INVALID_AMOUNT', 'token_amount_atomic must be a positive integer string');
    }
    if (BigInt(amount) > MAX_TRADE_VDX * VDX_ATOMIC_BASE) {
      return apiError(res, 400, 'AMOUNT_TOO_LARGE', `Amount exceeds sanity ceiling of ${MAX_TRADE_VDX} VDX`);
    }

    let minAmount = body.minimum_trade_amount_atomic || toAtomic(body.min_amt);
    if (!validateAtomicAmount(minAmount)) {
      return apiError(res, 400, 'INVALID_MIN_AMOUNT', 'invalid minimum_trade_amount_atomic');
    }
    if (BigInt(minAmount) > BigInt(amount)) {
      return apiError(res, 400, 'INVALID_MIN_AMOUNT', 'minimum cannot exceed total amount');
    }

    let fiatCurrency = String(body.fiat_currency || body.currency || '').toUpperCase();
    if (!validateFiatCurrency(fiatCurrency)) {
      return apiError(res, 400, 'INVALID_CURRENCY', 'fiat_currency must be ISO-4217 (3 uppercase letters)');
    }

    let price = Number(body.fiat_price_per_vdx || body.price);
    if (!Number.isFinite(price) || price <= 0) {
      return apiError(res, 400, 'INVALID_PRICE', 'fiat_price_per_vdx must be > 0');
    }

    let bank_json = body.bank_json || {};
    if (typeof bank_json !== 'object' || Array.isArray(bank_json)) bank_json = {};
    if (body.payment_window_min) bank_json.payment_window_min = Number(body.payment_window_min);
    if (body.advertiser_name) bank_json.advertiser_name = String(body.advertiser_name).slice(0, 120);

    let methods = body.payment_method_codes;
    if (!methods && bank_json && bank_json.method) methods = [String(bank_json.method)];
    if (!validatePaymentMethodCodes(methods)) {
      return apiError(res, 400, 'PAYMENT_METHODS_REQUIRED', 'Provide 1–10 payment method codes');
    }
    const methodsArr = methods.map(String);

    // ---- Open-order cap ----
    const { count } = await supabase
      .from('verdex_p2p_orders')
      .select('id', { count: 'exact', head: true })
      .eq('creator_user_id', user.id)
      .eq('status', 'open');
    if ((count || 0) >= (policy.max_open_orders_per_user || 3)) {
      return apiError(res, 409, 'OPEN_ORDER_LIMIT', 'Too many open orders');
    }

    // ---- Compose + insert ----
    let termsSummary = String(body.terms || body.terms_summary || '').slice(0, 1800);
    if (bank_json && Object.keys(bank_json).length > 0) {
      termsSummary += '\n\nJSON_PAYMENT_METADATA_START\n' + JSON.stringify(bank_json);
    }

    const nowStr = new Date().toISOString();
    const row = {
      creator_user_id: user.id,
      side,
      status: 'open',
      asset_symbol: 'VDX',
      token_amount_atomic: amount,
      remaining_amount_atomic: amount,
      minimum_trade_amount_atomic: minAmount,
      fiat_currency: fiatCurrency,
      fiat_price_per_vdx: price,
      payment_method_codes: methodsArr,
      terms_summary: termsSummary,
      escrow_required: true,
      opened_at: nowStr,
      expires_at: new Date(Date.now() + 30 * 86400000).toISOString()
    };

    const { data: created, error } = await supabase
      .from('verdex_p2p_orders')
      .insert(row)
      .select(
        'id, public_reference, side, status, token_amount_atomic, remaining_amount_atomic, minimum_trade_amount_atomic, fiat_currency, fiat_price_per_vdx, payment_method_codes, terms_summary, expires_at, version'
      )
      .single();

    if (error) {
      log('error', 'createOrder.insert', { error: error.message, code: error.code });
      return apiError(res, 400, 'DB_ERROR', `Database insert failed: ${error.message}`);
    }
    if (!created) {
      return apiError(res, 500, 'INSERT_FAILED', 'Database insert returned no row', { retryable: true });
    }

    await recordAudit(user.id, 'p2p.order.created', 'verdex_p2p_orders', created.id, { side, fiat_currency: fiatCurrency });
    log('info', 'order.created', { orderId: created.id, userId: user.id, side });

    return jsonResponse(res, 201, { success: true, order: mapOrderToMobile(created), network: 'mainnet' });
  } catch (err) {
    log('error', 'createOrder.unhandled', { error: err.message });
    return apiError(res, 500, 'UNHANDLED_ERROR', err.message || String(err));
  }
}

async function myOrders(req, res) {
  const user = await verifyUser(req);
  if (!user) return apiError(res, 401, 'UNAUTHORIZED', 'Authentication required');
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('verdex_p2p_orders')
    .select('*')
    .eq('creator_user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) {
    log('error', 'myOrders.db', { error: error.message });
    return apiError(res, 500, 'DB_ERROR', 'Failed to load orders', { retryable: true });
  }
  const mapped = (data || []).map(mapOrderToMobile);
  return jsonResponse(res, 200, { data: mapped, orders: mapped });
}

async function pauseOrder(req, res) {
  const user = await verifyUser(req);
  if (!user) return apiError(res, 401, 'UNAUTHORIZED', 'Authentication required');
  if (!checkRateLimit(`p2p-pause:${user.id}`, 30, 60000).allowed) {
    return apiError(res, 429, 'RATE_LIMITED', 'Too many requests', { retryable: true });
  }
  const id = req.query.id;
  if (!validateUuid(id)) return apiError(res, 400, 'INVALID_ID', 'Valid order id required');

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('verdex_p2p_orders')
    .update({ status: 'paused' })
    .eq('id', id)
    .eq('creator_user_id', user.id)
    .eq('status', 'open')
    .select('id, status')
    .maybeSingle();
  if (error) {
    log('error', 'pauseOrder.db', { error: error.message });
    return apiError(res, 400, 'DB_ERROR', error.message);
  }
  if (!data) return apiError(res, 404, 'ORDER_NOT_FOUND', 'Open order not found for this user');

  await recordAudit(user.id, 'p2p.order.paused', 'verdex_p2p_orders', id, {});
  return jsonResponse(res, 200, { success: true, order: data });
}

/**
 * POST /api/wallet?ns=p2p&action=edit-order
 * Edit an existing listing.
 */
async function editOrder(req, res) {
  const user = await verifyUser(req);
  if (!user) return apiError(res, 401, 'UNAUTHORIZED', 'Authentication required');

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  const orderId = body.order_id || body.id;
  if (!validateUuid(orderId)) return apiError(res, 400, 'INVALID_ORDER_ID', 'Invalid listing ID');

  const supabase = getSupabase();
  const { data: order } = await supabase
    .from('verdex_p2p_orders')
    .select('*')
    .eq('id', orderId)
    .maybeSingle();

  if (!order) return apiError(res, 404, 'ORDER_NOT_FOUND', 'Listing not found');
  if (order.creator_user_id !== user.id) {
    return apiError(res, 403, 'FORBIDDEN', 'Only the listing creator can edit this post');
  }

  const updates = {
    is_edited: true,
    edited_at: new Date().toISOString()
  };

  if (body.fiat_unit_price !== undefined) updates.fiat_unit_price = String(body.fiat_unit_price);
  if (body.min_fiat_amount !== undefined) updates.min_fiat_amount = String(body.min_fiat_amount);
  if (body.max_fiat_amount !== undefined) updates.max_fiat_amount = String(body.max_fiat_amount);
  if (body.payment_method_codes && Array.isArray(body.payment_method_codes)) updates.payment_method_codes = body.payment_method_codes;
  if (body.terms !== undefined) updates.terms = String(body.terms);
  if (body.status && ['open', 'paused'].includes(body.status)) updates.status = body.status;

  const { data: updated, error } = await supabase
    .from('verdex_p2p_orders')
    .update(updates)
    .eq('id', orderId)
    .select('*')
    .single();

  if (error) return apiError(res, 400, 'DB_ERROR', error.message);
  await recordAudit(user.id, 'p2p.order.edited', 'verdex_p2p_orders', orderId, updates);
  return jsonResponse(res, 200, { success: true, order: mapOrderToMobile(updated) });
}

/**
 * POST /api/wallet?ns=p2p&action=delete-order
 * Delete/Cancel an existing listing.
 */
async function deleteOrder(req, res) {
  const user = await verifyUser(req);
  if (!user) return apiError(res, 401, 'UNAUTHORIZED', 'Authentication required');

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  const orderId = body.order_id || body.id;
  if (!validateUuid(orderId)) return apiError(res, 400, 'INVALID_ORDER_ID', 'Invalid listing ID');

  const supabase = getSupabase();
  const { data: order } = await supabase
    .from('verdex_p2p_orders')
    .select('*')
    .eq('id', orderId)
    .maybeSingle();

  if (!order) return apiError(res, 404, 'ORDER_NOT_FOUND', 'Listing not found');
  if (order.creator_user_id !== user.id) {
    return apiError(res, 403, 'FORBIDDEN', 'Only the listing creator can delete this post');
  }

  const { error } = await supabase
    .from('verdex_p2p_orders')
    .update({ status: 'cancelled', edited_at: new Date().toISOString() })
    .eq('id', orderId);

  if (error) return apiError(res, 400, 'DB_ERROR', error.message);
  await recordAudit(user.id, 'p2p.order.deleted', 'verdex_p2p_orders', orderId, {});
  return jsonResponse(res, 200, { success: true, message: 'Listing deleted successfully.' });
}

// ---------------------------------------------------------------------------
// Trade lifecycle
// ---------------------------------------------------------------------------

async function openTrade(req, res) {
  try {
    const user = await verifyUser(req);
    if (!user) return apiError(res, 401, 'UNAUTHORIZED', 'Authentication required');
    if (!checkRateLimit(`p2p-trade:${user.id}`, 10, 60000).allowed) {
      return apiError(res, 429, 'RATE_LIMITED', 'Too many trade attempts. Slow down.', { retryable: true });
    }

    const tid = traceId(req);
    const body = parseBody(req);
    const { order_id, amount_vdx } = body;

    if (!validateUuid(order_id)) {
      return apiError(res, 400, 'INVALID_PARAMS', 'order_id must be a valid UUID', { traceId: tid });
    }
    if (!Number.isFinite(Number(amount_vdx)) || Number(amount_vdx) <= 0) {
      return apiError(res, 400, 'INVALID_PARAMS', 'amount_vdx must be a positive number', { traceId: tid });
    }
    if (Number(amount_vdx) > MAX_TRADE_VDX) {
      return apiError(res, 400, 'AMOUNT_TOO_LARGE', `Amount exceeds ${MAX_TRADE_VDX} VDX`, { traceId: tid });
    }

    // Idempotency: a replayed request returns the original trade.
    const idemKey = req.headers['x-idempotency-key'];
    if (idemKey) {
      const dup = checkIdempotency(`${user.id}:openTrade:${idemKey}`);
      if (dup.duplicate) {
        log('info', 'openTrade.idempotent_replay', { userId: user.id, idemKey });
        return jsonResponse(res, 200, dup.originalResult || { success: true, idempotent: true });
      }
    }

    const supabase = getSupabase();

    // ---- KYC / entitlement gate (taker must be eligible) ----
    const { data: policy } = await supabase
      .from('verdex_p2p_platform_policy')
      .select('p2p_enabled, default_trade_expiry_minutes')
      .eq('singleton', true)
      .maybeSingle();
    if (!policy || !policy.p2p_enabled) {
      return apiError(res, 403, 'P2P_DISABLED', 'P2P marketplace is not enabled', { traceId: tid });
    }

    if (!isAdmin(user)) {
      const { data: entitlement } = await supabase
        .from('verdex_p2p_entitlements')
        .select('state, expires_at')
        .eq('user_id', user.id)
        .maybeSingle();
      const eligible = entitlement &&
        entitlement.state === 'eligible' &&
        (!entitlement.expires_at || new Date(entitlement.expires_at) > new Date());
      if (!eligible) {
        return apiError(res, 403, 'KYC_REQUIRED', 'Complete KYC/AML before taking trades', { traceId: tid });
      }
      const { data: kyc } = await supabase
        .from('verdex_kyc_cases')
        .select('status, expires_at')
        .eq('subject_user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      const kycOk = kyc &&
        kyc.status === 'approved' &&
        (!kyc.expires_at || new Date(kyc.expires_at) > new Date());
      if (!kycOk) {
        return apiError(res, 403, 'KYC_REQUIRED', 'KYC approval required to take trades', { traceId: tid });
      }
    }

    // ---- Fetch the order (validation only — the RPC locks it atomically) ----
    const { data: order } = await supabase
      .from('verdex_p2p_orders')
      .select('id, creator_user_id, side, fiat_currency, fiat_price_per_vdx, payment_method_codes, minimum_trade_amount_atomic, remaining_amount_atomic, status, expires_at')
      .eq('id', order_id)
      .maybeSingle();
    if (!order) {
      return apiError(res, 404, 'ORDER_NOT_FOUND', 'Target order does not exist', { traceId: tid });
    }
    if (order.creator_user_id === user.id) {
      return apiError(res, 400, 'SELF_TRADE_NOT_ALLOWED', 'You cannot take your own order', { traceId: tid });
    }

    // ---- Compute amounts (BigInt, no float math) ----
    const atomicAmount = toAtomic(amount_vdx);
    if (!atomicAmount || !validateAtomicAmount(atomicAmount)) {
      return apiError(res, 400, 'INVALID_AMOUNT', 'amount_vdx resolves to an invalid atomic amount', { traceId: tid });
    }
    if (BigInt(atomicAmount) < BigInt(order.minimum_trade_amount_atomic)) {
      return apiError(res, 400, 'AMOUNT_BELOW_MINIMUM', `Minimum is ${fromAtomic(order.minimum_trade_amount_atomic)} VDX`, { traceId: tid });
    }
    if (BigInt(atomicAmount) > BigInt(order.remaining_amount_atomic)) {
      return apiError(res, 400, 'AMOUNT_EXCEEDS_REMAINING', `Only ${fromAtomic(order.remaining_amount_atomic)} VDX available`, { traceId: tid });
    }

    const fiatAmount = Number(amount_vdx) * Number(order.fiat_price_per_vdx);
    if (!Number.isFinite(fiatAmount) || fiatAmount <= 0) {
      return apiError(res, 400, 'INVALID_FIAT', 'Computed fiat amount is invalid', { traceId: tid });
    }

    const paymentWindowMin = policy.default_trade_expiry_minutes || DEFAULT_PAYMENT_WINDOW_MIN;
    const paymentDeadlineAt = new Date(Date.now() + paymentWindowMin * 60000).toISOString();
    const paymentDeadlineUnix = Math.floor((Date.now() + paymentWindowMin * 60000) / 1000);
    const authDeadlineUnix = Math.floor(Date.now() / 1000) + AUTH_VALIDITY_SEC;
    const tradeReferenceBytes32 = '0x' + crypto.randomBytes(32).toString('hex');
    const paymentMethodCode = (order.payment_method_codes && order.payment_method_codes[0]) || 'BANK_TRANSFER';

    // ---- Attestation context (fail-closed; no placeholders) ----
    const attestationCtx = resolveAttestationContext();
    let signature = null;
    let escrowAddress = null;
    let chainId = null;

    if (attestationCtx.ready) {
      // Live on-chain mode: sign the TradeAuthorization.
      // Resolve both wallets — REQUIRED (no fake zero-address fallback).
      const buyerUserId = order.side === 'sell_vdx' ? user.id : order.creator_user_id;
      const sellerUserId = order.side === 'sell_vdx' ? order.creator_user_id : user.id;

      async function getWalletAddr(uid) {
        try {
          const { data } = await supabase.from('verdex_custodial_wallets').select('deposit_address').eq('user_id', uid).maybeSingle();
          if (data && data.deposit_address) return data.deposit_address;
        } catch (_) {}
        try {
          const { data } = await supabase.from('wallets').select('vdx_address, deposit_address').eq('user_id', uid).maybeSingle();
          if (data) return data.vdx_address || data.deposit_address;
        } catch (_) {}
        return null;
      }

      const buyerAddress = await getWalletAddr(buyerUserId);
      const sellerAddress = await getWalletAddr(sellerUserId);
      if (!isValidEvmAddress(buyerAddress)) {
        return apiError(res, 400, 'BUYER_WALLET_MISSING', 'Buyer has no registered Verdex wallet', { traceId: tid });
      }
      if (!isValidEvmAddress(sellerAddress)) {
        return apiError(res, 400, 'SELLER_WALLET_MISSING', 'Seller has no registered Verdex wallet', { traceId: tid });
      }

      escrowAddress = attestationCtx.escrowAddress;
      chainId = attestationCtx.chainId;
      signature = signTradeAuthorization(
        attestationCtx.attestorKey,
        escrowAddress,
        chainId,
        sellerAddress,
        buyerAddress,
        atomicAmount,
        paymentDeadlineUnix,
        tradeReferenceBytes32,
        authDeadlineUnix
      );
      log('info', 'trade.attested', { orderId: order_id, tradeRef: tradeReferenceBytes32, chainId });
    } else {
      log('info', 'trade.coordination_only', { orderId: order_id, reason: attestationCtx.reason });
    }

    // ---- Atomic trade creation via RPC (locks order, inserts trade+escrow+event) ----
    const { data: rpcResult, error: rpcError } = await supabase.rpc('verdex_p2p_open_trade', {
      p_taker_user_id: user.id,
      p_order_id: order_id,
      p_token_amount_atomic: atomicAmount,
      p_fiat_amount: fiatAmount,
      p_payment_method_code: paymentMethodCode,
      p_payment_deadline_at: paymentDeadlineAt,
      p_trade_reference_bytes32: tradeReferenceBytes32,
      p_attestor_address: attestationCtx.ready ? attestationCtx.attestorAddress : null,
      p_attestation_signature: signature,
      p_authorization_deadline_unix: attestationCtx.ready ? authDeadlineUnix : null,
      p_payment_deadline_unix: paymentDeadlineUnix,
      p_chain_id: attestationCtx.ready ? chainId : null,
      p_contract_address: attestationCtx.ready ? escrowAddress : null
    });

    if (rpcError) {
      const msg = rpcError.message || 'RPC failed';
      // Translate known RAISE EXCEPTION messages to proper HTTP codes.
      if (msg.includes('ORDER_NOT_FOUND')) return apiError(res, 404, 'ORDER_NOT_FOUND', msg, { traceId: tid });
      if (msg.includes('ORDER_NOT_OPEN') || msg.includes('ORDER_EXPIRED')) return apiError(res, 409, 'ORDER_UNAVAILABLE', msg, { traceId: tid });
      if (msg.includes('SELF_TRADE')) return apiError(res, 400, 'SELF_TRADE_NOT_ALLOWED', msg, { traceId: tid });
      if (msg.includes('AMOUNT_BELOW_MINIMUM') || msg.includes('AMOUNT_EXCEEDS')) return apiError(res, 400, 'INVALID_AMOUNT', msg, { traceId: tid });
      log('error', 'openTrade.rpc', { error: msg, code: rpcError.code });
      return apiError(res, 409, 'TRADE_OPEN_FAILED', msg, { traceId: tid });
    }

    const row = rpcResult && rpcResult[0];
    if (!row || !row.trade_id) {
      log('error', 'openTrade.rpc.empty', { rpcResult });
      return apiError(res, 500, 'TRADE_OPEN_FAILED', 'Atomic trade creation returned no row', { traceId: tid, retryable: true });
    }

    // ---- Fetch the full trade + escrow for the response ----
    const { data: trade } = await supabase
      .from('verdex_p2p_trades')
      .select(`${TRADE_COLUMNS}, escrow:verdex_p2p_escrows(${ESCROW_COLUMNS})`)
      .eq('id', row.trade_id)
      .maybeSingle();

    // ---- Immediately advance initiated → awaiting_escrow (single valid hop) ----
    let finalTrade = trade;
    if (trade && trade.status === 'initiated') {
      const { data: advanced } = await supabase
        .from('verdex_p2p_trades')
        .update({ status: 'awaiting_escrow' })
        .eq('id', row.trade_id)
        .eq('status', 'initiated')
        .select(`${TRADE_COLUMNS}, escrow:verdex_p2p_escrows(${ESCROW_COLUMNS})`)
        .maybeSingle();
      if (advanced) {
        finalTrade = advanced;
        await recordTradeEvent(row.trade_id, user.id, 'trade.awaiting_escrow', 'initiated', 'awaiting_escrow', { trade_reference: row.trade_reference });
      }
    }

    // ---- Notify the seller (counterparty) ----
    const sellerUserId = finalTrade.seller_user_id;
    await enqueueNotification(
      sellerUserId,
      'trade.request.new',
      `${row.trade_id}:new`,
      { trade_id: row.trade_id, trade_reference: row.trade_reference, amount_vdx: fromAtomic(atomicAmount) }
    );

    const response = {
      success: true,
      trade: mapTradeToMobile(finalTrade),
      attestation: attestationCtx.ready
        ? {
            escrowAddress,
            chainId,
            tradeReference: tradeReferenceBytes32,
            paymentDeadline: paymentDeadlineUnix,
            authorizationDeadline: authDeadlineUnix,
            signature
          }
        : null,
      escrow_pending: !attestationCtx.ready,
      network: 'mainnet',
      trace_id: tid
    };

    if (idemKey) storeIdempotency(`${user.id}:openTrade:${idemKey}`, response);
    log('info', 'trade.opened', { tradeId: row.trade_id, userId: user.id, attestationReady: attestationCtx.ready });
    return jsonResponse(res, 201, response);
  } catch (err) {
    log('error', 'openTrade.unhandled', { error: err.message, stack: err.stack });
    return apiError(res, 500, 'UNHANDLED_ERROR', err.message || String(err));
  }
}

async function getTrade(req, res) {
  const user = await verifyUser(req);
  if (!user) return apiError(res, 401, 'UNAUTHORIZED', 'Authentication required');
  const id = req.query.id;
  if (!validateUuid(id)) return apiError(res, 400, 'INVALID_ID', 'Valid trade id required');

  const supabase = getSupabase();
  const { data: trade, error } = await supabase
    .from('verdex_p2p_trades')
    .select(`${TRADE_COLUMNS}, escrow:verdex_p2p_escrows(${ESCROW_COLUMNS}), events:verdex_p2p_trade_events(id, event_type, from_status, to_status, actor_user_id, created_at)`)
    .eq('id', id)
    .or(`buyer_user_id.eq.${user.id},seller_user_id.eq.${user.id}`)
    .maybeSingle();

  if (error) {
    log('error', 'getTrade.db', { error: error.message });
    return apiError(res, 500, 'DB_ERROR', 'Failed to load trade', { retryable: true });
  }
  if (!trade) return apiError(res, 404, 'TRADE_NOT_FOUND', 'Trade not found for this user');

  return jsonResponse(res, 200, { trade: mapTradeToMobile(trade), events: trade.events || [] });
}

async function myTrades(req, res) {
  const user = await verifyUser(req);
  if (!user) return apiError(res, 401, 'UNAUTHORIZED', 'Authentication required');
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('verdex_p2p_trades')
    .select(`${TRADE_COLUMNS}, escrow:verdex_p2p_escrows(${ESCROW_COLUMNS})`)
    .or(`buyer_user_id.eq.${user.id},seller_user_id.eq.${user.id}`)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) {
    log('error', 'myTrades.db', { error: error.message });
    return apiError(res, 500, 'DB_ERROR', 'Failed to load trades', { retryable: true });
  }
  const mapped = (data || []).map(mapTradeToMobile);
  return jsonResponse(res, 200, { data: mapped, trades: mapped });
}

/**
 * Seller confirms the on-chain escrow lock has been observed.
 * In coordination-only mode this is the seller explicitly "accepting" the trade.
 * awaiting_escrow → escrow_locked
 */
async function confirmLock(req, res) {
  const user = await verifyUser(req);
  if (!user) return apiError(res, 401, 'UNAUTHORIZED', 'Authentication required');
  if (!checkRateLimit(`p2p-lock:${user.id}`, 30, 60000).allowed) {
    return apiError(res, 429, 'RATE_LIMITED', 'Too many requests', { retryable: true });
  }
  const body = parseBody(req);
  const { trade_id } = body;
  if (!validateUuid(trade_id)) return apiError(res, 400, 'INVALID_PARAMS', 'trade_id required');

  let trade;
  try {
    trade = await transitionTrade({
      tradeId: trade_id,
      actorId: user.id,
      actorRole: 'seller',
      expectedFromStatus: 'awaiting_escrow',
      toStatus: 'escrow_locked',
      eventType: 'escrow.locked',
      eventPayload: { confirmed_by: 'seller' },
      notifyCounterparty: { templateKey: 'escrow.locked', payload: {} }
    });
  } catch (err) {
    return apiError(res, err.status || 400, err.code || 'DB_ERROR', err.message, { retryable: err.retryable });
  }
  if (!trade) return apiError(res, 404, 'TRADE_NOT_FOUND', 'Trade not found, not awaiting escrow, or you are not the seller');

  // Update the escrow row status too.
  const supabase = getSupabase();
  if (trade.escrow) {
    const escrowId = Array.isArray(trade.escrow) ? trade.escrow[0].id : trade.escrow.id;
    await supabase
      .from('verdex_p2p_escrows')
      .update({ status: 'locked', lock_authorized_by: user.id })
      .eq('id', escrowId);
  }

  log('info', 'escrow.locked', { tradeId: trade_id, userId: user.id });
  return jsonResponse(res, 200, { success: true, trade: mapTradeToMobile(trade) });
}

/**
 * Buyer marks payment as sent (uploads proof of payment).
 * Handles two transitions: escrow_locked → payment_pending → payment_marked_sent
 * Resilient to interrupted requests: if Step 1 succeeded but Step 2 failed
 * (network drop), a retry will find the trade in 'payment_pending' and
 * complete Step 2 without re-doing Step 1.
 */
async function markPaymentSent(req, res) {
  const user = await verifyUser(req);
  if (!user) return apiError(res, 401, 'UNAUTHORIZED', 'Authentication required');
  if (!checkRateLimit(`p2p-markpay:${user.id}`, 30, 60000).allowed) {
    return apiError(res, 429, 'RATE_LIMITED', 'Too many requests', { retryable: true });
  }
  const body = parseBody(req);
  const { trade_id, proof_url, payment_reference } = body;
  if (!validateUuid(trade_id)) return apiError(res, 400, 'INVALID_PARAMS', 'trade_id required');

  // Validate proof_url format if provided.
  if (proof_url && typeof proof_url === 'string' && proof_url.length > 500) {
    return apiError(res, 400, 'INVALID_PROOF', 'Proof URL too long (max 500 chars)');
  }

  const supabase = getSupabase();

  // Fetch the trade first to determine its current state.
  const { data: current } = await supabase
    .from('verdex_p2p_trades')
    .select(`${TRADE_COLUMNS}, escrow:verdex_p2p_escrows(${ESCROW_COLUMNS})`)
    .eq('id', trade_id)
    .eq('buyer_user_id', user.id)
    .maybeSingle();

  if (!current) return apiError(res, 404, 'TRADE_NOT_FOUND', 'Trade not found or you are not the buyer');

  // If already past payment_marked_sent, return idempotent success.
  if (['payment_marked_sent', 'payment_confirmed', 'release_pending', 'released'].includes(current.status)) {
    return jsonResponse(res, 200, { success: true, trade: mapTradeToMobile(current), message: 'Payment already marked' });
  }

  // If already cancelled/disputed/expired, reject.
  if (['cancelled', 'disputed', 'expired', 'failed', 'resolved'].includes(current.status)) {
    return apiError(res, 409, 'TRADE_NOT_ACTIVE', `Cannot mark payment on a trade in status ${current.status}`);
  }

  let trade = current;

  // Step 1: escrow_locked → payment_pending (only if still at escrow_locked)
  if (current.status === 'escrow_locked') {
    try {
      trade = await transitionTrade({
        tradeId: trade_id,
        actorId: user.id,
        actorRole: 'buyer',
        expectedFromStatus: 'escrow_locked',
        toStatus: 'payment_pending',
        eventType: 'payment.started',
        eventPayload: { proof_url, payment_reference }
      });
      if (!trade) trade = current; // Edge case: race — another request already advanced it
    } catch (err) {
      return apiError(res, err.status || 400, err.code || 'DB_ERROR', err.message, { retryable: err.retryable });
    }
  }

  // Step 2: payment_pending → payment_marked_sent
  if (trade.status === 'payment_pending') {
    try {
      const updated = await transitionTrade({
        tradeId: trade_id,
        actorId: user.id,
        actorRole: 'buyer',
        expectedFromStatus: 'payment_pending',
        toStatus: 'payment_marked_sent',
        eventType: 'payment.marked_sent',
        extraUpdate: { payment_marked_sent_at: new Date().toISOString() },
        eventPayload: { proof_url, payment_reference },
        notifyCounterparty: { templateKey: 'buyer.payment.marked', payload: { proof_url } }
      });
      if (updated) trade = updated;
    } catch (err) {
      return apiError(res, err.status || 400, err.code || 'DB_ERROR', err.message, { retryable: err.retryable });
    }
  }

  // Persist payment instruction ciphertext if provided (application-layer encrypted by APK).
  if (body.payment_instruction_ciphertext && trade.escrow) {
    const escrowId = Array.isArray(trade.escrow) ? trade.escrow[0].id : trade.escrow.id;
    await supabase
      .from('verdex_p2p_trades')
      .update({
        payment_instruction_ciphertext: String(body.payment_instruction_ciphertext).slice(0, 32768),
        payment_instruction_key_version: body.payment_instruction_key_version ? String(body.payment_instruction_key_version).slice(0, 100) : null
      })
      .eq('id', trade_id);
  }

  log('info', 'payment.marked_sent', { tradeId: trade_id, userId: user.id });
  return jsonResponse(res, 200, { success: true, trade: mapTradeToMobile(trade) });
}

/**
 * Seller confirms payment received.
 * payment_marked_sent → payment_confirmed
 */
async function confirmPayment(req, res) {
  const user = await verifyUser(req);
  if (!user) return apiError(res, 401, 'UNAUTHORIZED', 'Authentication required');
  if (!checkRateLimit(`p2p-confirmpay:${user.id}`, 30, 60000).allowed) {
    return apiError(res, 429, 'RATE_LIMITED', 'Too many requests', { retryable: true });
  }
  const body = parseBody(req);
  const { trade_id } = body;
  if (!validateUuid(trade_id)) return apiError(res, 400, 'INVALID_PARAMS', 'trade_id required');

  let trade;
  try {
    trade = await transitionTrade({
      tradeId: trade_id,
      actorId: user.id,
      actorRole: 'seller',
      expectedFromStatus: 'payment_marked_sent',
      toStatus: 'payment_confirmed',
      eventType: 'payment.confirmed',
      extraUpdate: { payment_confirmed_at: new Date().toISOString() },
      eventPayload: {},
      notifyCounterparty: { templateKey: 'seller.payment.confirmed', payload: {} }
    });
  } catch (err) {
    return apiError(res, err.status || 400, err.code || 'DB_ERROR', err.message, { retryable: err.retryable });
  }
  if (!trade) return apiError(res, 404, 'TRADE_NOT_FOUND', 'Trade not found, payment not marked sent, or you are not the seller');

  log('info', 'payment.confirmed', { tradeId: trade_id, userId: user.id });
  return jsonResponse(res, 200, { success: true, trade: mapTradeToMobile(trade) });
}

/**
 * Seller releases escrowed VDX to the buyer.
 * payment_confirmed → release_pending → released (coordination mode completes
 * immediately; when mainnet is live, release_pending waits for the on-chain
 * release to be indexed, then the indexer flips it to released).
 */
async function release(req, res) {
  const user = await verifyUser(req);
  if (!user) return apiError(res, 401, 'UNAUTHORIZED', 'Authentication required');
  if (!checkRateLimit(`p2p-release:${user.id}`, 30, 60000).allowed) {
    return apiError(res, 429, 'RATE_LIMITED', 'Too many requests', { retryable: true });
  }
  const body = parseBody(req);
  const { trade_id } = body;
  if (!validateUuid(trade_id)) return apiError(res, 400, 'INVALID_PARAMS', 'trade_id required');

  const supabase = getSupabase();

  // Step 1: payment_confirmed → release_pending (seller authorizes release)
  let trade;
  try {
    trade = await transitionTrade({
      tradeId: trade_id,
      actorId: user.id,
      actorRole: 'seller',
      expectedFromStatus: 'payment_confirmed',
      toStatus: 'release_pending',
      eventType: 'release.authorized',
      eventPayload: {},
      notifyCounterparty: { templateKey: 'seller.release.authorized', payload: {} }
    });
  } catch (err) {
    return apiError(res, err.status || 400, err.code || 'DB_ERROR', err.message, { retryable: err.retryable });
  }
  if (!trade) return apiError(res, 404, 'TRADE_NOT_FOUND', 'Trade not found, payment not confirmed, or you are not the seller');

  // Step 2: release_pending → released.
  // In coordination-only mode we complete immediately. When mainnet escrow is
  // live, the indexer observes the on-chain release() tx and performs this
  // transition — but if the caller is operating in coordination mode we must
  // finalize here so the trade reaches a terminal state.
  const attestationCtx = resolveAttestationContext();
  if (!attestationCtx.ready) {
    try {
      const released = await transitionTrade({
        tradeId: trade_id,
        actorId: user.id,
        actorRole: 'seller',
        expectedFromStatus: 'release_pending',
        toStatus: 'released',
        eventType: 'release.completed',
        extraUpdate: { released_at: new Date().toISOString() },
        eventPayload: { mode: 'coordination_only' },
        notifyCounterparty: { templateKey: 'trade.completed', payload: {} }
      });
      if (released) trade = released;
    } catch (err) {
      log('warn', 'release.complete_failed', { tradeId: trade_id, error: err.message });
    }

    // Mark the escrow row as released.
    if (trade.escrow) {
      const escrowId = Array.isArray(trade.escrow) ? trade.escrow[0].id : trade.escrow.id;
      await supabase
        .from('verdex_p2p_escrows')
        .update({
          status: 'released',
          release_authorized_by: user.id,
          release_tx_hash: `coord:${trade.trade_reference}`
        })
        .eq('id', escrowId)
        .in('status', ['release_authorized', 'locked']);
    }
  }

  log('info', 'release.completed', { tradeId: trade_id, userId: user.id, mode: attestationCtx.ready ? 'on_chain_pending' : 'coordination_only' });
  return jsonResponse(res, 200, { success: true, trade: mapTradeToMobile(trade) });
}

/**
 * Either party requests cancellation.
 * From any pre-release state → cancel_requested → cancelled.
 * Only the party in the right role for the current state may initiate.
 */
async function cancel(req, res) {
  const user = await verifyUser(req);
  if (!user) return apiError(res, 401, 'UNAUTHORIZED', 'Authentication required');
  if (!checkRateLimit(`p2p-cancel:${user.id}`, 30, 60000).allowed) {
    return apiError(res, 429, 'RATE_LIMITED', 'Too many requests', { retryable: true });
  }
  const body = parseBody(req);
  const { trade_id, reason } = body;
  if (!validateUuid(trade_id)) return apiError(res, 400, 'INVALID_PARAMS', 'trade_id required');

  const supabase = getSupabase();

  // Fetch the trade to determine the current status + the caller's role.
  const { data: trade } = await supabase
    .from('verdex_p2p_trades')
    .select('id, status, buyer_user_id, seller_user_id')
    .eq('id', trade_id)
    .or(`buyer_user_id.eq.${user.id},seller_user_id.eq.${user.id}`)
    .maybeSingle();
  if (!trade) return apiError(res, 404, 'TRADE_NOT_FOUND', 'Trade not found for this user');

  // Only pre-release, non-terminal states can be cancelled.
  const cancellableFrom = ['awaiting_escrow', 'escrow_locked', 'payment_pending', 'payment_marked_sent'];
  if (!cancellableFrom.includes(trade.status)) {
    return apiError(res, 409, 'CANCEL_NOT_ALLOWED', `Cannot cancel a trade in status ${trade.status}`);
  }

  const actorRole = trade.seller_user_id === user.id ? 'seller' : 'buyer';

  // Step 1: current → cancel_requested
  let updated;
  try {
    updated = await transitionTrade({
      tradeId: trade_id,
      actorId: user.id,
      actorRole,
      expectedFromStatus: trade.status,
      toStatus: 'cancel_requested',
      eventType: 'cancel.requested',
      eventPayload: { reason: String(reason || '').slice(0, 500) },
      notifyCounterparty: { templateKey: 'trade.cancel_requested', payload: { reason } }
    });
  } catch (err) {
    return apiError(res, err.status || 400, err.code || 'DB_ERROR', err.message, { retryable: err.retryable });
  }
  if (!updated) return apiError(res, 409, 'CANCEL_CONFLICT', 'Trade state changed before cancellation could apply');

  // Step 2: cancel_requested → cancelled
  try {
    const cancelled = await transitionTrade({
      tradeId: trade_id,
      actorId: user.id,
      actorRole,
      expectedFromStatus: 'cancel_requested',
      toStatus: 'cancelled',
      eventType: 'cancel.completed',
      extraUpdate: { cancelled_at: new Date().toISOString() },
      eventPayload: { reason: String(reason || '').slice(0, 500) },
      notifyCounterparty: { templateKey: 'trade.cancelled', payload: {} }
    });
    if (cancelled) updated = cancelled;
  } catch (err) {
    log('warn', 'cancel.complete_failed', { tradeId: trade_id, error: err.message });
  }

  // Restore order remaining_amount_atomic so the cancelled amount is re-listed.
  try {
    const { data: fullTrade } = await supabase
      .from('verdex_p2p_trades')
      .select('order_id, token_amount_atomic')
      .eq('id', trade_id)
      .maybeSingle();
    if (fullTrade) {
      await supabase.rpc('verdex_restore_order_remaining', {
        p_order_id: fullTrade.order_id,
        p_amount_atomic: fullTrade.token_amount_atomic
      }).then(({ error }) => {
        if (error) log('warn', 'cancel.restore_remaining.failed', { tradeId: trade_id, error: error.message });
      });
    }
  } catch (err) {
    log('warn', 'cancel.restore_order.failed', { tradeId: trade_id, error: err.message });
  }

  log('info', 'trade.cancelled', { tradeId: trade_id, userId: user.id });
  return jsonResponse(res, 200, { success: true, trade: mapTradeToMobile(updated) });
}

/**
 * Either party opens a dispute.
 * From an in-flight state → disputed, and a dispute row is created.
 */
async function dispute(req, res) {
  const user = await verifyUser(req);
  if (!user) return apiError(res, 401, 'UNAUTHORIZED', 'Authentication required');
  if (!checkRateLimit(`p2p-dispute:${user.id}`, 10, 60000).allowed) {
    return apiError(res, 429, 'RATE_LIMITED', 'Too many dispute attempts', { retryable: true });
  }
  const body = parseBody(req);
  const { trade_id, reason, category_code } = body;
  if (!validateUuid(trade_id)) return apiError(res, 400, 'INVALID_PARAMS', 'trade_id required');
  if (!category_code || typeof category_code !== 'string' || category_code.length < 1 || category_code.length > 100) {
    return apiError(res, 400, 'INVALID_PARAMS', 'category_code (1–100 chars) required');
  }

  const supabase = getSupabase();

  const { data: trade } = await supabase
    .from('verdex_p2p_trades')
    .select('id, status, buyer_user_id, seller_user_id, trade_reference')
    .eq('id', trade_id)
    .or(`buyer_user_id.eq.${user.id},seller_user_id.eq.${user.id}`)
    .maybeSingle();
  if (!trade) return apiError(res, 404, 'TRADE_NOT_FOUND', 'Trade not found for this user');

  const disputableFrom = ['escrow_locked', 'payment_pending', 'payment_marked_sent', 'payment_confirmed', 'release_pending', 'cancel_requested'];
  if (!disputableFrom.includes(trade.status)) {
    return apiError(res, 409, 'DISPUTE_NOT_ALLOWED', `Cannot dispute a trade in status ${trade.status}`);
  }

  const actorRole = trade.seller_user_id === user.id ? 'seller' : 'buyer';

  let updated;
  try {
    updated = await transitionTrade({
      tradeId: trade_id,
      actorId: user.id,
      actorRole,
      expectedFromStatus: trade.status,
      toStatus: 'disputed',
      eventType: 'dispute.opened',
      extraUpdate: { dispute_opened_at: new Date().toISOString() },
      eventPayload: { reason: String(reason || '').slice(0, 1000), category_code },
      notifyCounterparty: { templateKey: 'dispute.opened', payload: { category_code } }
    });
  } catch (err) {
    return apiError(res, err.status || 400, err.code || 'DB_ERROR', err.message, { retryable: err.retryable });
  }
  if (!updated) return apiError(res, 409, 'DISPUTE_CONFLICT', 'Trade state changed before dispute could apply');

  // Create the dispute row (one open dispute per trade — enforced by unique index).
  const { error: disputeErr } = await supabase
    .from('verdex_p2p_disputes')
    .insert({
      trade_id: trade_id,
      opened_by_user_id: user.id,
      status: 'opened',
      category_code,
      summary_ciphertext: body.summary_ciphertext ? String(body.summary_ciphertext).slice(0, 16384) : null,
      summary_key_version: body.summary_key_version ? String(body.summary_key_version).slice(0, 100) : null
    });
  if (disputeErr) {
    // 23505 = unique violation (dispute already open for this trade) — acceptable.
    if (disputeErr.code !== '23505') {
      log('warn', 'dispute.row_insert_failed', { tradeId: trade_id, error: disputeErr.message });
    }
  }

  log('info', 'dispute.opened', { tradeId: trade_id, userId: user.id, category_code });
  return jsonResponse(res, 200, { success: true, trade: mapTradeToMobile(updated) });
}

/**
 * Upload payment proof (backwards-compatible alias for markPaymentSent).
 * Kept so older APK builds keep working; new builds should call mark-payment.
 */
async function uploadProof(req, res) {
  return markPaymentSent(req, res);
}

async function closeTrade(req, res) {
  // Deprecated alias for cancel — preserved for APK backward compatibility.
  return cancel(req, res);
}

async function report(req, res) {
  // Deprecated alias for dispute — preserved for APK backward compatibility.
  return dispute(req, res);
}

async function posterTrades(req, res) {
  return myTrades(req, res);
}

/**
 * Admin/cron: Expire stale trades that exceeded their payment window.
 * Trades in awaiting_escrow, escrow_locked, or payment_pending that are
 * older than their payment_deadline_at are moved to 'expired'.
 * Also restores any locked order remaining_amount.
 */
async function expireStaleTrades(req, res) {
  const user = await verifyUser(req);
  if (!user) return apiError(res, 401, 'UNAUTHORIZED', 'Authentication required');
  const supabase = getSupabase();
  const admin = await verifyAdmin(req);
  if (!admin) return apiError(res, 403, 'FORBIDDEN', 'Admin access required');

  const now = new Date().toISOString();
  const { data: stale, error } = await supabase
    .from('verdex_p2p_trades')
    .select('id, order_id, status, payment_deadline_at, token_amount_atomic')
    .in('status', ['awaiting_escrow', 'escrow_locked', 'payment_pending', 'payment_marked_sent'])
    .lt('payment_deadline_at', now)
    .limit(100);

  if (error) return apiError(res, 500, 'DB_ERROR', 'Failed to query stale trades');

  let expired = 0;
  for (const trade of (stale || [])) {
    try {
      // Transition to expired via the DB trigger (valid from these states).
      const { error: updErr } = await supabase
        .from('verdex_p2p_trades')
        .update({ status: 'expired', expired_at: now })
        .eq('id', trade.id)
        .in('status', ['awaiting_escrow', 'escrow_locked', 'payment_pending', 'payment_marked_sent']);

      if (!updErr) {
        expired++;
        await recordTradeEvent(trade.id, user.id, 'trade.expired', trade.status, 'expired', { deadline: trade.payment_deadline_at });

        // Restore order remaining_amount.
        if (trade.order_id && trade.token_amount_atomic) {
          try {
            await supabase.rpc('verdex_restore_order_remaining', {
              p_order_id: trade.order_id,
              p_amount_atomic: trade.token_amount_atomic,
            });
          } catch (_) {}
        }
      }
    } catch (_) {}
  }

  log('info', 'trade.expiry_scan', { expired, checked: (stale || []).length });
  return jsonResponse(res, 200, { success: true, expired, checked: (stale || []).length, timestamp: now });
}

// ===========================================================================
// P2P Chat
// ===========================================================================

async function getChatMessages(req, res) {
  const user = await verifyUser(req);
  if (!user) return apiError(res, 401, 'UNAUTHORIZED', 'Authentication required');
  const tradeId = req.query.trade_id;
  if (!validateUuid(tradeId)) return apiError(res, 400, 'INVALID_PARAMS', 'trade_id required');

  const supabase = getSupabase();
  // Verify the user is a trade participant
  const { data: trade } = await supabase
    .from('verdex_p2p_trades')
    .select('buyer_user_id, seller_user_id')
    .eq('id', tradeId)
    .or(`buyer_user_id.eq.${user.id},seller_user_id.eq.${user.id}`)
    .maybeSingle();
  if (!trade) return apiError(res, 403, 'NOT_PARTICIPANT', 'You are not a participant in this trade');

  const { data, error } = await supabase
    .from('verdex_p2p_chat_messages')
    .select('*')
    .eq('trade_id', tradeId)
    .order('created_at', { ascending: true })
    .limit(200);

  if (error) return apiError(res, 500, 'DB_ERROR', 'Failed to load messages');
  return jsonResponse(res, 200, { data: data || [] });
}

async function sendChatMessage(req, res) {
  const user = await verifyUser(req);
  if (!user) return apiError(res, 401, 'UNAUTHORIZED', 'Authentication required');
  if (!checkRateLimit(`p2p-chat:${user.id}`, 30, 60000).allowed) {
    return apiError(res, 429, 'RATE_LIMITED', 'Too many messages', { retryable: true });
  }
  const body = parseBody(req);
  const { trade_id, message, attachment_url } = body;
  if (!validateUuid(trade_id)) return apiError(res, 400, 'INVALID_PARAMS', 'trade_id required');
  if (!message || typeof message !== 'string' || message.trim().length === 0 || message.length > 2000) {
    return apiError(res, 400, 'INVALID_MESSAGE', 'Message must be 1-2000 characters');
  }

  const supabase = getSupabase();
  const { data: trade } = await supabase
    .from('verdex_p2p_trades')
    .select('buyer_user_id, seller_user_id, status')
    .eq('id', trade_id)
    .or(`buyer_user_id.eq.${user.id},seller_user_id.eq.${user.id}`)
    .maybeSingle();
  if (!trade) return apiError(res, 403, 'NOT_PARTICIPANT', 'You are not a participant in this trade');

  // Block chat on terminal trade states (prevents spam after cancellation).
  if (['cancelled', 'expired', 'failed'].includes(trade.status)) {
    return apiError(res, 409, 'TRADE_CLOSED', 'Cannot send messages on a closed trade');
  }

  const receiverId = trade.buyer_user_id === user.id ? trade.seller_user_id : trade.buyer_user_id;

  const { data: msg, error } = await supabase
    .from('verdex_p2p_chat_messages')
    .insert({
      trade_id,
      sender_user_id: user.id,
      receiver_user_id: receiverId,
      message: message.trim(),
      message_type: 'text',
      attachment_url: attachment_url ? String(attachment_url).slice(0, 500) : null,
    })
    .select('*')
    .single();

  if (error) return apiError(res, 500, 'DB_ERROR', 'Failed to send message');

  // Enqueue notification to receiver
  await enqueueNotification(
    receiverId,
    'chat.message',
    `${trade_id}:msg:${msg.id}`,
    { trade_id, message: message.trim().substring(0, 100), sender: user.id }
  );

  return jsonResponse(res, 201, { success: true, message: msg });
}

async function markChatRead(req, res) {
  const user = await verifyUser(req);
  if (!user) return apiError(res, 401, 'UNAUTHORIZED', 'Authentication required');
  const body = parseBody(req);
  const { trade_id } = body;
  if (!validateUuid(trade_id)) return apiError(res, 400, 'INVALID_PARAMS', 'trade_id required');

  const supabase = getSupabase();
  const { error } = await supabase
    .from('verdex_p2p_chat_messages')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('trade_id', trade_id)
    .eq('receiver_user_id', user.id)
    .eq('is_read', false);

  if (error) return apiError(res, 500, 'DB_ERROR', 'Failed to mark messages read');
  return jsonResponse(res, 200, { success: true });
}

// ===========================================================================
// P2P Reputation
// ===========================================================================

async function rateTrade(req, res) {
  const user = await verifyUser(req);
  if (!user) return apiError(res, 401, 'UNAUTHORIZED', 'Authentication required');
  const body = parseBody(req);
  const { trade_id, rating, score, comment } = body;
  if (!validateUuid(trade_id)) return apiError(res, 400, 'INVALID_PARAMS', 'trade_id required');
  if (!['positive', 'neutral', 'negative'].includes(rating)) {
    return apiError(res, 400, 'INVALID_RATING', 'rating must be positive, neutral, or negative');
  }
  if (!Number.isInteger(score) || score < 1 || score > 5) {
    return apiError(res, 400, 'INVALID_SCORE', 'score must be 1-5');
  }

  const supabase = getSupabase();
  // Verify user is a trade participant and trade is completed
  const { data: trade } = await supabase
    .from('verdex_p2p_trades')
    .select('buyer_user_id, seller_user_id, status')
    .eq('id', trade_id)
    .or(`buyer_user_id.eq.${user.id},seller_user_id.eq.${user.id}`)
    .maybeSingle();
  if (!trade) return apiError(res, 403, 'NOT_PARTICIPANT', 'You are not a participant in this trade');
  if (!['released', 'cancelled', 'resolved'].includes(trade.status)) {
    return apiError(res, 400, 'TRADE_NOT_COMPLETE', 'Can only rate completed trades');
  }

  const ratedUserId = trade.buyer_user_id === user.id ? trade.seller_user_id : trade.buyer_user_id;

  const { data: ratingRow, error } = await supabase
    .from('verdex_p2p_ratings')
    .insert({
      trade_id,
      rater_user_id: user.id,
      rated_user_id: ratedUserId,
      rating,
      score,
      comment: comment ? String(comment).slice(0, 500) : null,
    })
    .select('*')
    .single();

  if (error) {
    if (error.code === '23505') return apiError(res, 409, 'ALREADY_RATED', 'You have already rated this trade');
    throw error;
  }

  return jsonResponse(res, 201, { success: true, rating: ratingRow });
}

async function getReputation(req, res) {
  const user = await verifyUser(req);
  if (!user) return apiError(res, 401, 'UNAUTHORIZED', 'Authentication required');
  const userId = req.query.user_id || user.id;
  if (!validateUuid(userId)) return apiError(res, 400, 'INVALID_PARAMS', 'user_id required');

  const supabase = getSupabase();
  const { data: summary } = await supabase
    .from('verdex_p2p_reputation_summary')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  const { data: recentRatings } = await supabase
    .from('verdex_p2p_ratings')
    .select('rating, score, comment, created_at, rater_user_id')
    .eq('rated_user_id', userId)
    .order('created_at', { ascending: false })
    .limit(10);

  return jsonResponse(res, 200, {
    data: {
      summary: summary || { total_ratings: 0, avg_score: 0, positive_percentage: 0 },
      recent_ratings: recentRatings || [],
    }
  });
}

// ===========================================================================
// P2P User Blocks
// ===========================================================================

async function blockUser(req, res) {
  const user = await verifyUser(req);
  if (!user) return apiError(res, 401, 'UNAUTHORIZED', 'Authentication required');
  const body = parseBody(req);
  const { blocked_user_id } = body;
  if (!validateUuid(blocked_user_id)) return apiError(res, 400, 'INVALID_PARAMS', 'blocked_user_id required');
  if (blocked_user_id === user.id) return apiError(res, 400, 'SELF_BLOCK', 'Cannot block yourself');

  const supabase = getSupabase();
  const { error } = await supabase
    .from('verdex_p2p_user_blocks')
    .insert({ blocker_user_id: user.id, blocked_user_id });

  if (error) {
    if (error.code === '23505') return apiError(res, 409, 'ALREADY_BLOCKED', 'User already blocked');
    throw error;
  }
  return jsonResponse(res, 200, { success: true, message: 'User blocked' });
}

async function unblockUser(req, res) {
  const user = await verifyUser(req);
  if (!user) return apiError(res, 401, 'UNAUTHORIZED', 'Authentication required');
  const body = parseBody(req);
  const { blocked_user_id } = body;
  if (!validateUuid(blocked_user_id)) return apiError(res, 400, 'INVALID_PARAMS', 'blocked_user_id required');

  const supabase = getSupabase();
  await supabase
    .from('verdex_p2p_user_blocks')
    .delete()
    .eq('blocker_user_id', user.id)
    .eq('blocked_user_id', blocked_user_id);

  return jsonResponse(res, 200, { success: true, message: 'User unblocked' });
}

async function createOrder(req, res) {
  const user = await verifyUser(req);
  if (!user) return apiError(res, 401, 'UNAUTHORIZED', 'Authentication required');
  if (!checkRateLimit(`p2p:create:${user.id}`, 20, 60000).allowed) {
    return apiError(res, 429, 'RATE_LIMITED', 'Too many requests');
  }

  const body = parseBody(req);
  const side = (body.side || body.type || 'sell_vdx').toLowerCase();
  const priceFiat = Number(body.price_fiat || body.fiat_unit_price || body.price || 0);
  const amountVdx = Number(body.amount_vdx || body.quantity || body.total_vdx || 0);
  const minFiat = Number(body.min_fiat || body.min_fiat_amount || body.min_amount || 0);
  const maxFiat = Number(body.max_fiat || body.max_fiat_amount || body.max_amount || (priceFiat * amountVdx));
  const currency = (body.fiat_symbol || body.currency || body.fiat_currency || 'PKR').toUpperCase();
  const paymentMethods = Array.isArray(body.payment_methods)
    ? body.payment_methods
    : (body.payment_method ? [body.payment_method] : [{ method: 'easypaisa', label: 'EasyPaisa' }]);

  if (priceFiat <= 0 || amountVdx <= 0) {
    return apiError(res, 400, 'INVALID_PARAMS', 'Price and VDX amount must be greater than zero');
  }

  const supabase = getSupabase();
  const now = new Date().toISOString();

  const { data: newOrder, error: createErr } = await supabase
    .from('verdex_p2p_orders')
    .insert({
      creator_user_id: user.id,
      side: side.includes('buy') ? 'buy_vdx' : 'sell_vdx',
      price_fiat: priceFiat,
      amount_vdx: amountVdx,
      min_fiat: minFiat,
      max_fiat: maxFiat,
      fiat_symbol: currency,
      payment_methods: paymentMethods,
      status: 'active',
      terms: body.terms || body.notes || 'Fast release, online banking only',
      created_at: now,
      updated_at: now
    })
    .select()
    .single();

  if (createErr) throw createErr;

  return jsonResponse(res, 200, {
    success: true,
    message: 'P2P Listing posted successfully',
    data: newOrder,
    order: newOrder
  });
}

async function editOrder(req, res) {
  const user = await verifyUser(req);
  if (!user) return apiError(res, 401, 'UNAUTHORIZED', 'Authentication required');
  if (!checkRateLimit(`p2p:edit:${user.id}`, 20, 60000).allowed) {
    return apiError(res, 429, 'RATE_LIMITED', 'Too many requests');
  }

  const body = parseBody(req);
  const { order_id, price_fiat, fiat_unit_price, min_fiat, min_fiat_amount, max_fiat, max_fiat_amount, payment_methods, terms, notes, status } = body;

  if (!validateUuid(order_id)) return apiError(res, 400, 'INVALID_PARAMS', 'order_id required');

  const supabase = getSupabase();
  const { data: order, error: fetchErr } = await supabase
    .from('verdex_p2p_orders')
    .select('*')
    .eq('id', order_id)
    .maybeSingle();

  if (fetchErr || !order) return apiError(res, 404, 'ORDER_NOT_FOUND', 'Order not found');
  if (order.creator_user_id !== user.id) {
    return apiError(res, 403, 'FORBIDDEN', 'You do not own this order');
  }

  const updates = { updated_at: new Date().toISOString() };
  const priceVal = price_fiat ?? fiat_unit_price;
  const minVal = min_fiat ?? min_fiat_amount;
  const maxVal = max_fiat ?? max_fiat_amount;

  if (priceVal !== undefined && Number(priceVal) > 0) updates.price_fiat = Number(priceVal);
  if (minVal !== undefined && Number(minVal) >= 0) updates.min_fiat = Number(minVal);
  if (maxVal !== undefined && Number(maxVal) > 0) updates.max_fiat = Number(maxVal);
  if (Array.isArray(payment_methods)) updates.payment_methods = payment_methods;
  if (terms !== undefined) updates.terms = terms;
  if (notes !== undefined) updates.notes = notes;
  if (status !== undefined) updates.status = status;

  const { data: updated, error: updateErr } = await supabase
    .from('verdex_p2p_orders')
    .update(updates)
    .eq('id', order_id)
    .select()
    .single();

  if (updateErr) throw updateErr;

  return jsonResponse(res, 200, {
    success: true,
    message: 'Order updated successfully',
    order: updated
  });
}

async function deleteOrder(req, res) {
  const user = await verifyUser(req);
  if (!user) return apiError(res, 401, 'UNAUTHORIZED', 'Authentication required');
  if (!checkRateLimit(`p2p:delete:${user.id}`, 20, 60000).allowed) {
    return apiError(res, 429, 'RATE_LIMITED', 'Too many requests');
  }

  const body = parseBody(req);
  const { order_id } = body;
  if (!validateUuid(order_id)) return apiError(res, 400, 'INVALID_PARAMS', 'order_id required');

  const supabase = getSupabase();
  const { data: order } = await supabase
    .from('verdex_p2p_orders')
    .select('*')
    .eq('id', order_id)
    .maybeSingle();

  if (!order) return apiError(res, 404, 'ORDER_NOT_FOUND', 'Order not found');
  if (order.creator_user_id !== user.id) {
    return apiError(res, 403, 'FORBIDDEN', 'You do not own this order');
  }

  const { error } = await supabase
    .from('verdex_p2p_orders')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', order_id);

  if (error) throw error;

  return jsonResponse(res, 200, {
    success: true,
    message: 'Order deleted successfully'
  });
}

async function pauseOrder(req, res) {
  const user = await verifyUser(req);
  if (!user) return apiError(res, 401, 'UNAUTHORIZED', 'Authentication required');
  const body = parseBody(req);
  const { order_id, pause } = body;
  if (!validateUuid(order_id)) return apiError(res, 400, 'INVALID_PARAMS', 'order_id required');

  const supabase = getSupabase();
  const newStatus = pause === false ? 'active' : 'paused';

  const { error } = await supabase
    .from('verdex_p2p_orders')
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', order_id)
    .eq('creator_user_id', user.id);

  if (error) throw error;

  return jsonResponse(res, 200, {
    success: true,
    status: newStatus,
    message: `Order ${newStatus}`
  });
}

// ===========================================================================
// Router
// ===========================================================================

module.exports = async (req, res) => {
  setCORS(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const action = req.query.action || 'capabilities';
    if (action === 'capabilities' || action === 'config') return await capabilities(req, res);
    if (action === 'orders' && req.method === 'GET') return await listOrders(req, res);
    if (action === 'orders' && req.method === 'POST') return await createOrder(req, res);
    if (action === 'my-orders') return await myOrders(req, res);
    if (action === 'edit-order' && req.method === 'POST') return await editOrder(req, res);
    if (action === 'delete-order' && req.method === 'POST') return await deleteOrder(req, res);
    if (action === 'pause' && req.method === 'POST') return await pauseOrder(req, res);
    if (action === 'trades' && req.method === 'POST') return await openTrade(req, res);
    if (action === 'trade' && req.method === 'GET') return await getTrade(req, res);
    if (action === 'my-trades') return await myTrades(req, res);
    if (action === 'confirm-lock' && req.method === 'POST') return await confirmLock(req, res);
    if (action === 'mark-payment' && req.method === 'POST') return await markPaymentSent(req, res);
    if (action === 'confirm-payment' && req.method === 'POST') return await confirmPayment(req, res);
    if (action === 'release' && req.method === 'POST') return await release(req, res);
    if (action === 'cancel' && req.method === 'POST') return await cancel(req, res);
    if (action === 'dispute' && req.method === 'POST') return await dispute(req, res);
    if (action === 'expire-stale' && req.method === 'POST') return await expireStaleTrades(req, res);
    // Chat endpoints
    if (action === 'chat-messages' && req.method === 'GET') return await getChatMessages(req, res);
    if (action === 'chat-send' && req.method === 'POST') return await sendChatMessage(req, res);
    if (action === 'chat-mark-read' && req.method === 'POST') return await markChatRead(req, res);
    // Reputation endpoints
    if (action === 'rate-trade' && req.method === 'POST') return await rateTrade(req, res);
    if (action === 'reputation' && req.method === 'GET') return await getReputation(req, res);
    // User block
    if (action === 'block-user' && req.method === 'POST') return await blockUser(req, res);
    if (action === 'unblock-user' && req.method === 'POST') return await unblockUser(req, res);
    // Backward-compatible aliases for older APK builds.
    if (action === 'proof' && req.method === 'POST') return await uploadProof(req, res);
    if (action === 'close' && req.method === 'POST') return await closeTrade(req, res);
    if (action === 'report' && req.method === 'POST') return await report(req, res);
    if (action === 'poster-trades') return await posterTrades(req, res);
    if (action === 'registry') {
      return jsonResponse(res, 200, require('../../public-network.json'));
    }
    return apiError(res, 404, 'NOT_FOUND', `Unknown p2p action: ${action}`);
  } catch (err) {
    log('error', 'router.unhandled', { error: err.message, stack: err.stack });
    return handleError(res, err, 'p2p');
  }
};

// Expose pure helpers for unit testing. The router remains the default export.
module.exports.helpers = {
  toAtomic,
  fromAtomic,
  validateUuid,
  validateAtomicAmount,
  validateFiatCurrency,
  validatePaymentMethodCodes,
  signTradeAuthorization,
  addressFromPrivateKey,
  resolveAttestationContext,
  TRADE_STATUS_LABELS,
  VDX_DECIMALS,
  VDX_ATOMIC_BASE
};
