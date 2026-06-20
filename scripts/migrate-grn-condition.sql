-- ============================================================
-- Add receiving detail columns to purchase_order_lines
-- Safe to run multiple times
-- ============================================================

ALTER TABLE public.purchase_order_lines
  ADD COLUMN IF NOT EXISTS received_by      text,
  ADD COLUMN IF NOT EXISTS condition        text CHECK (condition IN ('good', 'damaged', 'missing')),
  ADD COLUMN IF NOT EXISTS condition_notes  text;
