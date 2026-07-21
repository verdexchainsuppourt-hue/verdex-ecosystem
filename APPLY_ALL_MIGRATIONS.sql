-- ============================================================
-- VERDEX � APPLY ALL MIGRATIONS
-- Paste this ENTIRE file into Supabase Dashboard > SQL Editor > New query
-- Click RUN. Safe to re-run (all statements use IF NOT EXISTS).
-- ============================================================
-- ============================================================
-- MIGRATION: 20260718113000_p2p_kyc_aml_rbac_foundation.sql
-- ============================================================
-- ============================================================================
-- Verdex production P2P / KYC / AML / RBAC foundation
--
-- This migration is deliberately self-contained and fail closed.  It creates
-- no staff account, enables no marketplace access, and stores no private keys,
-- document bytes, biometric templates, payment credentials, or raw IP address.
--
-- All writes to these tables are server-side responsibilities.  Mobile/web
-- clients receive SELECT-only table grants and must use authenticated Edge/API
-- endpoints for KYC submission, moderation, trade transitions, and outbox work.
-- A Supabase service-role backend bypasses RLS, so it must enforce the same
-- authorization checks before it writes and must call verdex_record_audit_event
-- in the same transaction.
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Keep types scoped and explicit.  The guarded definitions make the migration
-- safe to re-run in a manually recovered environment without changing values.
DO $$
BEGIN
  CREATE TYPE public.verdex_staff_role AS ENUM ('administrator', 'moderator');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE public.verdex_staff_assignment_status AS ENUM ('active', 'suspended', 'revoked');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE public.verdex_kyc_case_status AS ENUM (
    'draft', 'collecting', 'submitted', 'in_review', 'needs_resubmission',
    'approved', 'rejected', 'withdrawn', 'expired'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE public.verdex_kyc_evidence_kind AS ENUM (
    'identity_document_front', 'identity_document_back', 'selfie_image',
    'liveness_video', 'proof_of_address', 'supporting_document'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE public.verdex_aml_check_status AS ENUM (
    'not_started', 'pending', 'clear', 'review_required', 'potential_match',
    'blocked', 'expired', 'error'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE public.verdex_p2p_entitlement_state AS ENUM (
    'not_eligible', 'pending', 'eligible', 'suspended', 'revoked', 'expired'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE public.verdex_listing_access_mode AS ENUM (
    'disabled', 'explicit_allowlist', 'verified_users', 'staff_only'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE public.verdex_p2p_order_side AS ENUM ('buy_vdx', 'sell_vdx');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE public.verdex_p2p_order_status AS ENUM (
    'draft', 'open', 'paused', 'filled', 'cancelled', 'suspended', 'rejected', 'expired'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE public.verdex_p2p_trade_status AS ENUM (
    'initiated', 'awaiting_escrow', 'escrow_locked', 'payment_pending',
    'payment_marked_sent', 'payment_confirmed', 'release_pending', 'released',
    'cancel_requested', 'cancelled', 'disputed', 'resolved', 'expired', 'failed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE public.verdex_escrow_status AS ENUM (
    'not_required', 'awaiting_deposit', 'deposit_detected', 'locked',
    'release_authorized', 'released', 'refund_authorized', 'refunded',
    'expired', 'failed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE public.verdex_dispute_status AS ENUM (
    'opened', 'evidence_collection', 'under_review', 'awaiting_party',
    'resolved', 'closed', 'escalated'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE public.verdex_dispute_resolution AS ENUM (
    'release_to_seller', 'refund_to_buyer', 'partial_settlement', 'cancel_trade', 'no_action'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE public.verdex_notification_channel AS ENUM ('push', 'email', 'in_app');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE public.verdex_notification_status AS ENUM (
    'pending', 'processing', 'sent', 'failed', 'dead_letter', 'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE public.verdex_idempotency_status AS ENUM ('in_progress', 'completed', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- --------------------------------------------------------------------------
-- Staff RBAC and P2P launch controls
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.verdex_staff_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  role public.verdex_staff_role NOT NULL,
  assignment_status public.verdex_staff_assignment_status NOT NULL DEFAULT 'active',
  granted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  revocation_reason_code TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT verdex_staff_roles_expiry_check CHECK (expires_at IS NULL OR expires_at > granted_at),
  CONSTRAINT verdex_staff_roles_revocation_check CHECK (
    (assignment_status <> 'revoked' AND revoked_at IS NULL)
    OR (assignment_status = 'revoked' AND revoked_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS verdex_staff_roles_one_active_role_per_user_idx
  ON public.verdex_staff_roles (user_id, role)
  WHERE assignment_status = 'active';

CREATE INDEX IF NOT EXISTS verdex_staff_roles_active_lookup_idx
  ON public.verdex_staff_roles (user_id, role, expires_at)
  WHERE assignment_status = 'active';

CREATE TABLE IF NOT EXISTS public.verdex_p2p_platform_policy (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
  p2p_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  listing_access_mode public.verdex_listing_access_mode NOT NULL DEFAULT 'explicit_allowlist',
  require_kyc BOOLEAN NOT NULL DEFAULT TRUE,
  require_aml_clear BOOLEAN NOT NULL DEFAULT TRUE,
  max_open_orders_per_user INTEGER NOT NULL DEFAULT 3 CHECK (max_open_orders_per_user BETWEEN 1 AND 100),
  default_trade_expiry_minutes INTEGER NOT NULL DEFAULT 30 CHECK (default_trade_expiry_minutes BETWEEN 5 AND 1440),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.verdex_p2p_platform_policy (singleton)
VALUES (TRUE)
ON CONFLICT (singleton) DO NOTHING;

-- The two initial official listing accounts are represented by UUID grants,
-- never hard-coded email strings.  Seed exactly two active rows after resolving
-- their auth.users IDs through an offline, access-controlled administrator flow.
CREATE TABLE IF NOT EXISTS public.verdex_p2p_listing_creator_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  reason_code TEXT NOT NULL DEFAULT 'initial_launch_allowlist',
  granted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT verdex_p2p_listing_grant_expiry_check CHECK (expires_at IS NULL OR expires_at > granted_at),
  CONSTRAINT verdex_p2p_listing_grant_revocation_check CHECK (
    (is_active AND revoked_at IS NULL AND revoked_by IS NULL)
    OR (NOT is_active AND (revoked_at IS NULL OR revoked_by IS NOT NULL))
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS verdex_p2p_listing_creator_active_grant_idx
  ON public.verdex_p2p_listing_creator_grants (user_id)
  WHERE is_active;

-- --------------------------------------------------------------------------
-- KYC and AML metadata.  Evidence is object metadata only; file bytes belong
-- in a private storage bucket with signed URL access issued by a server API.
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.verdex_kyc_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  status public.verdex_kyc_case_status NOT NULL DEFAULT 'draft',
  country_code TEXT NOT NULL CHECK (country_code ~ '^[A-Z]{2}$'),
  verification_level TEXT NOT NULL DEFAULT 'standard'
    CHECK (verification_level IN ('basic', 'standard', 'enhanced')),
  provider_name TEXT NOT NULL DEFAULT 'manual_internal' CHECK (char_length(provider_name) BETWEEN 1 AND 80),
  provider_case_reference TEXT UNIQUE,
  risk_tier TEXT NOT NULL DEFAULT 'unassessed'
    CHECK (risk_tier IN ('unassessed', 'low', 'medium', 'high', 'prohibited')),
  submitted_at TIMESTAMPTZ,
  review_started_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  reviewer_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  decision_reason_code TEXT,
  -- Ciphertext only; the envelope key identifier is safe to retain, the key is not.
  reviewer_note_ciphertext TEXT CHECK (reviewer_note_ciphertext IS NULL OR char_length(reviewer_note_ciphertext) <= 16384),
  reviewer_note_key_version TEXT CHECK (reviewer_note_key_version IS NULL OR char_length(reviewer_note_key_version) <= 100),
  expires_at TIMESTAMPTZ,
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT verdex_kyc_cases_submission_check CHECK (
    submitted_at IS NULL OR submitted_at >= created_at
  ),
  CONSTRAINT verdex_kyc_cases_review_check CHECK (
    reviewed_at IS NULL OR review_started_at IS NULL OR reviewed_at >= review_started_at
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS verdex_kyc_cases_one_active_case_per_user_idx
  ON public.verdex_kyc_cases (subject_user_id)
  WHERE status IN ('draft', 'collecting', 'submitted', 'in_review', 'needs_resubmission');

CREATE INDEX IF NOT EXISTS verdex_kyc_cases_review_queue_idx
  ON public.verdex_kyc_cases (status, submitted_at, created_at)
  WHERE status IN ('submitted', 'in_review', 'needs_resubmission');

CREATE TABLE IF NOT EXISTS public.verdex_kyc_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES public.verdex_kyc_cases(id) ON DELETE RESTRICT,
  subject_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  evidence_kind public.verdex_kyc_evidence_kind NOT NULL,
  evidence_version SMALLINT NOT NULL DEFAULT 1 CHECK (evidence_version > 0),
  storage_bucket TEXT NOT NULL DEFAULT 'verdex-kyc-private' CHECK (storage_bucket = 'verdex-kyc-private'),
  storage_object_key TEXT NOT NULL UNIQUE CHECK (
    storage_object_key ~ '^kyc/[A-Za-z0-9][A-Za-z0-9._/-]*$'
    AND position('..' IN storage_object_key) = 0
  ),
  checksum_sha256 TEXT NOT NULL CHECK (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  content_type TEXT NOT NULL CHECK (content_type ~ '^[a-z0-9][a-z0-9.+-]*/[a-z0-9][a-z0-9.+-]*$'),
  byte_size BIGINT NOT NULL CHECK (byte_size > 0 AND byte_size <= 26214400),
  provider_asset_reference TEXT UNIQUE,
  capture_metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(capture_metadata) = 'object'),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  verified_at TIMESTAMPTZ,
  superseded_at TIMESTAMPTZ,
  redacted_at TIMESTAMPTZ,
  redaction_reason_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT verdex_kyc_evidence_redaction_check CHECK (
    redacted_at IS NULL OR redaction_reason_code IS NOT NULL
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS verdex_kyc_evidence_current_kind_idx
  ON public.verdex_kyc_evidence (case_id, evidence_kind)
  WHERE superseded_at IS NULL AND redacted_at IS NULL;

CREATE INDEX IF NOT EXISTS verdex_kyc_evidence_case_idx
  ON public.verdex_kyc_evidence (case_id, evidence_kind, evidence_version DESC);

CREATE TABLE IF NOT EXISTS public.verdex_kyc_review_actions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  case_id UUID NOT NULL REFERENCES public.verdex_kyc_cases(id) ON DELETE RESTRICT,
  reviewer_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  action TEXT NOT NULL CHECK (action IN (
    'assigned', 'requested_resubmission', 'approved', 'rejected', 'expired', 'reopened'
  )),
  from_status public.verdex_kyc_case_status,
  to_status public.verdex_kyc_case_status,
  document_confidence NUMERIC(5,4) CHECK (document_confidence IS NULL OR document_confidence BETWEEN 0 AND 1),
  face_match_confidence NUMERIC(5,4) CHECK (face_match_confidence IS NULL OR face_match_confidence BETWEEN 0 AND 1),
  liveness_confidence NUMERIC(5,4) CHECK (liveness_confidence IS NULL OR liveness_confidence BETWEEN 0 AND 1),
  reason_code TEXT,
  note_ciphertext TEXT CHECK (note_ciphertext IS NULL OR char_length(note_ciphertext) <= 16384),
  note_key_version TEXT CHECK (note_key_version IS NULL OR char_length(note_key_version) <= 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS verdex_kyc_review_actions_case_idx
  ON public.verdex_kyc_review_actions (case_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.verdex_aml_screenings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  kyc_case_id UUID REFERENCES public.verdex_kyc_cases(id) ON DELETE SET NULL,
  screening_purpose TEXT NOT NULL DEFAULT 'onboarding'
    CHECK (screening_purpose IN ('onboarding', 'p2p_revalidation', 'trade_review', 'manual_review')),
  status public.verdex_aml_check_status NOT NULL DEFAULT 'not_started',
  provider_name TEXT NOT NULL DEFAULT 'manual_internal' CHECK (char_length(provider_name) BETWEEN 1 AND 80),
  provider_reference TEXT UNIQUE,
  result_digest_sha256 TEXT CHECK (result_digest_sha256 IS NULL OR result_digest_sha256 ~ '^[0-9a-f]{64}$'),
  risk_score NUMERIC(5,2) CHECK (risk_score IS NULL OR risk_score BETWEEN 0 AND 100),
  match_confidence NUMERIC(5,4) CHECK (match_confidence IS NULL OR match_confidence BETWEEN 0 AND 1),
  reason_code TEXT,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  screened_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT verdex_aml_screenings_review_check CHECK (
    reviewed_at IS NULL OR screened_at IS NULL OR reviewed_at >= screened_at
  )
);

CREATE INDEX IF NOT EXISTS verdex_aml_screenings_subject_idx
  ON public.verdex_aml_screenings (subject_user_id, status, expires_at DESC);

CREATE INDEX IF NOT EXISTS verdex_aml_screenings_review_queue_idx
  ON public.verdex_aml_screenings (status, created_at)
  WHERE status IN ('pending', 'review_required', 'potential_match');

-- --------------------------------------------------------------------------
-- P2P eligibility, order book, escrow lifecycle, and disputes.
-- No wallet signing material or payment account details are stored here.
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.verdex_p2p_entitlements (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT,
  state public.verdex_p2p_entitlement_state NOT NULL DEFAULT 'not_eligible',
  kyc_case_id UUID REFERENCES public.verdex_kyc_cases(id) ON DELETE SET NULL,
  aml_screening_id UUID REFERENCES public.verdex_aml_screenings(id) ON DELETE SET NULL,
  decision_reason_code TEXT,
  decided_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  suspended_at TIMESTAMPTZ,
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT verdex_p2p_entitlements_decision_check CHECK (
    (state IN ('not_eligible', 'pending') AND decided_at IS NULL)
    OR (state NOT IN ('not_eligible', 'pending') AND decided_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS verdex_p2p_entitlements_state_idx
  ON public.verdex_p2p_entitlements (state, expires_at);

CREATE TABLE IF NOT EXISTS public.verdex_p2p_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  public_reference TEXT NOT NULL UNIQUE DEFAULT (
    'VDX-' || upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 16))
  ),
  creator_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  side public.verdex_p2p_order_side NOT NULL,
  status public.verdex_p2p_order_status NOT NULL DEFAULT 'draft',
  asset_symbol TEXT NOT NULL DEFAULT 'VDX' CHECK (asset_symbol = 'VDX'),
  token_amount_atomic NUMERIC(78,0) NOT NULL CHECK (token_amount_atomic > 0),
  remaining_amount_atomic NUMERIC(78,0) NOT NULL CHECK (
    remaining_amount_atomic >= 0 AND remaining_amount_atomic <= token_amount_atomic
  ),
  minimum_trade_amount_atomic NUMERIC(78,0) NOT NULL CHECK (
    minimum_trade_amount_atomic > 0 AND minimum_trade_amount_atomic <= token_amount_atomic
  ),
  fiat_currency TEXT NOT NULL CHECK (fiat_currency ~ '^[A-Z]{3}$'),
  fiat_price_per_vdx NUMERIC(30,8) NOT NULL CHECK (fiat_price_per_vdx > 0),
  payment_method_codes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[] CHECK (cardinality(payment_method_codes) BETWEEN 1 AND 10),
  terms_summary TEXT NOT NULL DEFAULT '' CHECK (char_length(terms_summary) <= 2000),
  escrow_required BOOLEAN NOT NULL DEFAULT TRUE,
  moderation_reason_code TEXT,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 days'),
  opened_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT verdex_p2p_orders_expiry_check CHECK (expires_at > created_at),
  CONSTRAINT verdex_p2p_orders_opened_check CHECK (opened_at IS NULL OR opened_at >= created_at)
);

CREATE INDEX IF NOT EXISTS verdex_p2p_orders_open_book_idx
  ON public.verdex_p2p_orders (side, fiat_currency, fiat_price_per_vdx, created_at DESC)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS verdex_p2p_orders_creator_idx
  ON public.verdex_p2p_orders (creator_user_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.verdex_p2p_trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_reference TEXT NOT NULL UNIQUE DEFAULT (
    'TRD-' || upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 16))
  ),
  order_id UUID NOT NULL REFERENCES public.verdex_p2p_orders(id) ON DELETE RESTRICT,
  buyer_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  seller_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  status public.verdex_p2p_trade_status NOT NULL DEFAULT 'initiated',
  asset_symbol TEXT NOT NULL DEFAULT 'VDX' CHECK (asset_symbol = 'VDX'),
  token_amount_atomic NUMERIC(78,0) NOT NULL CHECK (token_amount_atomic > 0),
  fiat_currency TEXT NOT NULL CHECK (fiat_currency ~ '^[A-Z]{3}$'),
  fiat_amount NUMERIC(30,8) NOT NULL CHECK (fiat_amount > 0),
  payment_method_code TEXT NOT NULL CHECK (char_length(payment_method_code) BETWEEN 1 AND 80),
  -- Encrypted in the application layer; only the authenticated counterpart and
  -- assigned moderator receive a decrypted value through a server endpoint.
  payment_instruction_ciphertext TEXT CHECK (
    payment_instruction_ciphertext IS NULL OR char_length(payment_instruction_ciphertext) <= 32768
  ),
  payment_instruction_key_version TEXT CHECK (
    payment_instruction_key_version IS NULL OR char_length(payment_instruction_key_version) <= 100
  ),
  escrow_deadline_at TIMESTAMPTZ,
  payment_deadline_at TIMESTAMPTZ,
  payment_marked_sent_at TIMESTAMPTZ,
  payment_confirmed_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  expired_at TIMESTAMPTZ,
  dispute_opened_at TIMESTAMPTZ,
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT verdex_p2p_trades_counterparty_check CHECK (buyer_user_id <> seller_user_id),
  CONSTRAINT verdex_p2p_trades_deadline_check CHECK (
    payment_deadline_at IS NULL OR escrow_deadline_at IS NULL OR payment_deadline_at >= escrow_deadline_at
  )
);

CREATE INDEX IF NOT EXISTS verdex_p2p_trades_buyer_idx
  ON public.verdex_p2p_trades (buyer_user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS verdex_p2p_trades_seller_idx
  ON public.verdex_p2p_trades (seller_user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS verdex_p2p_trades_work_queue_idx
  ON public.verdex_p2p_trades (status, updated_at)
  WHERE status IN ('disputed', 'cancel_requested', 'payment_marked_sent', 'release_pending');

CREATE TABLE IF NOT EXISTS public.verdex_p2p_escrows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id UUID NOT NULL UNIQUE REFERENCES public.verdex_p2p_trades(id) ON DELETE RESTRICT,
  status public.verdex_escrow_status NOT NULL DEFAULT 'awaiting_deposit',
  chain_id BIGINT,
  contract_address TEXT CHECK (contract_address IS NULL OR char_length(contract_address) BETWEEN 1 AND 128),
  escrow_reference TEXT NOT NULL UNIQUE DEFAULT (
    'ESC-' || upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 16))
  ),
  token_amount_atomic NUMERIC(78,0) NOT NULL CHECK (token_amount_atomic > 0),
  deposit_tx_hash TEXT CHECK (deposit_tx_hash IS NULL OR char_length(deposit_tx_hash) BETWEEN 8 AND 256),
  release_tx_hash TEXT CHECK (release_tx_hash IS NULL OR char_length(release_tx_hash) BETWEEN 8 AND 256),
  refund_tx_hash TEXT CHECK (refund_tx_hash IS NULL OR char_length(refund_tx_hash) BETWEEN 8 AND 256),
  confirmation_count INTEGER NOT NULL DEFAULT 0 CHECK (confirmation_count >= 0),
  required_confirmations INTEGER NOT NULL DEFAULT 1 CHECK (required_confirmations BETWEEN 1 AND 1000),
  chain_observed_at TIMESTAMPTZ,
  lock_authorized_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  release_authorized_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  refund_authorized_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  failure_reason_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT verdex_p2p_escrows_unique_terminal_tx_check CHECK (
    release_tx_hash IS NULL OR refund_tx_hash IS NULL
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS verdex_p2p_escrows_deposit_tx_idx
  ON public.verdex_p2p_escrows (deposit_tx_hash) WHERE deposit_tx_hash IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS verdex_p2p_escrows_release_tx_idx
  ON public.verdex_p2p_escrows (release_tx_hash) WHERE release_tx_hash IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS verdex_p2p_escrows_refund_tx_idx
  ON public.verdex_p2p_escrows (refund_tx_hash) WHERE refund_tx_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.verdex_p2p_trade_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  trade_id UUID NOT NULL REFERENCES public.verdex_p2p_trades(id) ON DELETE RESTRICT,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_kind TEXT NOT NULL CHECK (actor_kind IN ('user', 'staff', 'system')),
  event_type TEXT NOT NULL CHECK (char_length(event_type) BETWEEN 1 AND 120),
  from_status public.verdex_p2p_trade_status,
  to_status public.verdex_p2p_trade_status,
  event_payload JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(event_payload) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS verdex_p2p_trade_events_trade_idx
  ON public.verdex_p2p_trade_events (trade_id, created_at, id);

CREATE TABLE IF NOT EXISTS public.verdex_p2p_disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id UUID NOT NULL REFERENCES public.verdex_p2p_trades(id) ON DELETE RESTRICT,
  opened_by_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  status public.verdex_dispute_status NOT NULL DEFAULT 'opened',
  category_code TEXT NOT NULL CHECK (char_length(category_code) BETWEEN 1 AND 100),
  summary_ciphertext TEXT CHECK (summary_ciphertext IS NULL OR char_length(summary_ciphertext) <= 16384),
  summary_key_version TEXT CHECK (summary_key_version IS NULL OR char_length(summary_key_version) <= 100),
  assigned_moderator_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ,
  resolution public.verdex_dispute_resolution,
  resolution_reason_code TEXT,
  resolution_note_ciphertext TEXT CHECK (
    resolution_note_ciphertext IS NULL OR char_length(resolution_note_ciphertext) <= 16384
  ),
  resolution_note_key_version TEXT CHECK (
    resolution_note_key_version IS NULL OR char_length(resolution_note_key_version) <= 100
  ),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT verdex_p2p_disputes_resolution_check CHECK (
    (status NOT IN ('resolved', 'closed') AND resolution IS NULL)
    OR (status IN ('resolved', 'closed') AND resolution IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS verdex_p2p_disputes_one_open_per_trade_idx
  ON public.verdex_p2p_disputes (trade_id)
  WHERE status <> 'closed';

CREATE INDEX IF NOT EXISTS verdex_p2p_disputes_moderator_queue_idx
  ON public.verdex_p2p_disputes (status, assigned_moderator_user_id, opened_at)
  WHERE status IN ('opened', 'evidence_collection', 'under_review', 'awaiting_party', 'escalated');

CREATE TABLE IF NOT EXISTS public.verdex_p2p_dispute_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id UUID NOT NULL REFERENCES public.verdex_p2p_disputes(id) ON DELETE RESTRICT,
  submitted_by_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  evidence_kind TEXT NOT NULL CHECK (evidence_kind IN (
    'payment_receipt', 'transaction_record', 'chat_export', 'supporting_document', 'other'
  )),
  storage_bucket TEXT NOT NULL DEFAULT 'verdex-p2p-dispute-private'
    CHECK (storage_bucket = 'verdex-p2p-dispute-private'),
  storage_object_key TEXT NOT NULL UNIQUE CHECK (
    storage_object_key ~ '^p2p/disputes/[A-Za-z0-9][A-Za-z0-9._/-]*$'
    AND position('..' IN storage_object_key) = 0
  ),
  checksum_sha256 TEXT NOT NULL CHECK (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  content_type TEXT NOT NULL CHECK (content_type ~ '^[a-z0-9][a-z0-9.+-]*/[a-z0-9][a-z0-9.+-]*$'),
  byte_size BIGINT NOT NULL CHECK (byte_size > 0 AND byte_size <= 26214400),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  redacted_at TIMESTAMPTZ,
  redaction_reason_code TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT verdex_p2p_dispute_evidence_redaction_check CHECK (
    redacted_at IS NULL OR redaction_reason_code IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS verdex_p2p_dispute_evidence_dispute_idx
  ON public.verdex_p2p_dispute_evidence (dispute_id, submitted_at);

-- --------------------------------------------------------------------------
-- Outbox, idempotency and tamper-evident audit chain.
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.verdex_notification_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel public.verdex_notification_channel NOT NULL,
  template_key TEXT NOT NULL CHECK (char_length(template_key) BETWEEN 1 AND 120),
  dedupe_key TEXT NOT NULL CHECK (char_length(dedupe_key) BETWEEN 1 AND 255),
  -- Payload must contain only template variables.  Never put email addresses,
  -- device tokens, KYC data, raw payment instructions, or secrets in this JSON.
  payload JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  status public.verdex_notification_status NOT NULL DEFAULT 'pending',
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 25),
  not_before TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_at TIMESTAMPTZ,
  lock_token UUID,
  provider_message_id TEXT,
  last_error_code TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT verdex_notification_outbox_lock_check CHECK (
    (locked_at IS NULL AND lock_token IS NULL) OR (locked_at IS NOT NULL AND lock_token IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS verdex_notification_outbox_dedupe_idx
  ON public.verdex_notification_outbox (recipient_user_id, channel, dedupe_key);

CREATE INDEX IF NOT EXISTS verdex_notification_outbox_worker_idx
  ON public.verdex_notification_outbox (status, not_before, created_at)
  WHERE status IN ('pending', 'failed');

CREATE TABLE IF NOT EXISTS public.verdex_api_idempotency_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  operation TEXT NOT NULL CHECK (char_length(operation) BETWEEN 1 AND 120),
  idempotency_key TEXT NOT NULL CHECK (char_length(idempotency_key) BETWEEN 8 AND 255),
  request_hash_sha256 TEXT NOT NULL CHECK (request_hash_sha256 ~ '^[0-9a-f]{64}$'),
  status public.verdex_idempotency_status NOT NULL DEFAULT 'in_progress',
  response_status INTEGER CHECK (response_status IS NULL OR response_status BETWEEN 100 AND 599),
  response_body JSONB CHECK (response_body IS NULL OR jsonb_typeof(response_body) = 'object'),
  locked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '24 hours'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT verdex_api_idempotency_completion_check CHECK (
    (status = 'in_progress' AND completed_at IS NULL)
    OR (status IN ('completed', 'failed') AND completed_at IS NOT NULL)
  ),
  CONSTRAINT verdex_api_idempotency_expiry_check CHECK (expires_at > created_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS verdex_api_idempotency_actor_operation_key_idx
  ON public.verdex_api_idempotency_keys (actor_user_id, operation, idempotency_key);

CREATE INDEX IF NOT EXISTS verdex_api_idempotency_expiry_idx
  ON public.verdex_api_idempotency_keys (expires_at);

CREATE TABLE IF NOT EXISTS public.verdex_audit_chain_state (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
  next_sequence BIGINT NOT NULL DEFAULT 1 CHECK (next_sequence > 0),
  last_event_hash TEXT CHECK (last_event_hash IS NULL OR last_event_hash ~ '^[0-9a-f]{64}$'),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.verdex_audit_chain_state (singleton)
VALUES (TRUE)
ON CONFLICT (singleton) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.verdex_audit_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sequence_number BIGINT NOT NULL UNIQUE,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_kind TEXT NOT NULL CHECK (actor_kind IN ('user', 'staff', 'system')),
  action TEXT NOT NULL CHECK (char_length(action) BETWEEN 1 AND 160),
  resource_type TEXT NOT NULL CHECK (char_length(resource_type) BETWEEN 1 AND 120),
  resource_id TEXT,
  subject_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  outcome TEXT NOT NULL DEFAULT 'success' CHECK (outcome IN ('success', 'denied', 'failure')),
  request_id UUID,
  ip_hash_sha256 TEXT CHECK (ip_hash_sha256 IS NULL OR ip_hash_sha256 ~ '^[0-9a-f]{64}$'),
  user_agent_hash_sha256 TEXT CHECK (user_agent_hash_sha256 IS NULL OR user_agent_hash_sha256 ~ '^[0-9a-f]{64}$'),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  previous_event_hash TEXT CHECK (previous_event_hash IS NULL OR previous_event_hash ~ '^[0-9a-f]{64}$'),
  event_hash TEXT NOT NULL UNIQUE CHECK (event_hash ~ '^[0-9a-f]{64}$')
);

CREATE INDEX IF NOT EXISTS verdex_audit_events_occurred_idx
  ON public.verdex_audit_events (occurred_at DESC, sequence_number DESC);

CREATE INDEX IF NOT EXISTS verdex_audit_events_actor_idx
  ON public.verdex_audit_events (actor_user_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS verdex_audit_events_resource_idx
  ON public.verdex_audit_events (resource_type, resource_id, occurred_at DESC);

-- --------------------------------------------------------------------------
-- Helper functions.  All lookups bind to auth.uid(); callers cannot probe
-- another person's permissions by supplying an arbitrary UUID.
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.verdex_has_staff_role(p_role public.verdex_staff_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, extensions, public
AS $$
  SELECT auth.uid() IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.verdex_staff_roles AS staff_role
       WHERE staff_role.user_id = auth.uid()
         AND staff_role.role = p_role
         AND staff_role.assignment_status = 'active'
         AND (staff_role.expires_at IS NULL OR staff_role.expires_at > now())
     );
$$;

CREATE OR REPLACE FUNCTION public.verdex_is_administrator()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, extensions, public
AS $$
  SELECT public.verdex_has_staff_role('administrator'::public.verdex_staff_role);
$$;

CREATE OR REPLACE FUNCTION public.verdex_is_moderator()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, extensions, public
AS $$
  SELECT public.verdex_has_staff_role('moderator'::public.verdex_staff_role);
$$;

CREATE OR REPLACE FUNCTION public.verdex_current_user_has_p2p_access()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, extensions, public
AS $$
  SELECT auth.uid() IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.verdex_p2p_platform_policy AS policy
       JOIN public.verdex_p2p_entitlements AS entitlement
         ON entitlement.user_id = auth.uid()
       WHERE policy.singleton = TRUE
         AND policy.p2p_enabled = TRUE
         AND entitlement.state = 'eligible'
         AND (entitlement.expires_at IS NULL OR entitlement.expires_at > now())
         AND (
           NOT policy.require_kyc
           OR EXISTS (
             SELECT 1
             FROM public.verdex_kyc_cases AS kyc_case
             WHERE kyc_case.id = entitlement.kyc_case_id
               AND kyc_case.subject_user_id = auth.uid()
               AND kyc_case.status = 'approved'
               AND (kyc_case.expires_at IS NULL OR kyc_case.expires_at > now())
           )
         )
         AND (
           NOT policy.require_aml_clear
           OR EXISTS (
             SELECT 1
             FROM public.verdex_aml_screenings AS aml_screening
             WHERE aml_screening.id = entitlement.aml_screening_id
               AND aml_screening.subject_user_id = auth.uid()
               AND aml_screening.status = 'clear'
               AND (aml_screening.expires_at IS NULL OR aml_screening.expires_at > now())
           )
         )
     );
$$;

CREATE OR REPLACE FUNCTION public.verdex_current_user_can_create_p2p_listing()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, extensions, public
AS $$
  SELECT auth.uid() IS NOT NULL
     AND public.verdex_current_user_has_p2p_access()
     AND EXISTS (
       SELECT 1
       FROM public.verdex_p2p_platform_policy AS policy
       WHERE policy.singleton = TRUE
         AND CASE policy.listing_access_mode
           WHEN 'disabled'::public.verdex_listing_access_mode THEN FALSE
           WHEN 'verified_users'::public.verdex_listing_access_mode THEN TRUE
           WHEN 'staff_only'::public.verdex_listing_access_mode THEN public.verdex_is_administrator()
           WHEN 'explicit_allowlist'::public.verdex_listing_access_mode THEN EXISTS (
             SELECT 1
             FROM public.verdex_p2p_listing_creator_grants AS grant_row
             WHERE grant_row.user_id = auth.uid()
               AND grant_row.is_active = TRUE
               AND (grant_row.expires_at IS NULL OR grant_row.expires_at > now())
           )
         END
     );
$$;

CREATE OR REPLACE FUNCTION public.verdex_current_user_is_trade_participant(p_trade_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, extensions, public
AS $$
  SELECT auth.uid() IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.verdex_p2p_trades AS trade
       WHERE trade.id = p_trade_id
         AND auth.uid() IN (trade.buyer_user_id, trade.seller_user_id)
     );
$$;

CREATE OR REPLACE FUNCTION public.verdex_current_user_is_dispute_participant(p_dispute_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, extensions, public
AS $$
  SELECT auth.uid() IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.verdex_p2p_disputes AS dispute
       JOIN public.verdex_p2p_trades AS trade ON trade.id = dispute.trade_id
       WHERE dispute.id = p_dispute_id
         AND auth.uid() IN (trade.buyer_user_id, trade.seller_user_id)
     );
$$;

-- Serialises the audit hash chain with a row lock.  Backend calls should pass
-- an actor UUID when they operate with the service role; raw IP/user-agent must
-- be hashed by the caller before being supplied in metadata or hash fields.
CREATE OR REPLACE FUNCTION public.verdex_record_audit_event(
  p_actor_user_id UUID DEFAULT NULL,
  p_actor_kind TEXT DEFAULT 'system',
  p_action TEXT DEFAULT NULL,
  p_resource_type TEXT DEFAULT NULL,
  p_resource_id TEXT DEFAULT NULL,
  p_subject_user_id UUID DEFAULT NULL,
  p_outcome TEXT DEFAULT 'success',
  p_request_id UUID DEFAULT NULL,
  p_ip_hash_sha256 TEXT DEFAULT NULL,
  p_user_agent_hash_sha256 TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions, public
AS $$
DECLARE
  chain_state public.verdex_audit_chain_state%ROWTYPE;
  event_sequence BIGINT;
  computed_event_hash TEXT;
  normalized_actor UUID;
  canonical_payload TEXT;
  event_id BIGINT;
BEGIN
  IF p_action IS NULL OR char_length(p_action) NOT BETWEEN 1 AND 160 THEN
    RAISE EXCEPTION 'audit action must be 1..160 characters';
  END IF;

  IF p_resource_type IS NULL OR char_length(p_resource_type) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'audit resource type must be 1..120 characters';
  END IF;

  IF p_actor_kind NOT IN ('user', 'staff', 'system') THEN
    RAISE EXCEPTION 'invalid audit actor kind';
  END IF;

  IF p_outcome NOT IN ('success', 'denied', 'failure') THEN
    RAISE EXCEPTION 'invalid audit outcome';
  END IF;

  IF p_metadata IS NULL OR jsonb_typeof(p_metadata) <> 'object' OR octet_length(p_metadata::TEXT) > 16384 THEN
    RAISE EXCEPTION 'audit metadata must be an object no larger than 16 KiB';
  END IF;

  IF p_ip_hash_sha256 IS NOT NULL AND p_ip_hash_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid IP hash';
  END IF;

  IF p_user_agent_hash_sha256 IS NOT NULL AND p_user_agent_hash_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid user agent hash';
  END IF;

  normalized_actor := COALESCE(p_actor_user_id, auth.uid());

  SELECT * INTO chain_state
  FROM public.verdex_audit_chain_state
  WHERE singleton = TRUE
  FOR UPDATE;

  event_sequence := chain_state.next_sequence;
  canonical_payload := concat_ws(
    E'\n',
    event_sequence::TEXT,
    COALESCE(chain_state.last_event_hash, ''),
    COALESCE(normalized_actor::TEXT, ''),
    p_actor_kind,
    p_action,
    p_resource_type,
    COALESCE(p_resource_id, ''),
    COALESCE(p_subject_user_id::TEXT, ''),
    p_outcome,
    COALESCE(p_request_id::TEXT, ''),
    COALESCE(p_ip_hash_sha256, ''),
    COALESCE(p_user_agent_hash_sha256, ''),
    p_metadata::TEXT
  );
  computed_event_hash := encode(digest(canonical_payload, 'sha256'), 'hex');

  INSERT INTO public.verdex_audit_events (
    sequence_number, actor_user_id, actor_kind, action, resource_type, resource_id,
    subject_user_id, outcome, request_id, ip_hash_sha256, user_agent_hash_sha256,
    metadata, previous_event_hash, event_hash
  ) VALUES (
    event_sequence, normalized_actor, p_actor_kind, p_action, p_resource_type, p_resource_id,
    p_subject_user_id, p_outcome, p_request_id, p_ip_hash_sha256, p_user_agent_hash_sha256,
    p_metadata, chain_state.last_event_hash, computed_event_hash
  ) RETURNING id INTO event_id;

  UPDATE public.verdex_audit_chain_state
  SET next_sequence = event_sequence + 1,
      last_event_hash = computed_event_hash,
      updated_at = now()
  WHERE singleton = TRUE;

  RETURN event_id;
END;
$$;

-- --------------------------------------------------------------------------
-- Invariant triggers.  Direct client DML is not granted; these triggers still
-- protect against accidental backend state skips and make lifecycle reviews
-- mechanically auditable.
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.verdex_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.verdex_validate_kyc_case_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF NOT (
    (OLD.status = 'draft' AND NEW.status IN ('collecting', 'submitted', 'withdrawn'))
    OR (OLD.status = 'collecting' AND NEW.status IN ('submitted', 'withdrawn', 'expired'))
    OR (OLD.status = 'submitted' AND NEW.status IN ('in_review', 'needs_resubmission', 'withdrawn', 'expired'))
    OR (OLD.status = 'in_review' AND NEW.status IN ('approved', 'rejected', 'needs_resubmission', 'expired'))
    OR (OLD.status = 'needs_resubmission' AND NEW.status IN ('collecting', 'withdrawn', 'expired'))
    OR (OLD.status = 'approved' AND NEW.status = 'expired')
  ) THEN
    RAISE EXCEPTION 'invalid KYC state transition from % to %', OLD.status, NEW.status
      USING ERRCODE = '23514';
  END IF;

  IF NEW.status IN ('approved', 'rejected') AND (NEW.reviewed_at IS NULL OR NEW.reviewer_user_id IS NULL) THEN
    RAISE EXCEPTION 'a final KYC decision requires reviewer and reviewed_at'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.verdex_validate_p2p_trade_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF NOT (
    (OLD.status = 'initiated' AND NEW.status IN ('awaiting_escrow', 'cancelled', 'expired', 'failed'))
    OR (OLD.status = 'awaiting_escrow' AND NEW.status IN ('escrow_locked', 'cancelled', 'expired', 'failed'))
    OR (OLD.status = 'escrow_locked' AND NEW.status IN ('payment_pending', 'cancel_requested', 'disputed', 'expired', 'failed'))
    OR (OLD.status = 'payment_pending' AND NEW.status IN ('payment_marked_sent', 'cancel_requested', 'disputed', 'expired', 'failed'))
    OR (OLD.status = 'payment_marked_sent' AND NEW.status IN ('payment_confirmed', 'cancel_requested', 'disputed', 'expired', 'failed'))
    OR (OLD.status = 'payment_confirmed' AND NEW.status IN ('release_pending', 'disputed', 'failed'))
    OR (OLD.status = 'release_pending' AND NEW.status IN ('released', 'disputed', 'failed'))
    OR (OLD.status = 'cancel_requested' AND NEW.status IN ('cancelled', 'disputed', 'failed'))
    OR (OLD.status = 'disputed' AND NEW.status IN ('resolved', 'cancelled', 'failed'))
    OR (OLD.status = 'resolved' AND NEW.status IN ('release_pending', 'cancelled', 'failed'))
  ) THEN
    RAISE EXCEPTION 'invalid P2P trade state transition from % to %', OLD.status, NEW.status
      USING ERRCODE = '23514';
  END IF;

  IF NEW.status = 'payment_marked_sent' AND NEW.payment_marked_sent_at IS NULL THEN
    RAISE EXCEPTION 'payment_marked_sent requires payment_marked_sent_at' USING ERRCODE = '23514';
  END IF;

  IF NEW.status = 'payment_confirmed' AND NEW.payment_confirmed_at IS NULL THEN
    RAISE EXCEPTION 'payment_confirmed requires payment_confirmed_at' USING ERRCODE = '23514';
  END IF;

  IF NEW.status = 'released' AND NEW.released_at IS NULL THEN
    RAISE EXCEPTION 'released requires released_at' USING ERRCODE = '23514';
  END IF;

  IF NEW.status = 'disputed' AND NEW.dispute_opened_at IS NULL THEN
    RAISE EXCEPTION 'disputed requires dispute_opened_at' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.verdex_validate_escrow_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF NOT (
    (OLD.status = 'not_required' AND NEW.status IN ('released', 'refunded', 'failed'))
    OR (OLD.status = 'awaiting_deposit' AND NEW.status IN ('deposit_detected', 'refund_authorized', 'expired', 'failed'))
    OR (OLD.status = 'deposit_detected' AND NEW.status IN ('locked', 'failed', 'expired'))
    OR (OLD.status = 'locked' AND NEW.status IN ('release_authorized', 'refund_authorized', 'expired', 'failed'))
    OR (OLD.status = 'release_authorized' AND NEW.status IN ('released', 'failed'))
    OR (OLD.status = 'refund_authorized' AND NEW.status IN ('refunded', 'failed'))
  ) THEN
    RAISE EXCEPTION 'invalid escrow state transition from % to %', OLD.status, NEW.status
      USING ERRCODE = '23514';
  END IF;

  IF NEW.status IN ('deposit_detected', 'locked') AND NEW.deposit_tx_hash IS NULL THEN
    RAISE EXCEPTION 'escrow deposit states require deposit_tx_hash' USING ERRCODE = '23514';
  END IF;

  IF NEW.status = 'released' AND NEW.release_tx_hash IS NULL THEN
    RAISE EXCEPTION 'released escrow requires release_tx_hash' USING ERRCODE = '23514';
  END IF;

  IF NEW.status = 'refunded' AND NEW.refund_tx_hash IS NULL THEN
    RAISE EXCEPTION 'refunded escrow requires refund_tx_hash' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.verdex_reject_append_only_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only; UPDATE and DELETE are not permitted', TG_TABLE_NAME
    USING ERRCODE = '55000';
END;
$$;

CREATE OR REPLACE FUNCTION public.verdex_reject_append_only_truncate()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only; TRUNCATE is not permitted', TG_TABLE_NAME
    USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS verdex_kyc_cases_validate_transition ON public.verdex_kyc_cases;
CREATE TRIGGER verdex_kyc_cases_validate_transition
  BEFORE UPDATE ON public.verdex_kyc_cases
  FOR EACH ROW EXECUTE FUNCTION public.verdex_validate_kyc_case_transition();

DROP TRIGGER IF EXISTS verdex_p2p_trades_validate_transition ON public.verdex_p2p_trades;
CREATE TRIGGER verdex_p2p_trades_validate_transition
  BEFORE UPDATE ON public.verdex_p2p_trades
  FOR EACH ROW EXECUTE FUNCTION public.verdex_validate_p2p_trade_transition();

DROP TRIGGER IF EXISTS verdex_p2p_escrows_validate_transition ON public.verdex_p2p_escrows;
CREATE TRIGGER verdex_p2p_escrows_validate_transition
  BEFORE UPDATE ON public.verdex_p2p_escrows
  FOR EACH ROW EXECUTE FUNCTION public.verdex_validate_escrow_transition();

DROP TRIGGER IF EXISTS verdex_kyc_cases_touch_updated_at ON public.verdex_kyc_cases;
CREATE TRIGGER verdex_kyc_cases_touch_updated_at
  BEFORE UPDATE ON public.verdex_kyc_cases
  FOR EACH ROW EXECUTE FUNCTION public.verdex_touch_updated_at();

DROP TRIGGER IF EXISTS verdex_aml_screenings_touch_updated_at ON public.verdex_aml_screenings;
CREATE TRIGGER verdex_aml_screenings_touch_updated_at
  BEFORE UPDATE ON public.verdex_aml_screenings
  FOR EACH ROW EXECUTE FUNCTION public.verdex_touch_updated_at();

DROP TRIGGER IF EXISTS verdex_p2p_entitlements_touch_updated_at ON public.verdex_p2p_entitlements;
CREATE TRIGGER verdex_p2p_entitlements_touch_updated_at
  BEFORE UPDATE ON public.verdex_p2p_entitlements
  FOR EACH ROW EXECUTE FUNCTION public.verdex_touch_updated_at();

DROP TRIGGER IF EXISTS verdex_p2p_orders_touch_updated_at ON public.verdex_p2p_orders;
CREATE TRIGGER verdex_p2p_orders_touch_updated_at
  BEFORE UPDATE ON public.verdex_p2p_orders
  FOR EACH ROW EXECUTE FUNCTION public.verdex_touch_updated_at();

DROP TRIGGER IF EXISTS verdex_p2p_trades_touch_updated_at ON public.verdex_p2p_trades;
CREATE TRIGGER verdex_p2p_trades_touch_updated_at
  BEFORE UPDATE ON public.verdex_p2p_trades
  FOR EACH ROW EXECUTE FUNCTION public.verdex_touch_updated_at();

DROP TRIGGER IF EXISTS verdex_p2p_escrows_touch_updated_at ON public.verdex_p2p_escrows;
CREATE TRIGGER verdex_p2p_escrows_touch_updated_at
  BEFORE UPDATE ON public.verdex_p2p_escrows
  FOR EACH ROW EXECUTE FUNCTION public.verdex_touch_updated_at();

DROP TRIGGER IF EXISTS verdex_p2p_disputes_touch_updated_at ON public.verdex_p2p_disputes;
CREATE TRIGGER verdex_p2p_disputes_touch_updated_at
  BEFORE UPDATE ON public.verdex_p2p_disputes
  FOR EACH ROW EXECUTE FUNCTION public.verdex_touch_updated_at();

DROP TRIGGER IF EXISTS verdex_notification_outbox_touch_updated_at ON public.verdex_notification_outbox;
CREATE TRIGGER verdex_notification_outbox_touch_updated_at
  BEFORE UPDATE ON public.verdex_notification_outbox
  FOR EACH ROW EXECUTE FUNCTION public.verdex_touch_updated_at();

DROP TRIGGER IF EXISTS verdex_api_idempotency_keys_touch_updated_at ON public.verdex_api_idempotency_keys;
CREATE TRIGGER verdex_api_idempotency_keys_touch_updated_at
  BEFORE UPDATE ON public.verdex_api_idempotency_keys
  FOR EACH ROW EXECUTE FUNCTION public.verdex_touch_updated_at();

DROP TRIGGER IF EXISTS verdex_staff_roles_touch_updated_at ON public.verdex_staff_roles;
CREATE TRIGGER verdex_staff_roles_touch_updated_at
  BEFORE UPDATE ON public.verdex_staff_roles
  FOR EACH ROW EXECUTE FUNCTION public.verdex_touch_updated_at();

DROP TRIGGER IF EXISTS verdex_p2p_policy_touch_updated_at ON public.verdex_p2p_platform_policy;
CREATE TRIGGER verdex_p2p_policy_touch_updated_at
  BEFORE UPDATE ON public.verdex_p2p_platform_policy
  FOR EACH ROW EXECUTE FUNCTION public.verdex_touch_updated_at();

DROP TRIGGER IF EXISTS verdex_p2p_listing_grants_touch_updated_at ON public.verdex_p2p_listing_creator_grants;
CREATE TRIGGER verdex_p2p_listing_grants_touch_updated_at
  BEFORE UPDATE ON public.verdex_p2p_listing_creator_grants
  FOR EACH ROW EXECUTE FUNCTION public.verdex_touch_updated_at();

DROP TRIGGER IF EXISTS verdex_audit_events_append_only ON public.verdex_audit_events;
CREATE TRIGGER verdex_audit_events_append_only
  BEFORE UPDATE OR DELETE ON public.verdex_audit_events
  FOR EACH ROW EXECUTE FUNCTION public.verdex_reject_append_only_mutation();

DROP TRIGGER IF EXISTS verdex_audit_events_no_truncate ON public.verdex_audit_events;
CREATE TRIGGER verdex_audit_events_no_truncate
  BEFORE TRUNCATE ON public.verdex_audit_events
  FOR EACH STATEMENT EXECUTE FUNCTION public.verdex_reject_append_only_truncate();

DROP TRIGGER IF EXISTS verdex_kyc_review_actions_append_only ON public.verdex_kyc_review_actions;
CREATE TRIGGER verdex_kyc_review_actions_append_only
  BEFORE UPDATE OR DELETE ON public.verdex_kyc_review_actions
  FOR EACH ROW EXECUTE FUNCTION public.verdex_reject_append_only_mutation();

DROP TRIGGER IF EXISTS verdex_p2p_trade_events_append_only ON public.verdex_p2p_trade_events;
CREATE TRIGGER verdex_p2p_trade_events_append_only
  BEFORE UPDATE OR DELETE ON public.verdex_p2p_trade_events
  FOR EACH ROW EXECUTE FUNCTION public.verdex_reject_append_only_mutation();

-- --------------------------------------------------------------------------
-- RLS and database grants.  There are intentionally no client INSERT/UPDATE/
-- DELETE policies on sensitive tables.  Missing policies deny access.
-- --------------------------------------------------------------------------

ALTER TABLE public.verdex_staff_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verdex_p2p_platform_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verdex_p2p_listing_creator_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verdex_kyc_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verdex_kyc_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verdex_kyc_review_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verdex_aml_screenings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verdex_p2p_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verdex_p2p_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verdex_p2p_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verdex_p2p_escrows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verdex_p2p_trade_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verdex_p2p_disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verdex_p2p_dispute_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verdex_notification_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verdex_api_idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verdex_audit_chain_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verdex_audit_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.verdex_staff_roles FROM anon, authenticated;
REVOKE ALL ON TABLE public.verdex_p2p_platform_policy FROM anon, authenticated;
REVOKE ALL ON TABLE public.verdex_p2p_listing_creator_grants FROM anon, authenticated;
REVOKE ALL ON TABLE public.verdex_kyc_cases FROM anon, authenticated;
REVOKE ALL ON TABLE public.verdex_kyc_evidence FROM anon, authenticated;
REVOKE ALL ON TABLE public.verdex_kyc_review_actions FROM anon, authenticated;
REVOKE ALL ON TABLE public.verdex_aml_screenings FROM anon, authenticated;
REVOKE ALL ON TABLE public.verdex_p2p_entitlements FROM anon, authenticated;
REVOKE ALL ON TABLE public.verdex_p2p_orders FROM anon, authenticated;
REVOKE ALL ON TABLE public.verdex_p2p_trades FROM anon, authenticated;
REVOKE ALL ON TABLE public.verdex_p2p_escrows FROM anon, authenticated;
REVOKE ALL ON TABLE public.verdex_p2p_trade_events FROM anon, authenticated;
REVOKE ALL ON TABLE public.verdex_p2p_disputes FROM anon, authenticated;
REVOKE ALL ON TABLE public.verdex_p2p_dispute_evidence FROM anon, authenticated;
REVOKE ALL ON TABLE public.verdex_notification_outbox FROM anon, authenticated;
REVOKE ALL ON TABLE public.verdex_api_idempotency_keys FROM anon, authenticated;
REVOKE ALL ON TABLE public.verdex_audit_chain_state FROM anon, authenticated;
REVOKE ALL ON TABLE public.verdex_audit_events FROM anon, authenticated;

-- SELECT is granted only where a matching RLS policy below permits a row.
GRANT SELECT ON TABLE public.verdex_staff_roles TO authenticated;
GRANT SELECT ON TABLE public.verdex_p2p_platform_policy TO authenticated;
GRANT SELECT ON TABLE public.verdex_p2p_listing_creator_grants TO authenticated;
GRANT SELECT ON TABLE public.verdex_kyc_cases TO authenticated;
GRANT SELECT ON TABLE public.verdex_kyc_evidence TO authenticated;
GRANT SELECT ON TABLE public.verdex_kyc_review_actions TO authenticated;
GRANT SELECT ON TABLE public.verdex_aml_screenings TO authenticated;
GRANT SELECT ON TABLE public.verdex_p2p_entitlements TO authenticated;
GRANT SELECT ON TABLE public.verdex_p2p_orders TO authenticated;
GRANT SELECT ON TABLE public.verdex_p2p_trades TO authenticated;
GRANT SELECT ON TABLE public.verdex_p2p_escrows TO authenticated;
GRANT SELECT ON TABLE public.verdex_p2p_trade_events TO authenticated;
GRANT SELECT ON TABLE public.verdex_p2p_disputes TO authenticated;
GRANT SELECT ON TABLE public.verdex_p2p_dispute_evidence TO authenticated;
GRANT SELECT ON TABLE public.verdex_notification_outbox TO authenticated;
GRANT SELECT ON TABLE public.verdex_audit_events TO authenticated;

CREATE POLICY verdex_staff_roles_select_self_or_administrator
  ON public.verdex_staff_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.verdex_is_administrator());

-- Administrators own platform settings and the initial listing allowlist.
CREATE POLICY verdex_p2p_platform_policy_select_administrator
  ON public.verdex_p2p_platform_policy
  FOR SELECT TO authenticated
  USING (public.verdex_is_administrator());

CREATE POLICY verdex_p2p_listing_grants_select_self_or_administrator
  ON public.verdex_p2p_listing_creator_grants
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.verdex_is_administrator());

-- Moderators, not administrators by default, can see KYC/AML review material.
CREATE POLICY verdex_kyc_cases_select_subject_or_moderator
  ON public.verdex_kyc_cases
  FOR SELECT TO authenticated
  USING (subject_user_id = auth.uid() OR public.verdex_is_moderator());

CREATE POLICY verdex_kyc_evidence_select_subject_or_moderator
  ON public.verdex_kyc_evidence
  FOR SELECT TO authenticated
  USING (subject_user_id = auth.uid() OR public.verdex_is_moderator());

CREATE POLICY verdex_kyc_review_actions_select_moderator
  ON public.verdex_kyc_review_actions
  FOR SELECT TO authenticated
  USING (public.verdex_is_moderator());

CREATE POLICY verdex_aml_screenings_select_moderator
  ON public.verdex_aml_screenings
  FOR SELECT TO authenticated
  USING (public.verdex_is_moderator());

CREATE POLICY verdex_p2p_entitlements_select_subject_or_moderator
  ON public.verdex_p2p_entitlements
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.verdex_is_moderator());

CREATE POLICY verdex_p2p_orders_select_creator_eligible_user_or_moderator
  ON public.verdex_p2p_orders
  FOR SELECT TO authenticated
  USING (
    creator_user_id = auth.uid()
    OR public.verdex_is_moderator()
    OR (
      status = 'open'
      AND expires_at > now()
      AND public.verdex_current_user_has_p2p_access()
    )
  );

CREATE POLICY verdex_p2p_trades_select_counterparty_or_moderator
  ON public.verdex_p2p_trades
  FOR SELECT TO authenticated
  USING (
    auth.uid() IN (buyer_user_id, seller_user_id)
    OR public.verdex_is_moderator()
  );

CREATE POLICY verdex_p2p_escrows_select_counterparty_or_moderator
  ON public.verdex_p2p_escrows
  FOR SELECT TO authenticated
  USING (
    public.verdex_current_user_is_trade_participant(trade_id)
    OR public.verdex_is_moderator()
  );

CREATE POLICY verdex_p2p_trade_events_select_counterparty_or_moderator
  ON public.verdex_p2p_trade_events
  FOR SELECT TO authenticated
  USING (
    public.verdex_current_user_is_trade_participant(trade_id)
    OR public.verdex_is_moderator()
  );

CREATE POLICY verdex_p2p_disputes_select_counterparty_or_moderator
  ON public.verdex_p2p_disputes
  FOR SELECT TO authenticated
  USING (
    public.verdex_current_user_is_trade_participant(trade_id)
    OR public.verdex_is_moderator()
  );

CREATE POLICY verdex_p2p_dispute_evidence_select_counterparty_or_moderator
  ON public.verdex_p2p_dispute_evidence
  FOR SELECT TO authenticated
  USING (
    public.verdex_current_user_is_dispute_participant(dispute_id)
    OR public.verdex_is_moderator()
  );

CREATE POLICY verdex_notification_outbox_select_recipient_or_administrator
  ON public.verdex_notification_outbox
  FOR SELECT TO authenticated
  USING (recipient_user_id = auth.uid() OR public.verdex_is_administrator());

CREATE POLICY verdex_audit_events_select_administrator
  ON public.verdex_audit_events
  FOR SELECT TO authenticated
  USING (public.verdex_is_administrator());

-- Only non-sensitive, self-bound helpers are callable by authenticated users.
REVOKE ALL ON FUNCTION public.verdex_has_staff_role(public.verdex_staff_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verdex_is_administrator() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verdex_is_moderator() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verdex_current_user_has_p2p_access() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verdex_current_user_can_create_p2p_listing() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verdex_current_user_is_trade_participant(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verdex_current_user_is_dispute_participant(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verdex_record_audit_event(
  UUID, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, UUID, TEXT, TEXT, JSONB
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.verdex_has_staff_role(public.verdex_staff_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verdex_is_administrator() TO authenticated;
GRANT EXECUTE ON FUNCTION public.verdex_is_moderator() TO authenticated;
GRANT EXECUTE ON FUNCTION public.verdex_current_user_has_p2p_access() TO authenticated;
GRANT EXECUTE ON FUNCTION public.verdex_current_user_can_create_p2p_listing() TO authenticated;
GRANT EXECUTE ON FUNCTION public.verdex_current_user_is_trade_participant(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verdex_current_user_is_dispute_participant(UUID) TO authenticated;

-- Audit writer is intentionally server-only.  `service_role` is the Supabase
-- backend role; no browser/mobile client receives EXECUTE on this function.
GRANT EXECUTE ON FUNCTION public.verdex_record_audit_event(
  UUID, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, UUID, TEXT, TEXT, JSONB
) TO service_role;

COMMENT ON TABLE public.verdex_kyc_evidence IS
  'Metadata only. Store encrypted document/selfie/video bytes in private object storage, never in this table.';
COMMENT ON TABLE public.verdex_aml_screenings IS
  'Screening decisions and hashed provider result references only; never store raw sanctions/PEP payloads or identity fields.';
COMMENT ON TABLE public.verdex_p2p_escrows IS
  'On-chain escrow references only. This table must never contain a wallet seed, private key, validator key, or signing secret.';
COMMENT ON TABLE public.verdex_audit_events IS
  'Append-only, hash-chained security audit log. Updates, deletes, and truncation are rejected by trigger.';
COMMENT ON FUNCTION public.verdex_current_user_can_create_p2p_listing() IS
  'Launch default requires an explicit listing grant. Set policy to verified_users later only through an audited administrator workflow.';

COMMIT;
-- ============================================================
-- MIGRATION: 20260718140000_kyc_identity_profiles_and_chain.sql
-- ============================================================
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
-- ============================================================
-- MIGRATION: 20260720120000_p2p_attestation_persistence_and_atomic_open.sql
-- ============================================================
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
-- ============================================================
-- MIGRATION: 20260720130000_custodial_wallet_system.sql
-- ============================================================
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
  END IF

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
