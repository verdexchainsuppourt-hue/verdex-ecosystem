-- ============================================================================
-- Verdex P2P Chat + Reputation System
--
-- In-trade messaging between buyer and seller, plus trader ratings/reputation.
-- Depends on: 20260718113000_p2p_kyc_aml_rbac_foundation.sql
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- P2P Trade Chat — messages between trade counterparties
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.verdex_p2p_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id UUID NOT NULL REFERENCES public.verdex_p2p_trades(id) ON DELETE RESTRICT,
  sender_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  receiver_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  message TEXT NOT NULL CHECK (char_length(message) BETWEEN 1 AND 2000),
  message_type TEXT NOT NULL DEFAULT 'text' CHECK (message_type IN ('text', 'system', 'payment_proof')),
  attachment_url TEXT CHECK (attachment_url IS NULL OR char_length(attachment_url) <= 500),
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS verdex_p2p_chat_trade_idx
  ON public.verdex_p2p_chat_messages (trade_id, created_at);

CREATE INDEX IF NOT EXISTS verdex_p2p_chat_receiver_unread_idx
  ON public.verdex_p2p_chat_messages (receiver_user_id, is_read, created_at)
  WHERE is_read = FALSE;

-- RLS: only trade participants can see/send messages
ALTER TABLE public.verdex_p2p_chat_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.verdex_p2p_chat_messages FROM anon;
GRANT SELECT ON TABLE public.verdex_p2p_chat_messages TO authenticated;
GRANT INSERT ON TABLE public.verdex_p2p_chat_messages TO authenticated;

CREATE POLICY verdex_p2p_chat_select_participant
  ON public.verdex_p2p_chat_messages FOR SELECT TO authenticated
  USING (
    sender_user_id = auth.uid() OR receiver_user_id = auth.uid()
  );

CREATE POLICY verdex_p2p_chat_insert_sender
  ON public.verdex_p2p_chat_messages FOR INSERT TO authenticated
  WITH CHECK (sender_user_id = auth.uid());

-- Trigger to touch updated_at
DROP TRIGGER IF EXISTS verdex_p2p_chat_touch_updated_at ON public.verdex_p2p_chat_messages;
-- (No updated_at column on chat — it's append-only)

-- Append-only: no updates or deletes on chat messages
CREATE OR REPLACE FUNCTION public.verdex_p2p_chat_append_only()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public, pg_catalog
AS $$ BEGIN RAISE EXCEPTION 'Chat messages are append-only' USING ERRCODE = '55000'; END; $$;

DROP TRIGGER IF EXISTS verdex_p2p_chat_no_update ON public.verdex_p2p_chat_messages;
CREATE TRIGGER verdex_p2p_chat_no_update
  BEFORE UPDATE OR DELETE ON public.verdex_p2p_chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.verdex_p2p_chat_append_only();

-- ---------------------------------------------------------------------------
-- P2P Reputation — ratings after trade completion
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.verdex_p2p_rating_type AS ENUM ('positive', 'neutral', 'negative');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.verdex_p2p_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id UUID NOT NULL REFERENCES public.verdex_p2p_trades(id) ON DELETE RESTRICT,
  rater_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  rated_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  rating public.verdex_p2p_rating_type NOT NULL,
  score INTEGER NOT NULL DEFAULT 5 CHECK (score BETWEEN 1 AND 5),
  comment TEXT CHECK (comment IS NULL OR char_length(comment) <= 500),
  response TEXT CHECK (response IS NULL OR char_length(response) <= 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at TIMESTAMPTZ,
  CONSTRAINT verdex_p2p_ratings_counterparty_check CHECK (rater_user_id <> rated_user_id),
  CONSTRAINT verdex_p2p_ratings_unique UNIQUE (trade_id, rater_user_id)
);

CREATE INDEX IF NOT EXISTS verdex_p2p_ratings_rated_idx
  ON public.verdex_p2p_ratings (rated_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS verdex_p2p_ratings_rater_idx
  ON public.verdex_p2p_ratings (rater_user_id, created_at DESC);

-- RLS
ALTER TABLE public.verdex_p2p_ratings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.verdex_p2p_ratings FROM anon;
GRANT SELECT ON TABLE public.verdex_p2p_ratings TO authenticated;
GRANT INSERT ON TABLE public.verdex_p2p_ratings TO authenticated;

CREATE POLICY verdex_p2p_ratings_select_public
  ON public.verdex_p2p_ratings FOR SELECT TO authenticated
  USING (TRUE); -- Reputation is public within the platform

CREATE POLICY verdex_p2p_ratings_insert_rater
  ON public.verdex_p2p_ratings FOR INSERT TO authenticated
  WITH CHECK (rater_user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- P2P Reputation Summary — aggregated scores per user (materialized view)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.verdex_p2p_reputation_summary (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  total_trades INTEGER NOT NULL DEFAULT 0,
  total_ratings INTEGER NOT NULL DEFAULT 0,
  positive_ratings INTEGER NOT NULL DEFAULT 0,
  neutral_ratings INTEGER NOT NULL DEFAULT 0,
  negative_ratings INTEGER NOT NULL DEFAULT 0,
  avg_score NUMERIC(3,2) NOT NULL DEFAULT 0 CHECK (avg_score BETWEEN 0 AND 5),
  positive_percentage NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (positive_percentage BETWEEN 0 AND 100),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS verdex_p2p_reputation_avg_score_idx
  ON public.verdex_p2p_reputation_summary (avg_score DESC);

-- RLS: reputation is public
ALTER TABLE public.verdex_p2p_reputation_summary ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.verdex_p2p_reputation_summary FROM anon;
GRANT SELECT ON TABLE public.verdex_p2p_reputation_summary TO authenticated;

CREATE POLICY verdex_p2p_reputation_select_public
  ON public.verdex_p2p_reputation_summary FOR SELECT TO authenticated
  USING (TRUE);

-- Function to update reputation summary after a rating is inserted
CREATE OR REPLACE FUNCTION public.verdex_p2p_update_reputation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, extensions, public
AS $$
DECLARE
  v_rated UUID;
  v_total_ratings INTEGER;
  v_positive INTEGER;
  v_neutral INTEGER;
  v_negative INTEGER;
  v_avg NUMERIC(5,2);
  v_pct NUMERIC(7,2);
BEGIN
  v_rated := NEW.rated_user_id;

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE rating = 'positive'),
    COUNT(*) FILTER (WHERE rating = 'neutral'),
    COUNT(*) FILTER (WHERE rating = 'negative'),
    AVG(score)
  INTO v_total_ratings, v_positive, v_neutral, v_negative, v_avg
  FROM public.verdex_p2p_ratings WHERE rated_user_id = v_rated;

  v_pct := CASE WHEN v_total_ratings > 0 THEN (v_positive::NUMERIC / v_total_ratings * 100) ELSE 0 END;

  INSERT INTO public.verdex_p2p_reputation_summary (user_id, total_ratings, positive_ratings, neutral_ratings, negative_ratings, avg_score, positive_percentage, updated_at)
  VALUES (v_rated, v_total_ratings, v_positive, v_neutral, v_negative, COALESCE(v_avg, 0), v_pct, now())
  ON CONFLICT (user_id) DO UPDATE SET
    total_ratings = EXCLUDED.total_ratings,
    positive_ratings = EXCLUDED.positive_ratings,
    neutral_ratings = EXCLUDED.neutral_ratings,
    negative_ratings = EXCLUDED.negative_ratings,
    avg_score = EXCLUDED.avg_score,
    positive_percentage = EXCLUDED.positive_percentage,
    updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS verdex_p2p_rating_update_reputation ON public.verdex_p2p_ratings;
CREATE TRIGGER verdex_p2p_rating_update_reputation
  AFTER INSERT ON public.verdex_p2p_ratings
  FOR EACH ROW EXECUTE FUNCTION public.verdex_p2p_update_reputation();

REVOKE ALL ON FUNCTION public.verdex_p2p_update_reputation() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verdex_p2p_update_reputation() TO service_role;

-- ---------------------------------------------------------------------------
-- P2P User Blocks — users can block each other
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.verdex_p2p_user_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT verdex_p2p_user_blocks_unique UNIQUE (blocker_user_id, blocked_user_id),
  CONSTRAINT verdex_p2p_user_blocks_self_check CHECK (blocker_user_id <> blocked_user_id)
);

ALTER TABLE public.verdex_p2p_user_blocks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.verdex_p2p_user_blocks FROM anon;
GRANT SELECT ON TABLE public.verdex_p2p_user_blocks TO authenticated;
GRANT INSERT ON TABLE public.verdex_p2p_user_blocks TO authenticated;
GRANT DELETE ON TABLE public.verdex_p2p_user_blocks TO authenticated;

CREATE POLICY verdex_p2p_blocks_select_blocker
  ON public.verdex_p2p_user_blocks FOR SELECT TO authenticated
  USING (blocker_user_id = auth.uid() OR blocked_user_id = auth.uid());

CREATE POLICY verdex_p2p_blocks_insert_blocker
  ON public.verdex_p2p_user_blocks FOR INSERT TO authenticated
  WITH CHECK (blocker_user_id = auth.uid());

CREATE POLICY verdex_p2p_blocks_delete_blocker
  ON public.verdex_p2p_user_blocks FOR DELETE TO authenticated
  USING (blocker_user_id = auth.uid());

COMMENT ON TABLE public.verdex_p2p_chat_messages IS
  'In-trade chat messages between P2P counterparties. Append-only — no edits or deletes.';
COMMENT ON TABLE public.verdex_p2p_ratings IS
  'Post-trade ratings. One rating per rater per trade. Updates reputation summary via trigger.';
COMMENT ON TABLE public.verdex_p2p_reputation_summary IS
  'Aggregated reputation scores per user. Updated automatically when ratings are submitted.';

COMMIT;
