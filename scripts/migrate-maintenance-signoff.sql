-- ============================================================================
-- Maintenance sign-off — who logged the completion
-- ============================================================================
-- Distinct from `performed_by`, which is free text for whoever did the physical
-- work (often an external vendor or a crew member with no login). These two
-- columns record the AUTHENTICATED USER who signed the job off, set by the
-- server so they cannot be typed or spoofed:
--
--   completed_by → the user who marked it done (FK to user_profiles so the name
--                  can be embedded: signed_off_by:user_profiles!completed_by(...))
--   completed_at → server timestamp of the sign-off, as opposed to
--                  completed_date, which is the (user-supplied) date the work
--                  was actually carried out.
--
-- Idempotent — safe to re-run.
-- ============================================================================

ALTER TABLE public.maintenance_schedules
  ADD COLUMN IF NOT EXISTS completed_by uuid REFERENCES public.user_profiles(id),
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_maintenance_completed_by
  ON public.maintenance_schedules (completed_by);

-- PostgREST caches the schema; make the new columns visible immediately.
NOTIFY pgrst, 'reload schema';
