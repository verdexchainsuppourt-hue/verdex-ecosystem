-- ============================================================================
-- KYC identity profile ciphertext + P2P mainnet chain alignment (additive)
-- Depends on: 20260718113000_p2p_kyc_aml_rbac_foundation.sql
-- ============================================================================

BEGIN;

-- Optional nationality on case for country policy (non-PII code only)
ALTER TABLE public.verdex_kyc_cases
  ADD COLUMN IF NOT EXISTS nationality_code CHAR(2);

-- Application-layer encrypted identity profile (no plaintext legal name in DB)
CREATE TABLE IF NOT EXISTS public.kyc_identity_profiles (
  case_id UUID PRIMARY KEY REFERENCES public.verdex_kyc_cases(id) ON DELETE RESTRICT,
  legal_name_ciphertext BYTEA NOT NULL,
  date_of_birth_ciphertext BYTEA NOT NULL,
  address_ciphertext BYTEA,
  nationality_ciphertext BYTEA,
  encryption_key_id TEXT NOT NULL,
  google_subject_hash BYTEA,
  google_email_hash BYTEA,
  user_confirmed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  document_type TEXT CHECK (
    document_type IS NULL OR document_type IN ('passport', 'national_id', 'driver_licence')
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.kyc_identity_profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.kyc_identity_profiles FROM anon, authenticated;
-- No client SELECT: only service role / moderators via API

-- Chain alignment for escrow indexer (P2P)
ALTER TABLE public.verdex_p2p_escrows
  ADD COLUMN IF NOT EXISTS on_chain_escrow_id TEXT,
  ADD COLUMN IF NOT EXISTS trade_reference_bytes32 TEXT
    CHECK (trade_reference_bytes32 IS NULL OR trade_reference_bytes32 ~ '^0x[0-9a-f]{64}$'),
  ADD COLUMN IF NOT EXISTS seller_address TEXT,
  ADD COLUMN IF NOT EXISTS buyer_address TEXT,
  ADD COLUMN IF NOT EXISTS payment_deadline_unix BIGINT,
  ADD COLUMN IF NOT EXISTS resolution_nonce BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS on_chain_state TEXT
    CHECK (on_chain_state IS NULL OR on_chain_state IN (
      'none','funded','payment_marked','disputed','released','refunded'
    )),
  ADD COLUMN IF NOT EXISTS deposit_block BIGINT,
  ADD COLUMN IF NOT EXISTS deposit_log_index INTEGER,
  ADD COLUMN IF NOT EXISTS finalized_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS verdex_p2p_escrows_on_chain_id_uidx
  ON public.verdex_p2p_escrows (chain_id, on_chain_escrow_id)
  WHERE on_chain_escrow_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS verdex_p2p_escrows_trade_ref_uidx
  ON public.verdex_p2p_escrows (trade_reference_bytes32)
  WHERE trade_reference_bytes32 IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.verdex_chain_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id BIGINT NOT NULL,
  tx_hash TEXT NOT NULL,
  log_index INTEGER NOT NULL,
  block_number BIGINT NOT NULL,
  block_hash TEXT NOT NULL,
  contract_address TEXT NOT NULL,
  event_name TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  finalized_at TIMESTAMPTZ,
  orphaned_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (chain_id, tx_hash, log_index)
);

ALTER TABLE public.verdex_chain_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.verdex_chain_events FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.verdex_trade_attestations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id UUID NOT NULL UNIQUE REFERENCES public.verdex_p2p_trades(id),
  attestor_address TEXT NOT NULL,
  authorization_deadline TIMESTAMPTZ NOT NULL,
  payment_deadline TIMESTAMPTZ NOT NULL,
  trade_reference_bytes32 TEXT NOT NULL,
  digest_hex TEXT NOT NULL,
  signature_hex TEXT NOT NULL,
  consumed_on_chain BOOLEAN NOT NULL DEFAULT FALSE,
  consumed_tx_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

ALTER TABLE public.verdex_trade_attestations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.verdex_trade_attestations FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.verdex_wallet_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  chain_id BIGINT NOT NULL,
  address TEXT NOT NULL,
  custody_type TEXT NOT NULL CHECK (custody_type IN ('self_custody','external_wallet')),
  status TEXT NOT NULL CHECK (status IN ('active','replaced','blocked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (chain_id, address)
);

ALTER TABLE public.verdex_wallet_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.verdex_wallet_accounts FROM anon, authenticated;
GRANT SELECT ON TABLE public.verdex_wallet_accounts TO authenticated;

CREATE POLICY verdex_wallet_accounts_select_owner
  ON public.verdex_wallet_accounts
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Private storage buckets (create via dashboard if storage API migration not available)
-- Bucket names: verdex-kyc-private, verdex-p2p-dispute-private
-- Public access: OFF. MIME allowlist enforced in API.

COMMIT;
