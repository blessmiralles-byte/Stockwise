-- ============================================================================
-- Maintenance schedules — ensure every column the app writes actually exists
-- ============================================================================
-- The base maintenance_schedules table was created outside scripts/, so these
-- columns were never guaranteed by a migration. The app writes all of them:
--   completed_date / performed_by / cost  → PATCH /api/maintenance/[id]
--   notify_days_before                    → POST  /api/maintenance
-- A missing column makes "Mark as Done" fail with a generic 500.
--
-- Idempotent: if the columns already exist this is a no-op.
-- ============================================================================

ALTER TABLE public.maintenance_schedules
  ADD COLUMN IF NOT EXISTS completed_date     date,
  ADD COLUMN IF NOT EXISTS performed_by       text,
  ADD COLUMN IF NOT EXISTS cost               numeric(14,2),
  ADD COLUMN IF NOT EXISTS notify_days_before integer NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS notes              text,
  ADD COLUMN IF NOT EXISTS description        text;

-- Status must allow the three states the app uses. Only (re)create the
-- constraint if it is missing or disagrees.
ALTER TABLE public.maintenance_schedules
  DROP CONSTRAINT IF EXISTS maintenance_schedules_status_check;
ALTER TABLE public.maintenance_schedules
  ADD CONSTRAINT maintenance_schedules_status_check
  CHECK (status IN ('scheduled', 'overdue', 'completed'));

-- Verify (run separately to inspect the resulting shape):
--   SELECT column_name, data_type, is_nullable
--     FROM information_schema.columns
--    WHERE table_name = 'maintenance_schedules'
--    ORDER BY ordinal_position;
