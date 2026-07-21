-- ============================================================================
-- Verdex Custodial Wallet Subsystem
--
-- A production custodial wallet where the platform holds encrypted keys,
-- detects deposits, processes withdrawals with KYC/AML hooks and multi-sig
-- treasury approval, and supports instant off-chain internal transfers.
--
-- Private keys are NEVER stored in plaintext. The HD master seed is encrypted
-- with AES-256-GCM using a master key supplied via environment variable. Only
-- the encrypted seed and per-wallet derivation indices live in the database.
-- Keys are derived in memory only during signing operations.
--
-- Depends on: 20260718113000_p2p_kyc_aml_rbac_foundation.sql (KYC + RBAC)
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Enum types
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.verdex_custodial_wallet_status AS ENUM (
    'active', 'suspended', 'frozen', 'closed'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.verdex_custodial_tx_type AS ENUM (
    'deposit', 'withdrawal', 'transfer_in', 'transfer_out', 'fee', 'adjustment',
    'escrow_lock', 'escrow_release', 'escrow_refund', 'mining_reward'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.verdex_custodial_tx_status AS ENUM (
    'pending', 'confirmed', 'processing', 'completed', 'failed',
    'cancelled', 'expired', 'awaiting_confirmation', 'awaiting_approval',
    'approved', 'rejected'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.verdex_custodial_deposit_status AS ENUM (
    'detected', 'confirming', 'confirmed', 'credited', 'failed', 'expired'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.verdex_custodial_withdrawal_status AS ENUM (
    'requested', 'kyc_pending', 'aml_pending', 'aml_flagged',
    'awaiting_signatures', 'approved', 'processing', 'broadcast',
    'completed', 'failed', 'rejected', 'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.verdex_custodial_transfer_status AS ENUM (
    'pending', 'completed', 'failed', 'reversed'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.verdex_treasury_role AS ENUM (
    'treasury_admin', 'treasury_signer', 'treasury_auditor'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.verdex_aml_risk_level AS ENUM (
    'clear', 'low', 'medium', 'high', 'prohibited'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- Key store: encrypted HD master seed (one row, singleton)
-- The seed is encrypted with AES-256-GCM. The encryption key lives ONLY in
-- the deployment environment (WALLET_MASTER_KEY). Key versioning supports
-- rotation without re-deriving wallet addresses.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.verdex_custodial_key_store (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
  encrypted_seed BYTEA NOT NULL,
  seed_iv BYTEA NOT NULL,
  seed_auth_tag BYTEA NOT NULL,
  key_version INTEGER NOT NULL DEFAULT 1 CHECK (key_version > 0),
  key_hash_sha256 TEXT NOT NULL CHECK (key_hash_sha256 ~ '^[0-9a-f]{64}$'),
  rotated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Custodial wallets: one per user. Stores the derivation index (not the key)
-- and the deposit address. The private key is derived from the master seed +
-- derivation index in memory only when a signing operation is needed.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.verdex_custodial_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE RESTRICT,
  derivation_index INTEGER NOT NULL UNIQUE CHECK (derivation_index >= 0),
  deposit_address TEXT NOT NULL UNIQUE CHECK (deposit_address ~ '^0x[a-fA-F0-9]{40}$'),
  status public.verdex_custodial_wallet_status NOT NULL DEFAULT 'active',
  kyc_required BOOLEAN NOT NULL DEFAULT TRUE,
  kyc_case_id UUID REFERENCES public.verdex_kyc_cases(id) ON DELETE SET NULL,
  withdrawal_tier TEXT NOT NULL DEFAULT 'standard'
    CHECK (withdrawal_tier IN ('basic', 'standard', 'enhanced', 'unlimited')),
  daily_withdrawal_limit_atomic NUMERIC(78,0) NOT NULL DEFAULT 1000000000000000000000
    CHECK (daily_withdrawal_limit_atomic > 0),
  monthly_withdrawal_limit_atomic NUMERIC(78,0) NOT NULL DEFAULT 10000000000000000000000
    CHECK (monthly_withdrawal_limit_atomic > 0),
  last_withdrawal_at TIMESTAMPTZ,
  frozen_reason TEXT,
  frozen_at TIMESTAMPTZ,
  frozen_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS verdex_custodial_wallets_user_idx
  ON public.verdex_custodial_wallets (user_id, status);

CREATE INDEX IF NOT EXISTS verdex_custodial_wallets_address_idx
  ON public.verdex_custodial_wallets (deposit_address);

-- ---------------------------------------------------------------------------
-- Balances: available + pending + locked. Managed exclusively by RPC
-- functions to guarantee atomicity. Direct client DML is denied by RLS.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.verdex_custodial_balances (
  wallet_id UUID PRIMARY KEY REFERENCES public.verdex_custodial_wallets(id) ON DELETE RESTRICT,
  available_atomic NUMERIC(78,0) NOT NULL DEFAULT 0 CHECK (available_atomic >= 0),
  pending_atomic NUMERIC(78,0) NOT NULL DEFAULT 0 CHECK (pending_atomic >= 0),
  locked_atomic NUMERIC(78,0) NOT NULL DEFAULT 0 CHECK (locked_atomic >= 0),
  total_lifetime_deposited_atomic NUMERIC(78,0) NOT NULL DEFAULT 0,
  total_lifetime_withdrawn_atomic NUMERIC(78,0) NOT NULL DEFAULT 0,
  total_lifetime_transferred_in_atomic NUMERIC(78,0) NOT NULL DEFAULT 0,
  total_lifetime_transferred_out_atomic NUMERIC(78,0) NOT NULL DEFAULT 0,
  last_deposit_at TIMESTAMPTZ,
  last_withdrawal_at TIMESTAMPTZ,
  last_transfer_at TIMESTAMPTZ,
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT verdex_custodial_balances_non_negative CHECK (
    available_atomic >= 0 AND pending_atomic >= 0 AND locked_atomic >= 0
  )
);

-- ---------------------------------------------------------------------------
-- Deposits: incoming on-chain transactions detected by the deposit worker.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.verdex_custodial_deposits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id UUID NOT NULL REFERENCES public.verdex_custodial_wallets(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  tx_hash TEXT NOT NULL UNIQUE CHECK (char_length(tx_hash) BETWEEN 8 AND 256),
  tx_index INTEGER NOT NULL DEFAULT 0,
  from_address TEXT CHECK (from_address IS NULL OR from_address ~ '^0x[a-fA-F0-9]{40}$'),
  to_address TEXT NOT NULL CHECK (to_address ~ '^0x[a-fA-F0-9]{40}$'),
  amount_atomic NUMERIC(78,0) NOT NULL CHECK (amount_atomic > 0),
  confirmations INTEGER NOT NULL DEFAULT 0 CHECK (confirmations >= 0),
  required_confirmations INTEGER NOT NULL DEFAULT 12 CHECK (required_confirmations BETWEEN 1 AND 100),
  block_number BIGINT,
  block_hash TEXT,
  status public.verdex_custodial_deposit_status NOT NULL DEFAULT 'detected',
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at TIMESTAMPTZ,
  credited_at TIMESTAMPTZ,
  failure_reason TEXT,
  aml_risk_level public.verdex_aml_risk_level,
  aml_screened_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS verdex_custodial_deposits_tx_hash_idx
  ON public.verdex_custodial_deposits (tx_hash);

CREATE INDEX IF NOT EXISTS verdex_custodial_deposits_wallet_idx
  ON public.verdex_custodial_deposits (wallet_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS verdex_custodial_deposits_confirming_idx
  ON public.verdex_custodial_deposits (status, confirmations, required_confirmations)
  WHERE status IN ('detected', 'confirming');

CREATE INDEX IF NOT EXISTS verdex_custodial_deposits_address_idx
  ON public.verdex_custodial_deposits (to_address, status);

-- ---------------------------------------------------------------------------
-- Withdrawals: user requests to send VDX to an external address. Multi-sig
-- treasury approval required above a configurable threshold.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.verdex_custodial_withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id UUID NOT NULL REFERENCES public.verdex_custodial_wallets(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  destination_address TEXT NOT NULL CHECK (destination_address ~ '^0x[a-fA-F0-9]{40}$'),
  amount_atomic NUMERIC(78,0) NOT NULL CHECK (amount_atomic > 0),
  fee_atomic NUMERIC(78,0) NOT NULL DEFAULT 0 CHECK (fee_atomic >= 0),
  total_atomic NUMERIC(78,0) NOT NULL CHECK (total_atomic > 0),
  status public.verdex_custodial_withdrawal_status NOT NULL DEFAULT 'requested',
  kyc_verified BOOLEAN NOT NULL DEFAULT FALSE,
  aml_risk_level public.verdex_aml_risk_level,
  aml_screened_at TIMESTAMPTZ,
  aml_flag_reason TEXT,
  requires_multisig BOOLEAN NOT NULL DEFAULT FALSE,
  multisig_threshold INTEGER NOT NULL DEFAULT 2 CHECK (multisig_threshold BETWEEN 1 AND 15),
  current_signatures INTEGER NOT NULL DEFAULT 0 CHECK (current_signatures >= 0),
  tx_hash TEXT CHECK (tx_hash IS NULL OR char_length(tx_hash) BETWEEN 8 AND 256),
  broadcast_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  failure_reason TEXT,
  rejection_reason TEXT,
  rejected_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ip_hash_sha256 TEXT CHECK (ip_hash_sha256 IS NULL OR ip_hash_sha256 ~ '^[0-9a-f]{64}$'),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT verdex_custodial_withdrawals_total_check CHECK (total_atomic = amount_atomic + fee_atomic)
);

CREATE INDEX IF NOT EXISTS verdex_custodial_withdrawals_user_idx
  ON public.verdex_custodial_withdrawals (user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS verdex_custodial_withdrawals_pending_idx
  ON public.verdex_custodial_withdrawals (status, created_at)
  WHERE status IN ('requested', 'kyc_pending', 'aml_pending', 'awaiting_signatures', 'approved');

CREATE INDEX IF NOT EXISTS verdex_custodial_withdrawals_multisig_idx
  ON public.verdex_custodial_withdrawals (requires_multisig, current_signatures, multisig_threshold)
  WHERE status = 'awaiting_signatures';

-- ---------------------------------------------------------------------------
-- Treasury: multi-sig signer roles + per-withdrawal signatures.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.verdex_custodial_treasury_signers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  role public.verdex_treasury_role NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  granted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  revocation_reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS verdex_custodial_treasury_signers_active_idx
  ON public.verdex_custodial_treasury_signers (user_id, role)
  WHERE is_active;

CREATE TABLE IF NOT EXISTS public.verdex_custodial_treasury_signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  withdrawal_id UUID NOT NULL REFERENCES public.verdex_custodial_withdrawals(id) ON DELETE RESTRICT,
  signer_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  signer_role public.verdex_treasury_role NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('approve', 'reject')),
  reason TEXT,
  signed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_hash_sha256 TEXT CHECK (ip_hash_sha256 IS NULL OR ip_hash_sha256 ~ '^[0-9a-f]{64}$'),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS verdex_custodial_treasury_sigs_one_per_signer_idx
  ON public.verdex_custodial_treasury_signatures (withdrawal_id, signer_user_id);

CREATE INDEX IF NOT EXISTS verdex_custodial_treasury_sigs_withdrawal_idx
  ON public.verdex_custodial_treasury_signatures (withdrawal_id, signed_at);

-- ---------------------------------------------------------------------------
-- Internal transfers: instant off-chain balance movements between users.
-- Atomic via RPC — debit sender + credit receiver in one transaction.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.verdex_custodial_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_wallet_id UUID NOT NULL REFERENCES public.verdex_custodial_wallets(id) ON DELETE RESTRICT,
  to_wallet_id UUID NOT NULL REFERENCES public.verdex_custodial_wallets(id) ON DELETE RESTRICT,
  from_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  to_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  amount_atomic NUMERIC(78,0) NOT NULL CHECK (amount_atomic > 0),
  fee_atomic NUMERIC(78,0) NOT NULL DEFAULT 0 CHECK (fee_atomic >= 0),
  status public.verdex_custodial_transfer_status NOT NULL DEFAULT 'pending',
  memo TEXT CHECK (char_length(memo) <= 500),
  initiated_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  completed_at TIMESTAMPTZ,
  reversed_at TIMESTAMPTZ,
  reversal_reason TEXT,
  aml_risk_level public.verdex_aml_risk_level,
  aml_screened_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT verdex_custodial_transfers_counterparty_check CHECK (from_wallet_id <> to_wallet_id)
);

CREATE INDEX IF NOT EXISTS verdex_custodial_transfers_from_idx
  ON public.verdex_custodial_transfers (from_user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS verdex_custodial_transfers_to_idx
  ON public.verdex_custodial_transfers (to_user_id, status, created_at DESC);

-- ---------------------------------------------------------------------------
-- Unified transaction history: one row per wallet-affecting event.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.verdex_custodial_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id UUID NOT NULL REFERENCES public.verdex_custodial_wallets(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  tx_type public.verdex_custodial_tx_type NOT NULL,
  tx_status public.verdex_custodial_tx_status NOT NULL DEFAULT 'pending',
  amount_atomic NUMERIC(78,0) NOT NULL,
  fee_atomic NUMERIC(78,0) NOT NULL DEFAULT 0,
  direction TEXT NOT NULL CHECK (direction IN ('incoming', 'outgoing', 'internal')),
  counterparty_address TEXT,
  counterparty_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  related_deposit_id UUID REFERENCES public.verdex_custodial_deposits(id) ON DELETE SET NULL,
  related_withdrawal_id UUID REFERENCES public.verdex_custodial_withdrawals(id) ON DELETE SET NULL,
  related_transfer_id UUID REFERENCES public.verdex_custodial_transfers(id) ON DELETE SET NULL,
  tx_hash TEXT,
  block_number BIGINT,
  memo TEXT CHECK (char_length(memo) <= 500),
  balance_after_atomic NUMERIC(78,0),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS verdex_custodial_transactions_wallet_idx
  ON public.verdex_custodial_transactions (wallet_id, created_at DESC);

CREATE INDEX IF NOT EXISTS verdex_custodial_transactions_user_idx
  ON public.verdex_custodial_transactions (user_id, tx_type, created_at DESC);

-- ---------------------------------------------------------------------------
-- AML screening results.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.verdex_custodial_aml_screenings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type TEXT NOT NULL CHECK (subject_type IN ('deposit', 'withdrawal', 'transfer', 'address')),
  subject_id UUID,
  subject_address TEXT CHECK (subject_address IS NULL OR subject_address ~ '^0x[a-fA-F0-9]{40}$'),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  risk_level public.verdex_aml_risk_level NOT NULL DEFAULT 'clear',
  risk_score NUMERIC(5,2) CHECK (risk_score IS NULL OR risk_score BETWEEN 0 AND 100),
  screened_by TEXT NOT NULL DEFAULT 'internal_rules',
  flag_reasons TEXT[],
  screened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  review_decision TEXT CHECK (review_decision IS NULL OR review_decision IN ('clear', 'flag', 'block')),
  review_note TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS verdex_custodial_aml_subject_idx
  ON public.verdex_custodial_aml_screenings (subject_type, subject_id);

CREATE INDEX IF NOT EXISTS verdex_custodial_aml_review_queue_idx
  ON public.verdex_custodial_aml_screenings (risk_level, screened_at)
  WHERE risk_level IN ('medium', 'high', 'prohibited') AND review_decision IS NULL;

-- ---------------------------------------------------------------------------
-- Platform config: withdrawal thresholds, fees, confirmation requirements.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.verdex_custodial_config (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
  deposits_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  withdrawals_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  transfers_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  multisig_threshold_atomic NUMERIC(78,0) NOT NULL DEFAULT 1000000000000000000000
    CHECK (multisig_threshold_atomic > 0),
  multisig_required_signers INTEGER NOT NULL DEFAULT 2
    CHECK (multisig_required_signers BETWEEN 1 AND 15),
  default_required_confirmations INTEGER NOT NULL DEFAULT 12
    CHECK (default_required_confirmations BETWEEN 1 AND 100),
  withdrawal_fee_atomic NUMERIC(78,0) NOT NULL DEFAULT 0,
  transfer_fee_atomic NUMERIC(78,0) NOT NULL DEFAULT 0,
  min_withdrawal_atomic NUMERIC(78,0) NOT NULL DEFAULT 10000000000000000
    CHECK (min_withdrawal_atomic > 0),
  min_transfer_atomic NUMERIC(78,0) NOT NULL DEFAULT 10000000000000000
    CHECK (min_transfer_atomic > 0),
  max_daily_withdrawal_atomic NUMERIC(78,0) NOT NULL DEFAULT 1000000000000000000000,
  aml_screening_threshold_atomic NUMERIC(78,0) NOT NULL DEFAULT 500000000000000000000,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.verdex_custodial_config (singleton) VALUES (TRUE) ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- RPC: Atomic internal transfer (debit sender + credit receiver + log).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.verdex_custodial_transfer(
  p_from_user_id UUID,
  p_to_user_id UUID,
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
  v_from_balance public.verdex_custodial_balances%ROWTYPE;
  v_to_balance public.verdex_custodial_balances%ROWTYPE;
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

  -- Lock both wallets (ordered by ID to prevent deadlocks).
  IF p_from_user_id < p_to_user_id THEN
    SELECT * INTO v_from_wallet FROM public.verdex_custodial_wallets WHERE user_id = p_from_user_id FOR UPDATE;
    SELECT * INTO v_to_wallet FROM public.verdex_custodial_wallets WHERE user_id = p_to_user_id FOR UPDATE;
  ELSE
    SELECT * INTO v_to_wallet FROM public.verdex_custodial_wallets WHERE user_id = p_to_user_id FOR UPDATE;
    SELECT * INTO v_from_wallet FROM public.verdex_custodial_wallets WHERE user_id = p_from_user_id FOR UPDATE;
  END IF;

  IF v_from_wallet.id IS NULL THEN RAISE EXCEPTION 'SENDER_WALLET_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF v_to_wallet.id IS NULL THEN RAISE EXCEPTION 'RECIPIENT_WALLET_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF v_from_wallet.status NOT IN ('active') THEN
    RAISE EXCEPTION 'SENDER_WALLET_NOT_ACTIVE' USING ERRCODE = '55006';
  END IF;
  IF v_to_wallet.status NOT IN ('active') THEN
    RAISE EXCEPTION 'RECIPIENT_WALLET_NOT_ACTIVE' USING ERRCODE = '55006';
  END IF;

  -- Lock both balances.
  SELECT * INTO v_from_balance FROM public.verdex_custodial_balances WHERE wallet_id = v_from_wallet.id FOR UPDATE;
  SELECT * INTO v_to_balance FROM public.verdex_custodial_balances WHERE wallet_id = v_to_wallet.id FOR UPDATE;

  IF v_from_balance.id IS NULL THEN RAISE EXCEPTION 'SENDER_BALANCE_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF v_to_balance.id IS NULL THEN RAISE EXCEPTION 'RECIPIENT_BALANCE_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;

  IF v_from_balance.available_atomic < v_total THEN
    RAISE EXCEPTION 'INSUFFICIENT_BALANCE: available %, required %',
      v_from_balance.available_atomic, v_total USING ERRCODE = '23514';
  END IF;

  -- Debit sender, credit receiver.
  UPDATE public.verdex_custodial_balances
    SET available_atomic = available_atomic - v_total,
        total_lifetime_transferred_out_atomic = total_lifetime_transferred_out_atomic + p_amount_atomic,
        last_transfer_at = now(),
        version = version + 1
    WHERE wallet_id = v_from_wallet.id
    RETURNING available_atomic INTO v_from_balance.available_atomic;

  UPDATE public.verdex_custodial_balances
    SET available_atomic = available_atomic + p_amount_atomic,
        total_lifetime_transferred_in_atomic = total_lifetime_transferred_in_atomic + p_amount_atomic,
        last_transfer_at = now(),
        version = version + 1
    WHERE wallet_id = v_to_wallet.id
    RETURNING available_atomic INTO v_to_balance.available_atomic;

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

  -- Log transactions for both parties.
  INSERT INTO public.verdex_custodial_transactions (
    wallet_id, user_id, tx_type, tx_status, amount_atomic, fee_atomic,
    direction, counterparty_user_id, related_transfer_id, memo, balance_after_atomic
  ) VALUES
    (v_from_wallet.id, p_from_user_id, 'transfer_out'::public.verdex_custodial_tx_type,
     'completed'::public.verdex_custodial_tx_status, p_amount_atomic, COALESCE(p_fee_atomic, 0),
     'outgoing', p_to_user_id, v_transfer_id, p_memo, v_from_balance.available_atomic),
    (v_to_wallet.id, p_to_user_id, 'transfer_in'::public.verdex_custodial_tx_type,
     'completed'::public.verdex_custodial_tx_status, p_amount_atomic, 0,
     'incoming', p_from_user_id, v_transfer_id, p_memo, v_to_balance.available_atomic);

  RETURN QUERY SELECT v_transfer_id, 'completed'::public.verdex_custodial_transfer_status,
                      v_from_balance.available_atomic, v_to_balance.available_atomic;
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC: Credit balance on deposit confirmation (called by deposit worker).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.verdex_custodial_credit_deposit(
  p_wallet_id UUID,
  p_deposit_id UUID,
  p_amount_atomic NUMERIC(78,0)
)
RETURNS TABLE(balance_after NUMERIC(78,0))
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions, public
AS $$
DECLARE
  v_balance public.verdex_custodial_balances%ROWTYPE;
  v_wallet public.verdex_custodial_wallets%ROWTYPE;
  v_deposit public.verdex_custodial_deposits%ROWTYPE;
  v_user_id UUID;
BEGIN
  SELECT * INTO v_deposit FROM public.verdex_custodial_deposits WHERE id = p_deposit_id FOR UPDATE;
  IF v_deposit.id IS NULL THEN RAISE EXCEPTION 'DEPOSIT_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF v_deposit.status = 'credited' THEN
    -- Idempotent: already credited.
    SELECT available_atomic INTO v_balance.available_atomic
    FROM public.verdex_custodial_balances WHERE wallet_id = p_wallet_id;
    RETURN QUERY SELECT v_balance.available_atomic;
    RETURN;
  END IF;

  SELECT * INTO v_wallet FROM public.verdex_custodial_wallets WHERE id = p_wallet_id FOR UPDATE;
  v_user_id := v_wallet.user_id;

  SELECT * INTO v_balance FROM public.verdex_custodial_balances WHERE wallet_id = p_wallet_id FOR UPDATE;
  IF v_balance.id IS NULL THEN RAISE EXCEPTION 'BALANCE_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;

  -- Move from pending → available (deposit was in pending during confirmation).
  UPDATE public.verdex_custodial_balances
    SET pending_atomic = GREATEST(pending_atomic - p_amount_atomic, 0),
        available_atomic = available_atomic + p_amount_atomic,
        total_lifetime_deposited_atomic = total_lifetime_deposited_atomic + p_amount_atomic,
        last_deposit_at = now(),
        version = version + 1
    WHERE wallet_id = p_wallet_id
    RETURNING available_atomic INTO v_balance.available_atomic;

  -- Mark deposit as credited.
  UPDATE public.verdex_custodial_deposits
    SET status = 'credited'::public.verdex_custodial_deposit_status, credited_at = now()
    WHERE id = p_deposit_id;

  -- Log transaction.
  INSERT INTO public.verdex_custodial_transactions (
    wallet_id, user_id, tx_type, tx_status, amount_atomic, direction,
    counterparty_address, related_deposit_id, tx_hash, block_number, balance_after_atomic
  ) VALUES (
    p_wallet_id, v_user_id, 'deposit'::public.verdex_custodial_tx_type,
    'confirmed'::public.verdex_custodial_tx_status, p_amount_atomic, 'incoming',
    v_deposit.from_address, p_deposit_id, v_deposit.tx_hash, v_deposit.block_number,
    v_balance.available_atomic
  );

  RETURN QUERY SELECT v_balance.available_atomic;
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC: Lock balance for a pending withdrawal.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.verdex_custodial_lock_for_withdrawal(
  p_wallet_id UUID,
  p_amount_atomic NUMERIC(78,0)
)
RETURNS TABLE(success BOOLEAN, balance_after_available NUMERIC(78,0), balance_after_locked NUMERIC(78,0))
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions, public
AS $$
DECLARE
  v_balance public.verdex_custodial_balances%ROWTYPE;
BEGIN
  SELECT * INTO v_balance FROM public.verdex_custodial_balances WHERE wallet_id = p_wallet_id FOR UPDATE;
  IF v_balance.id IS NULL THEN RAISE EXCEPTION 'BALANCE_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;

  IF v_balance.available_atomic < p_amount_atomic THEN
    RETURN QUERY SELECT FALSE, v_balance.available_atomic, v_balance.locked_atomic;
    RETURN;
  END IF;

  UPDATE public.verdex_custodial_balances
    SET available_atomic = available_atomic - p_amount_atomic,
        locked_atomic = locked_atomic + p_amount_atomic,
        version = version + 1
    WHERE wallet_id = p_wallet_id
    RETURNING available_atomic, locked_atomic INTO v_balance.available_atomic, v_balance.locked_atomic;

  RETURN QUERY SELECT TRUE, v_balance.available_atomic, v_balance.locked_atomic;
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC: Complete a withdrawal (deduct locked, record tx hash).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.verdex_custodial_complete_withdrawal(
  p_withdrawal_id UUID,
  p_tx_hash TEXT
)
RETURNS TABLE(balance_after_locked NUMERIC(78,0))
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions, public
AS $$
DECLARE
  v_withdrawal public.verdex_custodial_withdrawals%ROWTYPE;
  v_balance public.verdex_custodial_balances%ROWTYPE;
BEGIN
  SELECT * INTO v_withdrawal FROM public.verdex_custodial_withdrawals WHERE id = p_withdrawal_id FOR UPDATE;
  IF v_withdrawal.id IS NULL THEN RAISE EXCEPTION 'WITHDRAWAL_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF v_withdrawal.status NOT IN ('processing', 'broadcast') THEN
    RAISE EXCEPTION 'WITHDRAWAL_NOT_PROCESSING: status is %', v_withdrawal.status USING ERRCODE = '55006';
  END IF;

  SELECT * INTO v_balance FROM public.verdex_custodial_balances WHERE wallet_id = v_withdrawal.wallet_id FOR UPDATE;

  UPDATE public.verdex_custodial_balances
    SET locked_atomic = GREATEST(locked_atomic - v_withdrawal.total_atomic, 0),
        total_lifetime_withdrawn_atomic = total_lifetime_withdrawn_atomic + v_withdrawal.amount_atomic,
        last_withdrawal_at = now(),
        version = version + 1
    WHERE wallet_id = v_withdrawal.wallet_id
    RETURNING locked_atomic INTO v_balance.locked_atomic;

  UPDATE public.verdex_custodial_withdrawals
    SET status = 'completed'::public.verdex_custodial_withdrawal_status,
        tx_hash = p_tx_hash, completed_at = now()
    WHERE id = p_withdrawal_id;

  INSERT INTO public.verdex_custodial_transactions (
    wallet_id, user_id, tx_type, tx_status, amount_atomic, fee_atomic,
    direction, counterparty_address, related_withdrawal_id, tx_hash, balance_after_locked
  ) VALUES (
    v_withdrawal.wallet_id, v_withdrawal.user_id,
    'withdrawal'::public.verdex_custodial_tx_type,
    'completed'::public.verdex_custodial_tx_status,
    v_withdrawal.amount_atomic, v_withdrawal.fee_atomic,
    'outgoing', v_withdrawal.destination_address, p_withdrawal_id, p_tx_hash,
    v_balance.locked_atomic
  );

  RETURN QUERY SELECT v_balance.locked_atomic;
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC: Reject/cancel a withdrawal (unlock funds).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.verdex_custodial_cancel_withdrawal(
  p_withdrawal_id UUID,
  p_reason TEXT,
  p_rejected_by UUID
)
RETURNS TABLE(balance_after_available NUMERIC(78,0))
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions, public
AS $$
DECLARE
  v_withdrawal public.verdex_custodial_withdrawals%ROWTYPE;
  v_balance public.verdex_custodial_balances%ROWTYPE;
BEGIN
  SELECT * INTO v_withdrawal FROM public.verdex_custodial_withdrawals WHERE id = p_withdrawal_id FOR UPDATE;
  IF v_withdrawal.id IS NULL THEN RAISE EXCEPTION 'WITHDRAWAL_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF v_withdrawal.status IN ('completed', 'rejected', 'cancelled') THEN
    RAISE EXCEPTION 'WITHDRAWAL_ALREADY_TERMINAL: %', v_withdrawal.status USING ERRCODE = '55006';
  END IF;

  SELECT * INTO v_balance FROM public.verdex_custodial_balances WHERE wallet_id = v_withdrawal.wallet_id FOR UPDATE;

  -- Unlock the funds.
  UPDATE public.verdex_custodial_balances
    SET locked_atomic = GREATEST(locked_atomic - v_withdrawal.total_atomic, 0),
        available_atomic = available_atomic + v_withdrawal.total_atomic,
        version = version + 1
    WHERE wallet_id = v_withdrawal.wallet_id
    RETURNING available_atomic INTO v_balance.available_atomic;

  UPDATE public.verdex_custodial_withdrawals
    SET status = 'rejected'::public.verdex_custodial_withdrawal_status,
        rejection_reason = p_reason, rejected_by = p_rejected_by, failed_at = now()
    WHERE id = p_withdrawal_id;

  RETURN QUERY SELECT v_balance.available_atomic;
END;
$$;

-- ---------------------------------------------------------------------------
-- Triggers: updated_at + append-only guards.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.verdex_custodial_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public, pg_catalog
AS $$ BEGIN NEW.updated_at := now(); RETURN NEW; END; $$;

DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'verdex_custodial_wallets','verdex_custodial_balances','verdex_custodial_deposits',
    'verdex_custodial_withdrawals','verdex_custodial_transfers','verdex_custodial_transactions',
    'verdex_custodial_treasury_signers','verdex_custodial_aml_screenings','verdex_custodial_config',
    'verdex_custodial_key_store'
  ]) LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_touch_updated_at ON public.%I;', t || '_touch', t);
    EXECUTE format('CREATE TRIGGER %I_touch_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.verdex_custodial_touch_updated_at();', t || '_touch', t);
  END LOOP;
END $$;

-- Append-only: treasury signatures never updated/deleted.
DROP TRIGGER IF EXISTS verdex_custodial_treasury_sigs_append_only ON public.verdex_custodial_treasury_signatures;
CREATE TRIGGER verdex_custodial_treasury_sigs_append_only
  BEFORE UPDATE OR DELETE ON public.verdex_custodial_treasury_signatures
  FOR EACH ROW EXECUTE FUNCTION public.verdex_reject_append_only_mutation();

-- ---------------------------------------------------------------------------
-- RLS: all tables are server-side only (service_role bypasses RLS).
-- Clients interact through authenticated API endpoints only.
-- ---------------------------------------------------------------------------
DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'verdex_custodial_wallets','verdex_custodial_balances','verdex_custodial_deposits',
    'verdex_custodial_withdrawals','verdex_custodial_transfers','verdex_custodial_transactions',
    'verdex_custodial_treasury_signers','verdex_custodial_treasury_signatures',
    'verdex_custodial_aml_screenings','verdex_custodial_config','verdex_custodial_key_store'
  ]) LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated;', t);
  END LOOP;
END $$;

-- Clients can SELECT their own wallet, balance, and transaction history.
GRANT SELECT ON public.verdex_custodial_wallets TO authenticated;
GRANT SELECT ON public.verdex_custodial_balances TO authenticated;
GRANT SELECT ON public.verdex_custodial_deposits TO authenticated;
GRANT SELECT ON public.verdex_custodial_withdrawals TO authenticated;
GRANT SELECT ON public.verdex_custodial_transfers TO authenticated;
GRANT SELECT ON public.verdex_custodial_transactions TO authenticated;

CREATE POLICY verdex_custodial_wallets_select_self
  ON public.verdex_custodial_wallets FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY verdex_custodial_balances_select_self
  ON public.verdex_custodial_balances FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.verdex_custodial_wallets w WHERE w.id = wallet_id AND w.user_id = auth.uid()));

CREATE POLICY verdex_custodial_deposits_select_self
  ON public.verdex_custodial_deposits FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY verdex_custodial_withdrawals_select_self
  ON public.verdex_custodial_withdrawals FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY verdex_custodial_transfers_select_self
  ON public.verdex_custodial_transfers FOR SELECT TO authenticated
  USING (from_user_id = auth.uid() OR to_user_id = auth.uid());

CREATE POLICY verdex_custodial_transactions_select_self
  ON public.verdex_custodial_transactions FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Grant EXECUTE on RPCs to service_role only.
REVOKE ALL ON FUNCTION public.verdex_custodial_transfer(UUID, UUID, NUMERIC(78,0), NUMERIC(78,0), TEXT, UUID) FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.verdex_custodial_transfer(UUID, UUID, NUMERIC(78,0), NUMERIC(78,0), TEXT, UUID) TO service_role;

REVOKE ALL ON FUNCTION public.verdex_custodial_credit_deposit(UUID, UUID, NUMERIC(78,0)) FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.verdex_custodial_credit_deposit(UUID, UUID, NUMERIC(78,0)) TO service_role;

REVOKE ALL ON FUNCTION public.verdex_custodial_lock_for_withdrawal(UUID, NUMERIC(78,0)) FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.verdex_custodial_lock_for_withdrawal(UUID, NUMERIC(78,0)) TO service_role;

REVOKE ALL ON FUNCTION public.verdex_custodial_complete_withdrawal(UUID, TEXT) FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.verdex_custodial_complete_withdrawal(UUID, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.verdex_custodial_cancel_withdrawal(UUID, TEXT, UUID) FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.verdex_custodial_cancel_withdrawal(UUID, TEXT, UUID) TO service_role;

COMMENT ON TABLE public.verdex_custodial_key_store IS
  'Encrypted HD master seed. The encryption key lives ONLY in the deployment environment. NEVER store the plaintext seed or the master key in the database.';
COMMENT ON TABLE public.verdex_custodial_wallets IS
  'User custodial wallet records. Stores derivation index + deposit address only — never private keys.';
COMMENT ON TABLE public.verdex_custodial_balances IS
  'Custodial balance ledger. available + pending + locked. Modified only by RPC functions to guarantee atomicity.';
COMMENT ON TABLE public.verdex_custodial_withdrawals IS
  'Withdrawal requests with KYC/AML hooks and multi-sig treasury approval workflow.';

COMMIT;
