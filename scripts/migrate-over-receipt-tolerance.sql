-- ============================================================
-- migrate-over-receipt-tolerance.sql
--
-- Adds a per-supplier over-receipt tolerance. When a supplier delivers more
-- than was ordered on a PO line, the goods receipt may accept up to
--   floor(quantity_ordered * (1 + tolerance/100)) - quantity_received
-- instead of rejecting the surplus. Default 0 = strict (no over-receipt),
-- preserving today's behaviour until set per supplier.
--
-- Run in the Supabase SQL Editor. Idempotent.
-- ============================================================

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS over_receipt_tolerance_pct numeric NOT NULL DEFAULT 0
    CHECK (over_receipt_tolerance_pct >= 0 AND over_receipt_tolerance_pct <= 100);
