-- ============================================================================
-- Verdex Custodial Wallet — Address Book + Withdrawal Expiry
--
-- Adds:
--  - Address book table for saved withdrawal destinations
--  - Withdrawal expiry function (auto-cancel stale pending withdrawals)
--
-- Depends on: 20260720130000_custodial_wallet_system.sql
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Address book: saved withdrawal destinations per user
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.verdex_custodial_address_book (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label TEXT NOT NULL CHECK (char_length(label) BETWEEN 1 AND 80),
  address TEXT NOT NULL CHECK (address ~ '^0x[a-fA-F0-9]{40}$'),
  chain TEXT NOT NULL DEFAULT 'verdex',
  is_whitelisted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT verdex_custodial_address_book_unique UNIQUE (user_id, address)
);

CREATE INDEX IF NOT EXISTS verdex_custodial_address_book_user_idx
  ON public.verdex_custodial_address_book (user_id);

ALTER TABLE public.verdex_custodial_address_book ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.verdex_custodial_address_book FROM anon;
GRANT SELECT ON TABLE public.verdex_custodial_address_book TO authenticated;
GRANT INSERT ON TABLE public.verdex_custodial_address_book TO authenticated;
GRANT DELETE ON TABLE public.verdex_custodial_address_book TO authenticated;

CREATE POLICY verdex_custodial_address_book_select_self
  ON public.verdex_custodial_address_book FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY verdex_custodial_address_book_insert_self
  ON public.verdex_custodial_address_book FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY verdex_custodial_address_book_delete_self
  ON public.verdex_custodial_address_book FOR DELETE TO authenticated
  USING (user_id = auth.uid());

DROP TRIGGER IF EXISTS verdex_custodial_address_book_touch ON public.verdex_custodial_address_book;
CREATE TRIGGER verdex_custodial_address_book_touch
  BEFORE UPDATE ON public.verdex_custodial_address_book
  FOR EACH ROW EXECUTE FUNCTION public.verdex_custodial_touch_updated_at();

-- ---------------------------------------------------------------------------
-- RPC: Expire stale withdrawals (older than 24 hours, still pending)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.verdex_custodial_expire_stale_withdrawals(
  p_max_age_hours INTEGER DEFAULT 24,
  p_expired_by UUID DEFAULT NULL
)
RETURNS TABLE(expired_count INTEGER, total_locked_unlocked NUMERIC(78,0))
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions, public
AS $$
DECLARE
  v_cutoff TIMESTAMPTZ;
  v_row RECORD;
  v_count INTEGER := 0;
  v_total NUMERIC(78,0) := 0;
BEGIN
  v_cutoff := now() - (p_max_age_hours || ' hours')::INTERVAL;

  FOR v_row IN
    SELECT id, wallet_id, total_atomic
    FROM public.verdex_custodial_withdrawals
    WHERE status IN ('requested', 'kyc_pending', 'aml_pending', 'awaiting_signatures')
      AND created_at < v_cutoff
  LOOP
    -- Cancel the withdrawal and unlock funds.
    BEGIN
      PERFORM public.verdex_custodial_cancel_withdrawal(
        v_row.id,
        'Withdrawal expired (' || p_max_age_hours || 'h timeout)',
        p_expired_by
      );
      v_count := v_count + 1;
      v_total := v_total + v_row.total_atomic;
    EXCEPTION WHEN OTHERS THEN
      -- Skip individual failures.
    END;
  END LOOP;

  RETURN QUERY SELECT v_count, v_total;
END;
$$;

REVOKE ALL ON FUNCTION public.verdex_custodial_expire_stale_withdrawals(INTEGER, UUID) FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.verdex_custodial_expire_stale_withdrawals(INTEGER, UUID) TO service_role;

COMMENT ON TABLE public.verdex_custodial_address_book IS
  'Saved withdrawal destinations. Users can add labels and whitelist addresses.';
COMMENT ON FUNCTION public.verdex_custodial_expire_stale_withdrawals IS
  'Cancels pending withdrawals older than N hours, unlocking the locked funds. Run via cron or admin.';

COMMIT;
