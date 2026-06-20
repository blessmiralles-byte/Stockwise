-- ============================================================
-- Add missing columns to purchase_orders and purchase_order_lines
-- Safe to run multiple times
-- ============================================================

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS created_by  uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS order_date  date;

ALTER TABLE public.purchase_order_lines
  ADD COLUMN IF NOT EXISTS received_by     text,
  ADD COLUMN IF NOT EXISTS condition       text,
  ADD COLUMN IF NOT EXISTS condition_notes text;
