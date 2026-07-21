-- ============================================================================
-- Verdex Custodial Wallet — Multi-Token Support
--
-- Adds support for multiple token types (USDT ERC20, USDT BEP20, USDT TRC20,
-- VDX, and any future tokens) in the custodial wallet. Each token has its own
-- balance per wallet, with separate deposit detection and withdrawal flows.
--
-- Depends on: 20260720130000_custodial_wallet_system.sql
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Token registry: supported tokens with their chain, contract, decimals.
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.verdex_token_chain AS ENUM ('verdex', 'ethereum', 'bsc', 'tron', 'polygon', 'arbitrum');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.verdex_custodial_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT NOT NULL,                    -- e.g. 'USDT', 'VDX', 'USDC'
  name TEXT NOT NULL,                      -- e.g. 'Tether USD'
  chain public.verdex_token_chain NOT NULL,
  contract_address TEXT,                   -- NULL for native tokens
  decimals INTEGER NOT NULL DEFAULT 18 CHECK (decimals BETWEEN 0 AND 36),
  logo_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  deposit_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  withdrawal_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  min_withdrawal_atomic NUMERIC(78,0) NOT NULL DEFAULT 1000000, -- ~0.001 for 6-decimal tokens
  withdrawal_fee_atomic NUMERIC(78,0) NOT NULL DEFAULT 0,
  display_order INTEGER NOT NULL DEFAULT 100,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT verdex_custodial_tokens_unique UNIQUE (symbol, chain)
);

CREATE INDEX IF NOT EXISTS verdex_custodial_tokens_active_idx
  ON public.verdex_custodial_tokens (is_active, display_order);

-- Seed the initial supported tokens.
INSERT INTO public.verdex_custodial_tokens (symbol, name, chain, contract_address, decimals, display_order, metadata) VALUES
  ('VDX', 'Verdex', 'verdex', NULL, 18, 1, '{"color":"#22c55e","network":"Verdex Mainnet"}'),
  ('USDT', 'Tether USD (ERC20)', 'ethereum', '0xdAC17F958D2ee523a2206206994597C13D831ec7', 6, 10, '{"color":"#26A17B","network":"Ethereum"}'),
  ('USDT', 'Tether USD (BEP20)', 'bsc', '0x55d398326f99059fF775485246999027B3197955', 18, 11, '{"color":"#26A17B","network":"BNB Smart Chain"}'),
  ('USDT', 'Tether USD (TRC20)', 'tron', 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', 6, 12, '{"color":"#26A17B","network":"Tron"}'),
  ('USDC', 'USD Coin (ERC20)', 'ethereum', '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 6, 20, '{"color":"#2775CA","network":"Ethereum"}'),
  ('USDC', 'USD Coin (BEP20)', 'bsc', '0x8AC76A51cc950d9822D68b83fE1Ad97B32Cd580d', 18, 21, '{"color":"#2775CA","network":"BNB Smart Chain"}'),
  ('BNB', 'BNB', 'bsc', NULL, 18, 30, '{"color":"#F0B90B","network":"BNB Smart Chain"}'),
  ('ETH', 'Ethereum', 'ethereum', NULL, 18, 40, '{"color":"#627EEA","network":"Ethereum"}')
ON CONFLICT (symbol, chain) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Per-token balances: one row per wallet per token.
-- Replaces the single-currency balance for multi-token support.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.verdex_custodial_token_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id UUID NOT NULL REFERENCES public.verdex_custodial_wallets(id) ON DELETE RESTRICT,
  token_id UUID NOT NULL REFERENCES public.verdex_custodial_tokens(id) ON DELETE RESTRICT,
  available_atomic NUMERIC(78,0) NOT NULL DEFAULT 0 CHECK (available_atomic >= 0),
  pending_atomic NUMERIC(78,0) NOT NULL DEFAULT 0 CHECK (pending_atomic >= 0),
  locked_atomic NUMERIC(78,0) NOT NULL DEFAULT 0 CHECK (locked_atomic >= 0),
  total_lifetime_deposited_atomic NUMERIC(78,0) NOT NULL DEFAULT 0,
  total_lifetime_withdrawn_atomic NUMERIC(78,0) NOT NULL DEFAULT 0,
  last_deposit_at TIMESTAMPTZ,
  last_withdrawal_at TIMESTAMPTZ,
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT verdex_custodial_token_balances_unique UNIQUE (wallet_id, token_id),
  CONSTRAINT verdex_custodial_token_balances_non_negative CHECK (
    available_atomic >= 0 AND pending_atomic >= 0 AND locked_atomic >= 0
  )
);

CREATE INDEX IF NOT EXISTS verdex_custodial_token_balances_wallet_idx
  ON public.verdex_custodial_token_balances (wallet_id, token_id);

-- ---------------------------------------------------------------------------
-- Per-token deposits: extends the deposits table to track which token.
-- ---------------------------------------------------------------------------
ALTER TABLE public.verdex_custodial_deposits
  ADD COLUMN IF NOT EXISTS token_id UUID REFERENCES public.verdex_custodial_tokens(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- Per-token withdrawals: extends the withdrawals table.
-- ---------------------------------------------------------------------------
ALTER TABLE public.verdex_custodial_withdrawals
  ADD COLUMN IF NOT EXISTS token_id UUID REFERENCES public.verdex_custodial_tokens(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS token_symbol TEXT,
  ADD COLUMN IF NOT EXISTS token_chain public.verdex_token_chain;

-- ---------------------------------------------------------------------------
-- Per-token transactions: extends the transactions table.
-- ---------------------------------------------------------------------------
ALTER TABLE public.verdex_custodial_transactions
  ADD COLUMN IF NOT EXISTS token_id UUID REFERENCES public.verdex_custodial_tokens(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS token_symbol TEXT;

-- ---------------------------------------------------------------------------
-- RPC: Get or create a token balance row.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.verdex_custodial_ensure_token_balance(
  p_wallet_id UUID,
  p_token_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions, public
AS $$
DECLARE
  v_id UUID;
BEGIN
  SELECT id INTO v_id FROM public.verdex_custodial_token_balances
  WHERE wallet_id = p_wallet_id AND token_id = p_token_id;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  INSERT INTO public.verdex_custodial_token_balances (wallet_id, token_id)
  VALUES (p_wallet_id, p_token_id)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.verdex_custodial_ensure_token_balance(UUID, UUID) FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.verdex_custodial_ensure_token_balance(UUID, UUID) TO service_role;

-- ---------------------------------------------------------------------------
-- RPC: Atomic multi-token internal transfer.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.verdex_custodial_transfer_token(
  p_from_user_id UUID,
  p_to_user_id UUID,
  p_token_id UUID,
  p_amount_atomic NUMERIC(78,0),
  p_fee_atomic NUMERIC(78,0) DEFAULT 0,
  p_memo TEXT DEFAULT NULL,
  p_initiated_by UUID DEFAULT NULL
)
RETURNS TABLE(transfer_id UUID, status public.verdex_custodial_transfer_status, from_balance_after NUMERIC(78,0), to_balance_after NUMERIC(78,0))
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions, public
AS $$
DECLARE
  v_from_wallet public.verdex_custodial_wallets%ROWTYPE;
  v_to_wallet public.verdex_custodial_wallets%ROWTYPE;
  v_from_bal_id UUID;
  v_to_bal_id UUID;
  v_from_avail NUMERIC(78,0);
  v_to_avail NUMERIC(78,0);
  v_transfer_id UUID;
  v_total NUMERIC(78,0);
BEGIN
  IF p_from_user_id = p_to_user_id THEN
    RAISE EXCEPTION 'Cannot transfer to self' USING ERRCODE = '23514';
  END IF;
  IF p_amount_atomic IS NULL OR p_amount_atomic <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive' USING ERRCODE = '23514';
  END IF;

  v_total := p_amount_atomic + COALESCE(p_fee_atomic, 0);

  -- Lock wallets.
  SELECT * INTO v_from_wallet FROM public.verdex_custodial_wallets WHERE user_id = p_from_user_id FOR UPDATE;
  SELECT * INTO v_to_wallet FROM public.verdex_custodial_wallets WHERE user_id = p_to_user_id FOR UPDATE;
  IF v_from_wallet.id IS NULL THEN RAISE EXCEPTION 'SENDER_WALLET_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF v_to_wallet.id IS NULL THEN RAISE EXCEPTION 'RECIPIENT_WALLET_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF v_from_wallet.status <> 'active' THEN RAISE EXCEPTION 'SENDER_WALLET_NOT_ACTIVE' USING ERRCODE = '55006'; END IF;
  IF v_to_wallet.status <> 'active' THEN RAISE EXCEPTION 'RECIPIENT_WALLET_NOT_ACTIVE' USING ERRCODE = '55006'; END IF;

  -- Ensure token balance rows exist + lock them.
  v_from_bal_id := public.verdex_custodial_ensure_token_balance(v_from_wallet.id, p_token_id);
  v_to_bal_id := public.verdex_custodial_ensure_token_balance(v_to_wallet.id, p_token_id);

  -- Lock and read.
  SELECT available_atomic INTO v_from_avail FROM public.verdex_custodial_token_balances WHERE id = v_from_bal_id FOR UPDATE;
  SELECT available_atomic INTO v_to_avail FROM public.verdex_custodial_balances WHERE id = v_to_bal_id FOR UPDATE;

  IF v_from_avail < v_total THEN
    RAISE EXCEPTION 'INSUFFICIENT_BALANCE: available %, required %', v_from_avail, v_total USING ERRCODE = '23514';
  END IF;

  -- Debit + credit.
  UPDATE public.verdex_custodial_token_balances
    SET available_atomic = available_atomic - v_total, version = version + 1
    WHERE id = v_from_bal_id
    RETURNING available_atomic INTO v_from_avail;

  UPDATE public.verdex_custodial_token_balances
    SET available_atomic = available_atomic + p_amount_atomic, version = version + 1
    WHERE id = v_to_bal_id
    RETURNING available_atomic INTO v_to_avail;

  -- Create transfer record.
  INSERT INTO public.verdex_custodial_transfers (
    from_wallet_id, to_wallet_id, from_user_id, to_user_id,
    amount_atomic, fee_atomic, status, memo, initiated_by, completed_at
  ) VALUES (
    v_from_wallet.id, v_to_wallet.id, p_from_user_id, p_to_user_id,
    p_amount_atomic, COALESCE(p_fee_atomic, 0), 'completed'::public.verdex_custodial_transfer_status,
    p_memo, COALESCE(p_initiated_by, p_from_user_id), now()
  )
  RETURNING id INTO v_transfer_id;

  -- Log transactions.
  INSERT INTO public.verdex_custodial_transactions (
    wallet_id, user_id, tx_type, tx_status, amount_atomic, fee_atomic,
    direction, counterparty_user_id, related_transfer_id, memo, balance_after_atomic, token_id
  ) VALUES
    (v_from_wallet.id, p_from_user_id, 'transfer_out'::public.verdex_custodial_tx_type,
     'completed'::public.verdex_custodial_tx_status, p_amount_atomic, COALESCE(p_fee_atomic, 0),
     'outgoing', p_to_user_id, v_transfer_id, p_memo, v_from_avail, p_token_id),
    (v_to_wallet.id, p_to_user_id, 'transfer_in'::public.verdex_custodial_tx_type,
     'completed'::public.verdex_custodial_tx_status, p_amount_atomic, 0,
     'incoming', p_from_user_id, v_transfer_id, p_memo, v_to_avail, p_token_id);

  RETURN QUERY SELECT v_transfer_id, 'completed'::public.verdex_custodial_transfer_status, v_from_avail, v_to_avail;
END;
$$;

REVOKE ALL ON FUNCTION public.verdex_custodial_transfer_token(UUID, UUID, UUID, NUMERIC(78,0), NUMERIC(78,0), TEXT, UUID) FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.verdex_custodial_transfer_token(UUID, UUID, UUID, NUMERIC(78,0), NUMERIC(78,0), TEXT, UUID) TO service_role;

-- ---------------------------------------------------------------------------
-- RLS + grants for new tables.
-- ---------------------------------------------------------------------------
ALTER TABLE public.verdex_custodial_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verdex_custodial_token_balances ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.verdex_custodial_tokens FROM anon;
REVOKE ALL ON TABLE public.verdex_custodial_token_balances FROM anon, authenticated;

-- Token registry is public (read-only) so clients can display the token list.
GRANT SELECT ON TABLE public.verdex_custodial_tokens TO authenticated;
CREATE POLICY verdex_custodial_tokens_select_all
  ON public.verdex_custodial_tokens FOR SELECT TO authenticated
  USING (is_active = TRUE);

-- Token balances: self-only.
GRANT SELECT ON TABLE public.verdex_custodial_token_balances TO authenticated;
CREATE POLICY verdex_custodial_token_balances_select_self
  ON public.verdex_custodial_token_balances FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.verdex_custodial_wallets w WHERE w.id = wallet_id AND w.user_id = auth.uid()));

-- Trigger for updated_at.
DROP TRIGGER IF EXISTS verdex_custodial_tokens_touch_updated_at ON public.verdex_custodial_tokens;
CREATE TRIGGER verdex_custodial_tokens_touch_updated_at
  BEFORE UPDATE ON public.verdex_custodial_tokens
  FOR EACH ROW EXECUTE FUNCTION public.verdex_custodial_touch_updated_at();

DROP TRIGGER IF EXISTS verdex_custodial_token_balances_touch_updated_at ON public.verdex_custodial_token_balances;
CREATE TRIGGER verdex_custodial_token_balances_touch_updated_at
  BEFORE UPDATE ON public.verdex_custodial_token_balances
  FOR EACH ROW EXECUTE FUNCTION public.verdex_custodial_touch_updated_at();

COMMENT ON TABLE public.verdex_custodial_tokens IS
  'Supported token registry. Each token has a chain, contract address, decimals, and fee config.';
COMMENT ON TABLE public.verdex_custodial_token_balances IS
  'Per-token custodial balances. One row per wallet per token. Modified only by RPC functions.';

COMMIT;
