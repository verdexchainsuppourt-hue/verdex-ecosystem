-- ============================================================================
-- Verdex P2P: attestation persistence + atomic trade opening
--
-- Depends on:
--   20260718113000_p2p_kyc_aml_rbac_foundation.sql
--   20260718140000_kyc_identity_profiles_and_chain.sql
--
-- Root-cause fix for the "null initiated" APK bug: the EIP-712 attestation
-- (tradeReference, signature, authorizationDeadline, attestor address) was
-- returned in the HTTP response but never persisted, so a subsequent
-- `myTrades` fetch returned NULL attestation fields alongside status
-- 'initiated'.  This migration stores those fields on the escrow row (the
-- correct home — they describe the on-chain settlement intent) and adds a
-- single atomic RPC that opens a trade without the read-then-write race that
-- previously allowed over-allocation of `remaining_amount_atomic`.
--
-- The migration is purely additive: no existing column is dropped, no data
-- is rewritten, and every new column is nullable so pre-existing escrow rows
-- remain valid.  All writes remain server-side (service_role) only.
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Helper function defined FIRST so the CHECK constraint below can call it.
-- A valid EVM address is 0x + 40 hex chars. IMMUTABLE + PARALLEL SAFE so it
-- can be used in CHECK constraints and indexes.
CREATE OR REPLACE FUNCTION public.attestation_address_valid(p_address TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT p_address IS NOT NULL
     AND p_address ~ '^0x[a-fA-F0-9]{40}$'
$$;

-- ---------------------------------------------------------------------------
-- Attestation persistence columns on the escrow row.
-- These mirror the EIP-712 TradeAuthorization the off-chain attestor signed.
-- They are NULL when the trade is opened in coordination-only mode (mainnet
-- escrow not yet verified); they are populated only when a real attestor
-- signature was produced.
-- ---------------------------------------------------------------------------
ALTER TABLE public.verdex_p2p_escrows
  ADD COLUMN IF NOT EXISTS attestor_address TEXT
    CHECK (attestor_address IS NULL OR public.attestation_address_valid(attestor_address)),
  ADD COLUMN IF NOT EXISTS attestation_signature TEXT
    CHECK (attestation_signature IS NULL OR attestation_signature ~ '^0x[0-9a-f]{130}$'),
  ADD COLUMN IF NOT EXISTS authorization_deadline_unix BIGINT
    CHECK (authorization_deadline_unix IS NULL OR authorization_deadline_unix > 0),
  ADD COLUMN IF NOT EXISTS payment_deadline_unix BIGINT
    CHECK (payment_deadline_unix IS NULL OR payment_deadline_unix > 0),
  ADD COLUMN IF NOT EXISTS trade_authorization_consumed BOOLEAN NOT NULL DEFAULT FALSE;

-- Attestation consistency: either all three fields are populated (real
-- on-chain flow) or all three are NULL (coordination-only mode).  Prevents
-- a half-signed escrow row from reaching the indexer.
ALTER TABLE public.verdex_p2p_escrows
  DROP CONSTRAINT IF EXISTS verdex_p2p_escrows_attestation_consistency_check;
ALTER TABLE public.verdex_p2p_escrows
  ADD CONSTRAINT verdex_p2p_escrows_attestation_consistency_check CHECK (
    (attestor_address IS NULL AND attestation_signature IS NULL AND authorization_deadline_unix IS NULL)
    OR
    (attestor_address IS NOT NULL AND attestation_signature IS NOT NULL AND authorization_deadline_unix IS NOT NULL)
  );

-- Index for the indexer/finality worker: find escrows awaiting on-chain lock.
CREATE INDEX IF NOT EXISTS verdex_p2p_escrows_awaiting_lock_idx
  ON public.verdex_p2p_escrows (status, created_at)
  WHERE status = 'awaiting_deposit'
    AND attestation_signature IS NOT NULL
    AND trade_authorization_consumed = FALSE;

-- Index for the attestation replay guard lookup.
CREATE INDEX IF NOT EXISTS verdex_p2p_escrows_trade_ref_bytes_idx
  ON public.verdex_p2p_escrows (trade_reference_bytes32)
  WHERE trade_reference_bytes32 IS NOT NULL;


-- ---------------------------------------------------------------------------
-- Atomic trade opening RPC.
--
-- Replaces the previous read-then-write sequence in the API handler that held
-- a TOCTOU race between `SELECT order` and `INSERT trade`: two concurrent
-- requests could both observe the same `remaining_amount_atomic` and both
-- insert trades, over-allocating the order.  This function serializes on the
-- order row with `FOR UPDATE`, validates every invariant, decrements the
-- remaining amount, inserts the trade, the escrow row, and the first trade
-- event in a single transaction.  Any failure rolls the whole thing back.
--
-- Returns the new trade id, trade_reference, escrow id and escrow_reference
-- so the caller can return a fully-populated response to the APK on the first
-- request — eliminating the "null" fields the APK previously saw.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.verdex_p2p_open_trade(
  p_taker_user_id      UUID,
  p_order_id           UUID,
  p_token_amount_atomic NUMERIC(78,0),
  p_fiat_amount        NUMERIC(30,8),
  p_payment_method_code TEXT,
  p_payment_deadline_at TIMESTAMPTZ,
  p_trade_reference_bytes32 TEXT,
  p_attestor_address   TEXT DEFAULT NULL,
  p_attestation_signature  TEXT DEFAULT NULL,
  p_authorization_deadline_unix BIGINT DEFAULT NULL,
  p_payment_deadline_unix BIGINT DEFAULT NULL,
  p_chain_id           BIGINT DEFAULT NULL,
  p_contract_address   TEXT DEFAULT NULL
)
RETURNS TABLE(
  trade_id UUID,
  trade_reference TEXT,
  escrow_id UUID,
  escrow_reference TEXT,
  order_remaining_atomic NUMERIC(78,0),
  order_status public.verdex_p2p_order_status
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions, public
AS $$
DECLARE
  v_order              public.verdex_p2p_orders%ROWTYPE;
  v_buyer_user_id      UUID;
  v_seller_user_id     UUID;
  v_trade_id           UUID;
  v_trade_ref          TEXT;
  v_escrow_id          UUID;
  v_escrow_ref         TEXT;
  v_new_remaining      NUMERIC(78,0);
  v_new_order_status   public.verdex_p2p_order_status;
BEGIN
  IF p_taker_user_id IS NULL THEN
    RAISE EXCEPTION 'taker_user_id is required' USING ERRCODE = '23502';
  END IF;
  IF p_order_id IS NULL THEN
    RAISE EXCEPTION 'order_id is required' USING ERRCODE = '23502';
  END IF;
  IF p_token_amount_atomic IS NULL OR p_token_amount_atomic <= 0 THEN
    RAISE EXCEPTION 'token_amount_atomic must be positive' USING ERRCODE = '23514';
  END IF;
  IF p_fiat_amount IS NULL OR p_fiat_amount <= 0 THEN
    RAISE EXCEPTION 'fiat_amount must be positive' USING ERRCODE = '23514';
  END IF;
  IF p_payment_method_code IS NULL OR char_length(p_payment_method_code) NOT BETWEEN 1 AND 80 THEN
    RAISE EXCEPTION 'payment_method_code must be 1..80 chars' USING ERRCODE = '23514';
  END IF;
  IF p_trade_reference_bytes32 IS NULL OR p_trade_reference_bytes32 !~ '^0x[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'trade_reference_bytes32 must be 0x + 64 hex' USING ERRCODE = '23514';
  END IF;
  -- Attestation consistency: either all three populated or all three NULL.
  IF (p_attestor_address IS NULL) <> (p_attestation_signature IS NULL)
     OR (p_attestor_address IS NULL) <> (p_authorization_deadline_unix IS NULL) THEN
    RAISE EXCEPTION 'attestor_address, attestation_signature and authorization_deadline_unix must be all NULL or all set'
      USING ERRCODE = '23514';
  END IF;

  -- Lock the order row against concurrent takers.
  SELECT * INTO v_order
  FROM public.verdex_p2p_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.status <> 'open' THEN
    RAISE EXCEPTION 'ORDER_NOT_OPEN: order status is %', v_order.status USING ERRCODE = '55006';
  END IF;
  IF v_order.expires_at <= now() THEN
    RAISE EXCEPTION 'ORDER_EXPIRED' USING ERRCODE = '55006';
  END IF;
  -- Self-trade prevention: a user may not take their own order.
  IF v_order.creator_user_id = p_taker_user_id THEN
    RAISE EXCEPTION 'SELF_TRADE_NOT_ALLOWED' USING ERRCODE = '55006';
  END IF;
  -- Amount bounds.
  IF p_token_amount_atomic < v_order.minimum_trade_amount_atomic THEN
    RAISE EXCEPTION 'AMOUNT_BELOW_MINIMUM' USING ERRCODE = '23514';
  END IF;
  IF p_token_amount_atomic > v_order.remaining_amount_atomic THEN
    RAISE EXCEPTION 'AMOUNT_EXCEEDS_REMAINING' USING ERRCODE = '23514';
  END IF;

  -- Resolve buyer/seller from the order side.
  IF v_order.side = 'sell_vdx' THEN
    v_seller_user_id := v_order.creator_user_id;
    v_buyer_user_id   := p_taker_user_id;
  ELSE
    v_buyer_user_id   := v_order.creator_user_id;
    v_seller_user_id  := p_taker_user_id;
  END IF;

  v_new_remaining := v_order.remaining_amount_atomic - p_token_amount_atomic;
  IF v_new_remaining = 0 THEN
    v_new_order_status := 'filled'::public.verdex_p2p_order_status;
  ELSE
    v_new_order_status := v_order.status;
  END IF;

  -- Decrement the order's remaining amount.  If fully consumed, mark filled.
  UPDATE public.verdex_p2p_orders
    SET remaining_amount_atomic = v_new_remaining,
        status = v_new_order_status,
        closed_at = CASE WHEN v_new_remaining = 0 THEN now() ELSE closed_at END,
        version = version + 1
    WHERE id = v_order.id;

  -- Insert the trade row.  Status starts at 'initiated' (the only valid
  -- start state per the trade transition trigger); the API will immediately
  -- advance it to 'awaiting_escrow' once this function commits.
  INSERT INTO public.verdex_p2p_trades (
    order_id, buyer_user_id, seller_user_id, status, asset_symbol,
    token_amount_atomic, fiat_currency, fiat_amount, payment_method_code,
    payment_deadline_at, escrow_deadline_at
  ) VALUES (
    v_order.id, v_buyer_user_id, v_seller_user_id, 'initiated'::public.verdex_p2p_trade_status, 'VDX',
    p_token_amount_atomic, v_order.fiat_currency, p_fiat_amount, p_payment_method_code,
    p_payment_deadline_at, p_payment_deadline_at
  )
  RETURNING id, trade_reference INTO v_trade_id, v_trade_ref;

  -- Insert the escrow row.  In coordination-only mode (no attestation), it
  -- sits at 'awaiting_deposit' with NULL on-chain fields; the indexer will
  -- never pick it up until a real attestation is produced.  When an
  -- attestation IS present, the indexer/finality worker can observe the
  -- on-chain createEscrow and flip trade_authorization_consumed + status.
  INSERT INTO public.verdex_p2p_escrows (
    trade_id, status, chain_id, contract_address, token_amount_atomic,
    trade_reference_bytes32, seller_address, buyer_address,
    payment_deadline_unix, attestor_address, attestation_signature,
    authorization_deadline_unix, required_confirmations
  ) VALUES (
    v_trade_id, 'awaiting_deposit'::public.verdex_escrow_status, p_chain_id, p_contract_address,
    p_token_amount_atomic, p_trade_reference_bytes32, NULL, NULL,
    p_payment_deadline_unix, p_attestor_address, p_attestation_signature,
    p_authorization_deadline_unix, 1
  )
  RETURNING id, escrow_reference INTO v_escrow_id, v_escrow_ref;

  -- First trade event.  Subsequent transitions append events from the API.
  INSERT INTO public.verdex_p2p_trade_events (
    trade_id, actor_user_id, actor_kind, event_type, from_status, to_status, event_payload
  ) VALUES (
    v_trade_id, p_taker_user_id, 'user', 'trade.created', NULL, 'initiated'::public.verdex_p2p_trade_status,
    jsonb_build_object(
      'order_id', v_order.id,
      'side', v_order.side,
      'token_amount_atomic', p_token_amount_atomic::text,
      'fiat_currency', v_order.fiat_currency,
      'fiat_amount', p_fiat_amount::text,
      'escrow_id', v_escrow_id,
      'escrow_reference', v_escrow_ref
    )
  );

  RETURN QUERY SELECT v_trade_id, v_trade_ref, v_escrow_id, v_escrow_ref,
                      v_new_remaining,
                      v_new_order_status;
END;
$$;

REVOKE ALL ON FUNCTION public.verdex_p2p_open_trade(
  UUID, UUID, NUMERIC(78,0), NUMERIC(30,8), TEXT, TIMESTAMPTZ, TEXT,
  TEXT, TEXT, BIGINT, BIGINT, BIGINT, TEXT
) FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.verdex_p2p_open_trade(
  UUID, UUID, NUMERIC(78,0), NUMERIC(30,8), TEXT, TIMESTAMPTZ, TEXT,
  TEXT, TEXT, BIGINT, BIGINT, BIGINT, TEXT
) TO service_role;

COMMENT ON FUNCTION public.verdex_p2p_open_trade IS
  'Atomic, race-condition-free P2P trade creation. Locks the order, validates all invariants, decrements remaining_amount_atomic, inserts trade + escrow + first event in one transaction. Server-side (service_role) only.';


-- ---------------------------------------------------------------------------
-- Atomic order-remaining restoration for cancelled/expired trades.
--
-- When a trade is cancelled or expires before release, the reserved amount
-- must be returned to the order's `remaining_amount_atomic` so it can be
-- taken again.  This RPC locks the order row and increments the remaining
-- amount atomically; if the order was `filled`, it flips back to `open` and
-- clears `closed_at`.  Safe to call with an amount of zero (no-op).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.verdex_restore_order_remaining(
  p_order_id UUID,
  p_amount_atomic NUMERIC(78,0)
)
RETURNS TABLE(remaining_amount_atomic NUMERIC(78,0), status public.verdex_p2p_order_status)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions, public
AS $$
DECLARE
  v_order public.verdex_p2p_orders%ROWTYPE;
  v_new_remaining NUMERIC(78,0);
  v_new_status public.verdex_p2p_order_status;
BEGIN
  IF p_order_id IS NULL THEN
    RAISE EXCEPTION 'order_id is required' USING ERRCODE = '23502';
  END IF;
  IF p_amount_atomic IS NULL OR p_amount_atomic < 0 THEN
    RAISE EXCEPTION 'amount must be non-negative' USING ERRCODE = '23514';
  END IF;
  IF p_amount_atomic = 0 THEN
    RETURN;
  END IF;

  SELECT * INTO v_order
  FROM public.verdex_p2p_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- Never restore into a cancelled/suspended/rejected order; the order must
  -- be open or filled (filled = fully consumed, needs re-opening).
  IF v_order.status NOT IN ('open', 'filled') THEN
    RAISE EXCEPTION 'ORDER_NOT_RESTORABLE: status is %', v_order.status USING ERRCODE = '55006';
  END IF;

  v_new_remaining := v_order.remaining_amount_atomic + p_amount_atomic;
  IF v_new_remaining > v_order.token_amount_atomic THEN
    -- A bookkeeping bug would be required to hit this; fail loudly rather
    -- than silently corrupt the order book.
    RAISE EXCEPTION 'RESTORE_EXCEEDS_TOTAL: % > %', v_new_remaining, v_order.token_amount_atomic
      USING ERRCODE = '23514';
  END IF;

  v_new_status := CASE
    WHEN v_new_remaining >= v_order.token_amount_atomic THEN 'open'::public.verdex_p2p_order_status
    ELSE v_order.status
  END;

  UPDATE public.verdex_p2p_orders
    SET remaining_amount_atomic = v_new_remaining,
        status = v_new_status,
        closed_at = CASE WHEN v_new_status = 'open' THEN NULL ELSE closed_at END,
        version = version + 1
    WHERE id = v_order.id;

  RETURN QUERY SELECT v_new_remaining, v_new_status;
END;
$$;

REVOKE ALL ON FUNCTION public.verdex_restore_order_remaining(UUID, NUMERIC(78,0)) FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.verdex_restore_order_remaining(UUID, NUMERIC(78,0)) TO service_role;

COMMENT ON FUNCTION public.verdex_restore_order_remaining IS
  'Atomically restores reserved VDX to an order when a trade is cancelled or expires. Re-opens filled orders. Server-side (service_role) only.';

COMMIT;
