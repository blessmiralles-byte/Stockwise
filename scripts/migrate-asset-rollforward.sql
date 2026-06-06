-- ============================================================
-- StockWise — Fixed Asset Roll Forward support
-- Run in Supabase SQL Editor.
-- ============================================================
-- Adds the disposed_at timestamp needed to correctly place
-- disposals into accounting periods in the roll-forward report.
-- ============================================================

-- 1. Add disposed_at and disposed_by columns
ALTER TABLE public.fixed_assets
  ADD COLUMN IF NOT EXISTS disposed_at  timestamptz,
  ADD COLUMN IF NOT EXISTS disposed_by  uuid REFERENCES public.user_profiles(id);

-- 2. Back-fill: mark existing disposed assets as disposed on their created_at date.
--    created_at is the only historical timestamp available on this table.
--    This is a conservative approximation — update disposed_at manually on any
--    asset where the actual disposal date matters for roll-forward reporting.
UPDATE public.fixed_assets
   SET disposed_at  = created_at,
       disposed_by  = NULL
 WHERE status = 'disposed'
   AND disposed_at IS NULL;

-- 3. Index for roll-forward queries
CREATE INDEX IF NOT EXISTS idx_assets_disposed_at
  ON public.fixed_assets (disposed_at)
  WHERE disposed_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_assets_purchase_date
  ON public.fixed_assets (purchase_date)
  WHERE purchase_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_assets_category_id
  ON public.fixed_assets (category_id)
  WHERE category_id IS NOT NULL;

-- Done.
SELECT column_name, data_type
  FROM information_schema.columns
 WHERE table_name = 'fixed_assets'
   AND column_name IN ('disposed_at', 'disposed_by', 'purchase_date', 'purchase_cost', 'current_value')
 ORDER BY ordinal_position;
