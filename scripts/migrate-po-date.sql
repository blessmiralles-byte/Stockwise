-- ============================================================
-- Add order_date to purchase_orders
-- The date the PO was issued (distinct from expected delivery date)
-- Safe to run multiple times
-- ============================================================

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS order_date date;
