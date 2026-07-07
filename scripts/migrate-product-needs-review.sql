-- ============================================================
-- migrate-product-needs-review.sql
--
-- Products created on the fly during receiving (scanned barcode not yet in the
-- catalog, auto-created from the global barcode lookup) are flagged
-- needs_review = true so the dock is never blocked, but a manager can later
-- confirm the category, cost method, reorder point, etc., and clear the flag.
--
-- Run in the Supabase SQL Editor. Idempotent.
-- ============================================================

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS needs_review boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_products_needs_review
  ON public.products (org_id) WHERE needs_review;
