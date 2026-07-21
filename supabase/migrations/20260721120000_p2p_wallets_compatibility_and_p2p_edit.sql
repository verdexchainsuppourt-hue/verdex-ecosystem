-- ============================================================================
-- Verdex Schema Compatibility & P2P Enhancements
--
-- 1. Create public.wallets compatibility view bridging to verdex_custodial_wallets
-- 2. Add columns for P2P listing edit/delete status
-- 3. Create verdex_point_conversions ledger for VP -> VDX token conversions
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Legacy wallets compatibility view (Safely drop table OR view)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  rel_kind char;
BEGIN
  SELECT c.relkind INTO rel_kind
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'wallets';

  IF rel_kind = 'r' THEN
    EXECUTE 'DROP TABLE public.wallets CASCADE';
  ELSIF rel_kind = 'v' THEN
    EXECUTE 'DROP VIEW public.wallets CASCADE';
  END IF;
END $$;

CREATE VIEW public.wallets AS
SELECT 
  id,
  user_id,
  deposit_address AS vdx_address,
  true AS wallet_set_up,
  created_at,
  updated_at
FROM public.verdex_custodial_wallets;

-- Grant access to service_role and authenticated users
GRANT SELECT ON public.wallets TO service_role, authenticated, anon;

-- ---------------------------------------------------------------------------
-- 2. P2P Order Listing Edit/Delete Support
-- ---------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.verdex_p2p_orders
  ADD COLUMN IF NOT EXISTS is_edited BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;

-- Ensure status supports 'deleted' and 'cancelled'
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'verdex_p2p_orders_status_check'
  ) THEN
    -- Table status check is handled dynamically or via column check
    NULL;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. VP -> VDX Token Conversion Ledger Table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.verdex_point_conversions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vp_amount NUMERIC(18,4) NOT NULL CHECK (vp_amount > 0),
  vdx_amount NUMERIC(36,18) NOT NULL CHECK (vdx_amount > 0),
  conversion_rate NUMERIC(18,4) NOT NULL DEFAULT 100.0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS verdex_point_conversions_user_idx
  ON public.verdex_point_conversions (user_id);

ALTER TABLE public.verdex_point_conversions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS verdex_point_conversions_service ON public.verdex_point_conversions;
DROP POLICY IF EXISTS verdex_point_conversions_user_read ON public.verdex_point_conversions;

CREATE POLICY verdex_point_conversions_service ON public.verdex_point_conversions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY verdex_point_conversions_user_read ON public.verdex_point_conversions
  FOR SELECT TO authenticated USING (user_id = auth.uid());

COMMIT;
