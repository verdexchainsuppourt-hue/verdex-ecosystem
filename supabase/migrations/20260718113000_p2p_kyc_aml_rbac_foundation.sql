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
