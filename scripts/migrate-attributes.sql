-- ============================================================
-- StockWise — Product attributes & batch expiry migration
-- Run in Supabase SQL Editor
-- ============================================================

-- 1. Flexible attributes on products (size, color, brand, etc.)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS attributes   jsonb   DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS track_expiry boolean DEFAULT false;

-- 2. Expiration date + batch/lot number on inventory batches
ALTER TABLE public.inventory_batches
  ADD COLUMN IF NOT EXISTS expiration_date date,
  ADD COLUMN IF NOT EXISTS batch_no        text;

-- Index for expiry queries (find soon-to-expire batches)
CREATE INDEX IF NOT EXISTS idx_batches_expiry
  ON public.inventory_batches (expiration_date)
  WHERE expiration_date IS NOT NULL;
