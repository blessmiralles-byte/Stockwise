-- ============================================================================
-- Trial lifecycle emails — remember what has been sent
-- ============================================================================
-- Trials currently end in silence: the first an owner hears is being locked
-- out, long after they stopped thinking about us. This records which
-- lifecycle email an organization has had, so the daily run sends each one
-- once and never repeats itself.
--
--   {"welcome": "2026-10-16T01:00:00Z", "day10": "...", "last_day": "...", "ended": "..."}
--
-- Additive / idempotent — safe to re-run.
-- ============================================================================

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS lifecycle_emails jsonb NOT NULL DEFAULT '{}'::jsonb;

NOTIFY pgrst, 'reload schema';
