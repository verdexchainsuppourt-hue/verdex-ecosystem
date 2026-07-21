-- =====================================================================
-- VERDEX MINING ECOSYSTEM — DATABASE SCHEMA
-- Phase 1: Foundation tables for points farming, wallet, auth, mining
-- Run this in Supabase SQL Editor:
--   https://supabase.com/dashboard/project/unbzescopxtmtbrgqlhh/sql/new
-- =====================================================================

-- =====================================================================
-- 1. PROFILES — extends auth.users with mining-specific data
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  username TEXT UNIQUE,
  full_name TEXT,
  avatar_url TEXT,
  referral_code TEXT UNIQUE DEFAULT UPPER(SUBSTR(MD5(RANDOM()::TEXT), 1, 8)),
  referred_by UUID REFERENCES public.profiles(id),
  is_banned BOOLEAN DEFAULT FALSE,
  ban_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create profile when a new auth user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NULL)
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =====================================================================
-- 2. WALLETS — non-custodial wallet (public address + derived VP balance)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.wallets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE UNIQUE NOT NULL,
  -- Non-custodial: we ONLY store the public address, never private keys
  vdx_address TEXT,
  address_chain TEXT DEFAULT 'evm',
  -- VP balance is DERIVED from point_transactions (never stored directly for integrity)
  -- This cached field is updated by the daily credit cron for fast reads
  vp_balance_cached BIGINT DEFAULT 0,
  -- Post-launch VDX balance (snapshot at conversion)
  vdx_balance_cached NUMERIC(18,8) DEFAULT 0,
  -- Streak tracking
  current_streak INTEGER DEFAULT 0,
  longest_streak INTEGER DEFAULT 0,
  last_credit_date DATE,
  -- Wallet setup status
  wallet_set_up BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create wallet when profile is created
CREATE OR REPLACE FUNCTION public.handle_new_profile()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.wallets (user_id) VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_profile_created ON public.profiles;
CREATE TRIGGER on_profile_created
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_profile();

-- =====================================================================
-- 3. MINING_SESSIONS — tracks active/paused mining sessions per device
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.mining_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  status TEXT DEFAULT 'paused' CHECK (status IN ('active', 'paused', 'terminated')),
  -- Device identification (1 active session per device)
  device_fingerprint TEXT NOT NULL,
  device_name TEXT,
  device_os TEXT,
  device_arch TEXT,
  cli_version TEXT,
  -- Session timing
  started_at TIMESTAMPTZ DEFAULT NOW(),
  last_heartbeat_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  -- Uptime tracking
  total_uptime_seconds BIGINT DEFAULT 0,
  -- Session API token reference (hashed token used by CLI)
  api_token_id UUID,
  -- Hardware info and mining mode
  hardware_score INTEGER DEFAULT 30,
  hardware_profile JSONB DEFAULT '{}'::jsonb,
  mining_mode TEXT DEFAULT 'normal' CHECK (mining_mode IN ('eco', 'normal', 'pro')),
  mode_multiplier NUMERIC(3,2) DEFAULT 1.0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mining_sessions_user ON public.mining_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_mining_sessions_device ON public.mining_sessions(device_fingerprint);
CREATE INDEX IF NOT EXISTS idx_mining_sessions_active ON public.mining_sessions(status) WHERE status = 'active';

-- =====================================================================
-- 4. HEARTBEATS — every 5-minute heartbeat from CLI (append-only)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.heartbeats (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID REFERENCES public.mining_sessions(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  -- Heartbeat data
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  nonce TEXT NOT NULL,
  pow_challenge TEXT NOT NULL,
  pow_solution TEXT NOT NULL,
  pow_valid BOOLEAN DEFAULT FALSE,
  -- Network metadata
  ip_address TEXT,
  user_agent TEXT,
  -- Validation
  valid BOOLEAN DEFAULT FALSE,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_heartbeats_session ON public.heartbeats(session_id);
CREATE INDEX IF NOT EXISTS idx_heartbeats_user ON public.heartbeats(user_id);
CREATE INDEX IF NOT EXISTS idx_heartbeats_timestamp ON public.heartbeats(timestamp DESC);
-- Prevent replay: one heartbeat per nonce per session
CREATE UNIQUE INDEX IF NOT EXISTS idx_heartbeats_nonce ON public.heartbeats(session_id, nonce);

-- =====================================================================
-- 5. POINT_TRANSACTIONS — immutable append-only ledger
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.point_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  amount BIGINT NOT NULL,  -- positive = credit, negative = debit
  type TEXT NOT NULL CHECK (type IN ('mining', 'referral', 'bonus', 'streak', 'adjustment', 'conversion')),
  description TEXT,
  -- Link to the source (e.g., mining session, referral user)
  source_id UUID,
  source_type TEXT,
  -- Referral tracking (who referred the earner)
  referrer_id UUID REFERENCES public.profiles(id),
  -- Balance snapshot after this transaction (for fast derivation)
  balance_after BIGINT NOT NULL,
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_point_tx_user ON public.point_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_point_tx_created ON public.point_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_point_tx_type ON public.point_transactions(type);
CREATE INDEX IF NOT EXISTS idx_point_tx_referrer ON public.point_transactions(referrer_id) WHERE referrer_id IS NOT NULL;

-- =====================================================================
-- 6. API_TOKENS — scoped device tokens for CLI auth (hashed at rest)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.api_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  -- Token is hashed (bcrypt) — plaintext only shown ONCE at creation
  token_hash TEXT NOT NULL,
  -- Human-readable prefix for identification (first 8 chars of token)
  token_prefix TEXT NOT NULL,
  name TEXT,
  -- Scope: what this token can do
  scope TEXT[] DEFAULT ARRAY['mining'],
  -- Lifecycle
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT TRUE,
  -- Device binding
  device_fingerprint TEXT,
  device_name TEXT
);

CREATE INDEX IF NOT EXISTS idx_api_tokens_user ON public.api_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_api_tokens_prefix ON public.api_tokens(token_prefix);

-- =====================================================================
-- 7. DOWNLOAD_TOKENS — one-time tokens for CLI binary downloads
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.download_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  one_time_token TEXT UNIQUE NOT NULL,
  os TEXT NOT NULL CHECK (os IN ('linux', 'windows')),
  arch TEXT DEFAULT 'amd64',
  -- Tracking
  downloaded_at TIMESTAMPTZ,
  ip_address TEXT,
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '10 minutes',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_download_tokens_user ON public.download_tokens(user_id);

-- =====================================================================
-- 8. DEVICE_FINGERPRINTS — anti-cheat: track machines
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.device_fingerprints (
  fingerprint_hash TEXT PRIMARY KEY,
  -- First user who registered this device
  first_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- How many users tried to use this device (Sybil detection)
  user_count INTEGER DEFAULT 1,
  -- Known users on this device
  known_user_ids UUID[] DEFAULT ARRAY[]::UUID[],
  -- Ban status
  is_banned BOOLEAN DEFAULT FALSE,
  ban_reason TEXT,
  -- Metadata
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  device_os TEXT,
  device_arch TEXT
);

-- =====================================================================
-- 9. AUDIT_LOGS — every sensitive action is logged
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  -- Actions: login, logout, token_generated, token_revoked, download_requested,
  --          mining_started, mining_stopped, points_credited, wallet_setup,
  --          device_registered, device_banned, user_banned
  resource_type TEXT,
  resource_id TEXT,
  -- Request metadata
  ip_address TEXT,
  user_agent TEXT,
  -- Result
  success BOOLEAN DEFAULT TRUE,
  error_message TEXT,
  -- Additional data
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON public.audit_logs(created_at DESC);

-- =====================================================================
-- 10. MINING_CONFIG — global settings (adjustable without redeploy)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.mining_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default config values
INSERT INTO public.mining_config (key, value, description) VALUES
  ('daily_vp_base', '10', 'Base VP per 24h valid uptime'),
  ('streak_bonus_per_day', '2', 'VP bonus per consecutive day'),
  ('streak_bonus_cap', '20', 'Max streak bonus VP'),
  ('heartbeat_interval_seconds', '300', 'Seconds between heartbeats (5 min)'),
  ('heartbeat_tolerance_seconds', '600', 'Max gap before session considered broken (10 min)'),
  ('pow_difficulty', '4', 'Proof-of-work difficulty (leading zeros required)'),
  ('referral_percentage', '10', 'Percentage of referee VP earned by referrer'),
  ('max_active_sessions_per_device', '1', 'Max concurrent mining sessions per device'),
  ('daily_uptime_cap_seconds', '86400', 'Max uptime credited per day (24h)'),
  ('vdx_launch_date', '"2026-12-12"', 'VDX token generation event date'),
  ('vp_to_vdx_ratio', '100', 'VP to VDX conversion ratio at launch (100 VP = 1 VDX)'),
  ('admin_emails', '["chsalmantok4@gmail.com"]', 'List of admin email addresses for the admin panel')
ON CONFLICT (key) DO NOTHING;

-- =====================================================================
-- ROW LEVEL SECURITY (RLS)
-- =====================================================================

-- Enable RLS on ALL tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mining_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.heartbeats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.point_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.download_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_fingerprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mining_config ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- PROFILES: users can read/update own profile, read others (for referrals)
-- ---------------------------------------------------------------------
CREATE POLICY "Users read own profile"
  ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users read other profiles for referrals"
  ON public.profiles FOR SELECT TO authenticated
  USING (TRUE);

CREATE POLICY "Users update own profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id);

-- ---------------------------------------------------------------------
-- WALLETS: users read own wallet only
-- ---------------------------------------------------------------------
CREATE POLICY "Users read own wallet"
  ON public.wallets FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own wallet"
  ON public.wallets FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own wallet"
  ON public.wallets FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- MINING_SESSIONS: users read own sessions
-- ---------------------------------------------------------------------
CREATE POLICY "Users read own sessions"
  ON public.mining_sessions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- HEARTBEATS: users read own heartbeats
-- ---------------------------------------------------------------------
CREATE POLICY "Users read own heartbeats"
  ON public.heartbeats FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- POINT_TRANSACTIONS: users read own transactions
-- ---------------------------------------------------------------------
CREATE POLICY "Users read own transactions"
  ON public.point_transactions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- API_TOKENS: users read own tokens (hash only, never plaintext)
-- ---------------------------------------------------------------------
CREATE POLICY "Users read own tokens"
  ON public.api_tokens FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users revoke own tokens"
  ON public.api_tokens FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- DOWNLOAD_TOKENS: users read own download tokens
-- ---------------------------------------------------------------------
CREATE POLICY "Users read own download tokens"
  ON public.download_tokens FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- AUDIT_LOGS: users read own logs only
-- ---------------------------------------------------------------------
CREATE POLICY "Users read own audit logs"
  ON public.audit_logs FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- MINING_CONFIG: public read (all authenticated users can see config)
-- ---------------------------------------------------------------------
CREATE POLICY "Authenticated read mining config"
  ON public.mining_config FOR SELECT TO authenticated
  USING (TRUE);

-- ---------------------------------------------------------------------
-- DEVICE_FINGERPRINTS: users read own device data
-- ---------------------------------------------------------------------
CREATE POLICY "Users read own device fingerprints"
  ON public.device_fingerprints FOR SELECT TO authenticated
  USING (auth.uid() = first_user_id);

-- ---------------------------------------------------------------------
-- PROFILES: insert own profile on signup
-- ---------------------------------------------------------------------
CREATE POLICY "Users insert own profile"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);

-- ---------------------------------------------------------------------
-- MISSING INSERT/UPDATE POLICIES FOR FRONTEND OPERATIONS
-- These are needed when the frontend (using anon key) writes data.
-- ---------------------------------------------------------------------

CREATE POLICY "Users insert mining sessions"
  ON public.mining_sessions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own mining sessions"
  ON public.mining_sessions FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert heartbeats"
  ON public.heartbeats FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users insert point transactions"
  ON public.point_transactions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users insert own api tokens"
  ON public.api_tokens FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own api tokens"
  ON public.api_tokens FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- SERVICE ROLE: full access to all tables (backend API operations)
-- ---------------------------------------------------------------------
-- Service role bypasses RLS by default, so no explicit policies needed.
-- The backend API uses the service role key for all write operations.

-- =====================================================================
-- HELPER FUNCTIONS
-- =====================================================================

-- Get user's current VP balance (derived from ledger)
CREATE OR REPLACE FUNCTION public.get_vp_balance(p_user_id UUID)
RETURNS BIGINT AS $$
DECLARE
  balance BIGINT;
BEGIN
  SELECT COALESCE(SUM(amount), 0) INTO balance
  FROM public.point_transactions
  WHERE user_id = p_user_id;
  RETURN balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Credit VP to a user (creates a point_transaction + updates cache)
CREATE OR REPLACE FUNCTION public.credit_vp(
  p_user_id UUID,
  p_amount BIGINT,
  p_type TEXT,
  p_description TEXT DEFAULT NULL,
  p_source_id UUID DEFAULT NULL,
  p_source_type TEXT DEFAULT NULL,
  p_referrer_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID AS $$
DECLARE
  new_balance BIGINT;
  tx_id UUID;
BEGIN
  -- Calculate new balance
  SELECT COALESCE(SUM(amount), 0) + p_amount INTO new_balance
  FROM public.point_transactions
  WHERE user_id = p_user_id;

  -- Insert transaction
  INSERT INTO public.point_transactions (
    user_id, amount, type, description, source_id, source_type,
    referrer_id, balance_after, metadata
  ) VALUES (
    p_user_id, p_amount, p_type, p_description, p_source_id, p_source_type,
    p_referrer_id, new_balance, p_metadata
  ) RETURNING id INTO tx_id;

  -- Update cached wallet balance
  UPDATE public.wallets
  SET vp_balance_cached = new_balance,
      updated_at = NOW()
  WHERE user_id = p_user_id;

  RETURN tx_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update streak when daily credit is applied
CREATE OR REPLACE FUNCTION public.update_streak(p_user_id UUID, p_credit_date DATE)
RETURNS INTEGER AS $$
DECLARE
  wallet_record RECORD;
  new_streak INTEGER;
BEGIN
  SELECT current_streak, last_credit_date INTO wallet_record
  FROM public.wallets WHERE user_id = p_user_id FOR UPDATE;

  IF wallet_record.last_credit_date IS NULL OR
     wallet_record.last_credit_date = p_credit_date - INTERVAL '1 day' THEN
    -- Consecutive day: increment streak
    new_streak := wallet_record.current_streak + 1;
  ELSIF wallet_record.last_credit_date = p_credit_date THEN
    -- Same day (already credited): no change
    new_streak := wallet_record.current_streak;
  ELSE
    -- Streak broken: reset
    new_streak := 1;
  END IF;

  UPDATE public.wallets
  SET current_streak = new_streak,
      longest_streak = GREATEST(longest_streak, new_streak),
      last_credit_date = p_credit_date
  WHERE user_id = p_user_id;

  RETURN new_streak;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================================
-- 11. CHAIN_BLOCKS — Serverless blockchain block storage
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.chain_blocks (
  height BIGINT PRIMARY KEY,
  hash TEXT NOT NULL,
  previous_hash TEXT,
  timestamp BIGINT NOT NULL,
  validator TEXT NOT NULL,
  transactions JSONB DEFAULT '[]'::jsonb,
  receipts JSONB DEFAULT '[]'::jsonb,
  gas_used BIGINT DEFAULT 0,
  gas_limit BIGINT DEFAULT 15000000,
  base_fee_per_gas TEXT DEFAULT '1000000000',
  state_root TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_chain_blocks_hash ON public.chain_blocks(hash);

-- =====================================================================
-- 12. CHAIN_ACCOUNTS — Current on-chain account state
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.chain_accounts (
  address TEXT PRIMARY KEY,
  balance TEXT DEFAULT '0',
  nonce BIGINT DEFAULT 0,
  is_contract BOOLEAN DEFAULT FALSE,
  code TEXT DEFAULT '',
  storage JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================================
-- 13. CHAIN_VALIDATORS — Registered PoA validators
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.chain_validators (
  address TEXT PRIMARY KEY,
  public_key TEXT DEFAULT '',
  stake TEXT DEFAULT '0',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================================
-- 14. CHAIN_TRANSACTIONS — All confirmed transactions
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.chain_transactions (
  hash TEXT PRIMARY KEY,
  block_height BIGINT REFERENCES public.chain_blocks(height),
  from_address TEXT NOT NULL,
  to_address TEXT,
  value TEXT NOT NULL,
  nonce BIGINT NOT NULL,
  gas_price TEXT,
  gas_limit BIGINT,
  data TEXT DEFAULT '',
  type INTEGER DEFAULT 0,
  status INTEGER DEFAULT 1,
  contract_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_chain_tx_from ON public.chain_transactions(from_address);
CREATE INDEX IF NOT EXISTS idx_chain_tx_to ON public.chain_transactions(to_address);
CREATE INDEX IF NOT EXISTS idx_chain_tx_block ON public.chain_transactions(block_height);

-- =====================================================================
-- 15. CHAIN_META — Blockchain metadata (height, genesis hash, stats)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.chain_meta (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on chain tables (service_role bypasses anyway)
ALTER TABLE public.chain_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chain_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chain_validators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chain_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chain_meta ENABLE ROW LEVEL SECURITY;

-- Allow public read access to chain data
CREATE POLICY "Anyone can read chain blocks"
  ON public.chain_blocks FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "Anyone can read chain accounts"
  ON public.chain_accounts FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "Anyone can read chain validators"
  ON public.chain_validators FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "Anyone can read chain transactions"
  ON public.chain_transactions FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "Anyone can read chain meta"
  ON public.chain_meta FOR SELECT TO authenticated USING (TRUE);

-- =====================================================================
-- DONE — Schema complete
-- =====================================================================
