-- ============================================================
-- StockWise — Field Worker App Schema Patches
-- Run in Supabase SQL Editor
-- ============================================================

-- 1. Add reported_by to maintenance_schedules (tracks who reported the issue)
ALTER TABLE public.maintenance_schedules
  ADD COLUMN IF NOT EXISTS reported_by uuid REFERENCES auth.users(id);

-- 2. Add notes to fixed_assets (field notes / condition notes)
ALTER TABLE public.fixed_assets
  ADD COLUMN IF NOT EXISTS notes text;

-- Done. Verify with:
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'maintenance_schedules';
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'fixed_assets';
