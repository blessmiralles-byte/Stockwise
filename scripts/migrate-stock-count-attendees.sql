-- ============================================================
-- migrate-stock-count-attendees.sql
--
-- Records who was physically present during a stock count (counters /
-- witnesses) for audit purposes. Stored as a free-text list of names.
--
-- Run in the Supabase SQL Editor. Idempotent.
-- ============================================================

ALTER TABLE public.stock_counts
  ADD COLUMN IF NOT EXISTS attendees text;
