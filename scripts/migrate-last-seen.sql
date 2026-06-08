-- ─────────────────────────────────────────────────────────────────────────────
-- Add last_seen_at to user_profiles
-- Run this in Supabase SQL Editor (or via CLI).
--
-- The proxy (src/proxy.ts) updates this column at most once per minute per user
-- using the service role key, so support teams can see which users are active.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

-- Index for admin metrics queries (filter by last_seen_at >= 7 days ago etc.)
CREATE INDEX IF NOT EXISTS idx_user_profiles_last_seen
  ON public.user_profiles (last_seen_at DESC NULLS LAST);

-- Allow the service role (used by the proxy) to update this column.
-- RLS is already enabled; we just need to confirm service_role bypass is in place.
-- No additional policy needed — service_role bypasses RLS by default in Supabase.

-- Record in migration tracker (safe to ignore if migrate-tracking.sql hasn't been run yet)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'schema_migrations'
  ) THEN
    INSERT INTO public.schema_migrations (name, applied_by, notes)
    VALUES ('migrate-last-seen.sql', 'deploy', 'Add last_seen_at + index to user_profiles')
    ON CONFLICT (name) DO NOTHING;
  END IF;
END $$;
