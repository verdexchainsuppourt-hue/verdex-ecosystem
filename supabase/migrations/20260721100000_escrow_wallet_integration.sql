-- ============================================================================
-- Verdex Custodial Wallet — Escrow Integration
--
-- Connects the custodial wallet balance system with the P2P escrow module.
-- Provides atomic RPC functions to lock, release, and refund escrow funds
-- from custodial wallet balances.
--
-- Depends on:
--   20260720130000_custodial_wallet_system.sql (wallet + balances)
--   20260718113000_p2p_kyc_aml_rbac_foundation.sql (P2P trades + escrow)
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Escrow-wallet link table: maps P2P escrow transactions to wallet locks.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.verdex_custodial_escrow_locks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id UUID NOT NULL,
  wallet_id UUID NOT NULL REFERENCES public.verdex_custodial_wallets(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount_atomic NUMERIC(78,0) NOT NULL CHECK (amount_atomic > 0),
  fee_atomic NUMERIC(78,0) NOT NULL DEFAULT 0 CHECK (fee_atomic >= 0),
  status TEXT NOT NULL DEFAULT 'locked' CHECK (status IN ('locked','released','refunded','cancelled')),
  locked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id),
  resolve_reason TEXT,
  token_id UUID REFERENCES public.verdex_custodial_tokens(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS verdex_custodial_escrow_locks_trade_idx
  ON public.verdex_custodial_escrow_locks (trade_id);
CREATE INDEX IF NOT EXISTS verdex_custodial_escrow_locks_wallet_idx
  ON public.verdex_custodial_escrow_locks (wallet_id);
CREATE INDEX IF NOT EXISTS verdex_custodial_escrow_locks_status_idx
  ON public.verdex_custodial_escrow_locks (status) WHERE status = 'locked';

-- ---------------------------------------------------------------------------
-- RPC: Lock custodial balance for P2P escrow
--
-- Atomically deducts from available balance and adds to locked balance.
-- Creates an escrow lock record. Returns the lock details.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.verdex_custodial_lock_for_escrow(
  p_trade_id UUID,
  p_user_id UUID,
  p_amount_atomic NUMERIC(78,0),
  p_fee_atomic NUMERIC(78,0) DEFAULT 0
)
RETURNS TABLE(
  success BOOLEAN,
  lock_id UUID,
  balance_after_available TEXT,
  balance_after_locked TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet_id UUID;
  v_balance_id UUID;
  v_total NUMERIC(78,0);
  v_avail NUMERIC(78,0);
  v_lock_id UUID;
  v_new_avail NUMERIC(78,0);
  v_new_locked NUMERIC(78,0);
BEGIN
  v_total := p_amount_atomic + p_fee_atomic;

  -- Find the user's wallet.
  SELECT w.id INTO v_wallet_id
  FROM verdex_custodial_wallets w
  WHERE w.user_id = p_user_id AND w.status = 'active'
  FOR UPDATE;

  IF v_wallet_id IS NULL THEN
    RAISE EXCEPTION 'WALLET_NOT_FOUND: User has no active wallet';
  END IF;

  -- Lock the balance row for update.
  SELECT b.id, b.available_atomic INTO v_balance_id, v_avail
  FROM verdex_custodial_balances b
  WHERE b.wallet_id = v_wallet_id
  FOR UPDATE;

  IF v_balance_id IS NULL THEN
    RAISE EXCEPTION 'BALANCE_NOT_FOUND: Wallet has no balance record';
  END IF;

  IF v_avail < v_total THEN
    RAISE EXCEPTION 'INSUFFICIENT_BALANCE: Need % but only have % available', v_total, v_avail;
  END IF;

  -- Deduct from available, add to locked.
  v_new_avail := v_avail - v_total;
  UPDATE verdex_custodial_balances
  SET available_atomic = v_new_avail,
      locked_atomic = locked_atomic + v_total,
      version = version + 1,
      updated_at = now()
  WHERE id = v_balance_id;

  SELECT locked_atomic INTO v_new_locked
  FROM verdex_custodial_balances WHERE id = v_balance_id;

  -- Create the escrow lock record.
  INSERT INTO verdex_custodial_escrow_locks (trade_id, wallet_id, user_id, amount_atomic, fee_atomic, status)
  VALUES (p_trade_id, v_wallet_id, p_user_id, p_amount_atomic, p_fee_atomic, 'locked')
  RETURNING id INTO v_lock_id;

  -- Log the transaction.
  INSERT INTO verdex_custodial_transactions (
    wallet_id, user_id, tx_type, tx_status, amount_atomic, fee_atomic,
    direction, balance_after_atomic, related_transfer_id
  ) VALUES (
    v_wallet_id, p_user_id, 'escrow_lock', 'completed', p_amount_atomic,
    p_fee_atomic, 'outgoing', v_new_avail::text, v_lock_id
  );

  RETURN QUERY SELECT true, v_lock_id, v_new_avail::text, v_new_locked::text;
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC: Release escrow funds to counterparty
--
-- Moves locked funds from seller to buyer's available balance.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.verdex_custodial_release_escrow(
  p_lock_id UUID,
  p_to_user_id UUID,
  p_released_by UUID
)
RETURNS TABLE(
  success BOOLEAN,
  from_balance_after TEXT,
  to_balance_after TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lock RECORD;
  v_to_wallet_id UUID;
  v_to_balance_id UUID;
  v_from_new_locked NUMERIC(78,0);
  v_to_new_avail NUMERIC(78,0);
BEGIN
  -- Lock the escrow record.
  SELECT * INTO v_lock
  FROM verdex_custodial_escrow_locks
  WHERE id = p_lock_id AND status = 'locked'
  FOR UPDATE;

  IF v_lock IS NULL THEN
    RAISE EXCEPTION 'ESCROW_NOT_FOUND: Lock % not found or already resolved', p_lock_id;
  END IF;

  -- Deduct from seller's locked balance.
  UPDATE verdex_custodial_balances
  SET locked_atomic = locked_atomic - (v_lock.amount_atomic + v_lock.fee_atomic),
      version = version + 1,
      updated_at = now()
  WHERE wallet_id = v_lock.wallet_id;

  SELECT locked_atomic INTO v_from_new_locked
  FROM verdex_custodial_balances WHERE wallet_id = v_lock.wallet_id;

  -- Find buyer's wallet. Create if needed.
  SELECT w.id INTO v_to_wallet_id
  FROM verdex_custodial_wallets w
  WHERE w.user_id = p_to_user_id AND w.status = 'active'
  FOR UPDATE;

  IF v_to_wallet_id IS NULL THEN
    RAISE EXCEPTION 'RECIPIENT_WALLET_NOT_FOUND: Buyer has no active wallet';
  END IF;

  -- Credit buyer's available balance.
  UPDATE verdex_custodial_balances
  SET available_atomic = available_atomic + v_lock.amount_atomic,
      version = version + 1,
      updated_at = now()
  WHERE wallet_id = v_to_wallet_id;

  SELECT available_atomic INTO v_to_new_avail
  FROM verdex_custodial_balances WHERE wallet_id = v_to_wallet_id;

  -- Mark escrow as released.
  UPDATE verdex_custodial_escrow_locks
  SET status = 'released',
      resolved_at = now(),
      resolved_by = p_released_by,
      updated_at = now()
  WHERE id = p_lock_id;

  -- Log transactions for both parties.
  INSERT INTO verdex_custodial_transactions (
    wallet_id, user_id, tx_type, tx_status, amount_atomic, direction,
    balance_after_atomic, related_transfer_id
  ) VALUES
    (v_lock.wallet_id, v_lock.user_id, 'escrow_release', 'completed',
     v_lock.amount_atomic, 'outgoing', v_from_new_locked::text, p_lock_id),
    (v_to_wallet_id, p_to_user_id, 'escrow_release', 'completed',
     v_lock.amount_atomic, 'incoming', v_to_new_avail::text, p_lock_id);

  RETURN QUERY SELECT true, v_from_new_locked::text, v_to_new_avail::text;
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC: Refund escrow back to originator
--
-- Returns locked funds to the original seller's available balance.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.verdex_custodial_refund_escrow(
  p_lock_id UUID,
  p_refunded_by UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS TABLE(
  success BOOLEAN,
  balance_after_available TEXT,
  balance_after_locked TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lock RECORD;
  v_new_avail NUMERIC(78,0);
  v_new_locked NUMERIC(78,0);
BEGIN
  -- Lock the escrow record.
  SELECT * INTO v_lock
  FROM verdex_custodial_escrow_locks
  WHERE id = p_lock_id AND status = 'locked'
  FOR UPDATE;

  IF v_lock IS NULL THEN
    RAISE EXCEPTION 'ESCROW_NOT_FOUND: Lock % not found or already resolved', p_lock_id;
  END IF;

  -- Return funds: deduct from locked, add to available.
  UPDATE verdex_custodial_balances
  SET available_atomic = available_atomic + v_lock.amount_atomic + v_lock.fee_atomic,
      locked_atomic = locked_atomic - (v_lock.amount_atomic + v_lock.fee_atomic),
      version = version + 1,
      updated_at = now()
  WHERE wallet_id = v_lock.wallet_id;

  SELECT available_atomic, locked_atomic INTO v_new_avail, v_new_locked
  FROM verdex_custodial_balances WHERE wallet_id = v_lock.wallet_id;

  -- Mark escrow as refunded.
  UPDATE verdex_custodial_escrow_locks
  SET status = 'refunded',
      resolved_at = now(),
      resolved_by = p_refunded_by,
      resolve_reason = COALESCE(p_reason, 'Trade cancelled or disputed'),
      updated_at = now()
  WHERE id = p_lock_id;

  -- Log the refund transaction.
  INSERT INTO verdex_custodial_transactions (
    wallet_id, user_id, tx_type, tx_status, amount_atomic, fee_atomic,
    direction, balance_after_atomic, related_transfer_id
  ) VALUES (
    v_lock.wallet_id, v_lock.user_id, 'escrow_refund', 'completed',
    v_lock.amount_atomic, v_lock.fee_atomic, 'incoming',
    v_new_avail::text, p_lock_id
  );

  RETURN QUERY SELECT true, v_new_avail::text, v_new_locked::text;
END;
$$;

-- ---------------------------------------------------------------------------
-- RLS: Allow service role only (these RPCs are called from the backend API).
-- ---------------------------------------------------------------------------
ALTER TABLE public.verdex_custodial_escrow_locks ENABLE ROW LEVEL SECURITY;

CREATE POLICY verdex_escrow_locks_service ON public.verdex_custodial_escrow_locks
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Users can read their own escrow locks.
CREATE POLICY verdex_escrow_locks_user_read ON public.verdex_custodial_escrow_locks
  FOR SELECT TO authenticated USING (user_id = auth.uid());

COMMIT;
