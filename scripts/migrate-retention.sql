-- ============================================================================
-- Data retention for accounts nobody comes back to
-- ============================================================================
-- Ninety days after an account stops being paid for, with two warnings and a
-- download link first. Keeping abandoned trials forever means holding other
-- people's business data — and their staff's and customers' names — with no
-- reason to.
--
--   inactive_since    when a cancelled account first went quiet (a lapsed
--                     trial dates from trial_ends_at, which we already know)
--   retention_emails  {"warn_first": "...", "warn_final": "..."} so a warning
--                     is sent once, and nothing is deleted unwarned
--
-- The deletion itself stays off until RETENTION_PURGE=on is set in the
-- environment; until then the job only warns and reports what it would remove.
--
-- Additive / idempotent — safe to re-run.
-- ============================================================================

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS inactive_since   timestamptz,
  ADD COLUMN IF NOT EXISTS retention_emails jsonb NOT NULL DEFAULT '{}'::jsonb;

NOTIFY pgrst, 'reload schema';
