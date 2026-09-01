-- ============================================================================
-- Recurring (preventive) maintenance
-- ============================================================================
-- A schedule can repeat every N days/weeks/months/years. When an occurrence is
-- completed the app creates the next one automatically, so preventive
-- maintenance keeps running instead of being a one-off to-do.
--
--   recurrence_every = NULL or 0  → one-off (existing behaviour, the default)
--   recurrence_every = 3, unit 'month' → every 3 months
--
-- recurrence_parent_id links generated occurrences back to the first schedule
-- so a whole series can be traced.
-- Idempotent — safe to re-run.
-- ============================================================================

ALTER TABLE public.maintenance_schedules
  ADD COLUMN IF NOT EXISTS recurrence_every    integer,
  ADD COLUMN IF NOT EXISTS recurrence_unit     text,
  ADD COLUMN IF NOT EXISTS recurrence_parent_id uuid REFERENCES public.maintenance_schedules(id) ON DELETE SET NULL;

ALTER TABLE public.maintenance_schedules
  DROP CONSTRAINT IF EXISTS maintenance_schedules_recurrence_unit_check;
ALTER TABLE public.maintenance_schedules
  ADD CONSTRAINT maintenance_schedules_recurrence_unit_check
  CHECK (recurrence_unit IS NULL OR recurrence_unit IN ('day', 'week', 'month', 'year'));

-- Interval must be positive when set.
ALTER TABLE public.maintenance_schedules
  DROP CONSTRAINT IF EXISTS maintenance_schedules_recurrence_every_check;
ALTER TABLE public.maintenance_schedules
  ADD CONSTRAINT maintenance_schedules_recurrence_every_check
  CHECK (recurrence_every IS NULL OR recurrence_every > 0);

-- Finding the next occurrence in a series
CREATE INDEX IF NOT EXISTS idx_maintenance_recurrence_parent
  ON public.maintenance_schedules (recurrence_parent_id);
