-- ============================================================
-- migrate-stock-count-confirmations.sql
--
-- Stock-count attendees can be either logged-in team members (who must
-- confirm the count from their mobile app) or external people such as
-- auditors (free text, no confirmation required).
--
--   stock_count_attendees — one row per person present
--   expo_push_tokens      — device push tokens per user (for the mobile app)
--
-- Run in the Supabase SQL Editor. Idempotent.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.stock_count_attendees (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid,
  stock_count_id uuid NOT NULL REFERENCES public.stock_counts(id) ON DELETE CASCADE,
  user_id        uuid REFERENCES auth.users(id),          -- NULL => external (auditor)
  name           text NOT NULL,
  is_external    boolean NOT NULL DEFAULT false,
  confirmation_status text NOT NULL DEFAULT 'pending'
                      CHECK (confirmation_status IN ('pending','confirmed','disputed','not_required')),
  confirmed_at   timestamptz,
  note           text,
  created_at     timestamptz DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sca_count ON public.stock_count_attendees (stock_count_id);
CREATE INDEX IF NOT EXISTS idx_sca_user  ON public.stock_count_attendees (user_id);

-- One attendee row per user per count
CREATE UNIQUE INDEX IF NOT EXISTS uq_sca_count_user
  ON public.stock_count_attendees (stock_count_id, user_id)
  WHERE user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.expo_push_tokens (
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token      text NOT NULL,
  updated_at timestamptz DEFAULT NOW(),
  PRIMARY KEY (user_id, token)
);

CREATE INDEX IF NOT EXISTS idx_expo_tokens_user ON public.expo_push_tokens (user_id);
