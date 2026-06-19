-- ============================================================
-- Fix: ensure products table has all required columns
-- Safe to run multiple times (all statements are idempotent)
-- ============================================================

-- 1. org_id (added by multitenancy migration — may be missing)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_products_org ON public.products (org_id);

-- 2. Flexible attributes and expiry tracking (migrate-attributes.sql)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS attributes   jsonb   DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS track_expiry boolean DEFAULT false;

-- 3. Supply-chain columns (migrate-v2.sql)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS supplier_id    uuid REFERENCES public.suppliers(id),
  ADD COLUMN IF NOT EXISTS lead_time_days integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS safety_stock   integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS abc_class      char(1),
  ADD COLUMN IF NOT EXISTS xyz_class      char(1),
  ADD COLUMN IF NOT EXISTS abc_xyz_updated_at timestamptz;

-- 4. Expiry columns on inventory_batches (migrate-attributes.sql)
ALTER TABLE public.inventory_batches
  ADD COLUMN IF NOT EXISTS expiration_date date,
  ADD COLUMN IF NOT EXISTS batch_no        text;

CREATE INDEX IF NOT EXISTS idx_batches_expiry
  ON public.inventory_batches (expiration_date)
  WHERE expiration_date IS NOT NULL;

-- 5. org_id on inventory_batches (multitenancy)
ALTER TABLE public.inventory_batches
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
