-- ============================================================
-- Add org_id and other missing columns to purchase_orders
-- and purchase_order_lines
-- Safe to run multiple times
-- ============================================================

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS org_id       uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS created_by   uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS order_date   date;

ALTER TABLE public.purchase_order_lines
  ADD COLUMN IF NOT EXISTS org_id          uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS received_by     text,
  ADD COLUMN IF NOT EXISTS condition       text,
  ADD COLUMN IF NOT EXISTS condition_notes text;

CREATE INDEX IF NOT EXISTS idx_purchase_orders_org      ON public.purchase_orders (org_id);
CREATE INDEX IF NOT EXISTS idx_purchase_order_lines_org ON public.purchase_order_lines (org_id);
