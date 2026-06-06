-- ============================================================
-- StockWise — Fixed Assets v2: Depreciation + Warranty
-- Run in Supabase SQL Editor
-- ============================================================

-- 1. Depreciation columns
ALTER TABLE public.fixed_assets
  ADD COLUMN IF NOT EXISTS depreciation_method text DEFAULT 'straight_line'
    CHECK (depreciation_method IN (
      'straight_line', 'declining_balance', 'double_declining',
      'units_of_production', 'none'
    )),
  ADD COLUMN IF NOT EXISTS useful_life_years  integer,
  ADD COLUMN IF NOT EXISTS salvage_value      numeric(15, 2) DEFAULT 0;

-- 2. Warranty columns
ALTER TABLE public.fixed_assets
  ADD COLUMN IF NOT EXISTS warranty_provider text,
  ADD COLUMN IF NOT EXISTS warranty_number   text,
  ADD COLUMN IF NOT EXISTS warranty_expires  date,
  ADD COLUMN IF NOT EXISTS warranty_contact  text,
  ADD COLUMN IF NOT EXISTS warranty_notes    text;

-- 3. Index on warranty expiry so we can alert on expiring warranties
CREATE INDEX IF NOT EXISTS idx_assets_warranty_expires
  ON public.fixed_assets (warranty_expires)
  WHERE warranty_expires IS NOT NULL;

-- Done. Verify:
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'fixed_assets' ORDER BY ordinal_position;
