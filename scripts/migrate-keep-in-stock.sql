-- ============================================================================
-- "Keep this item in stock" — say which products are meant to be held
-- ============================================================================
-- Until now a reorder point of 0 quietly meant "not managed this way", which
-- is a guess rather than a statement: nobody could tell a consumable that must
-- never run out from a one-off purchase that happens to sit at zero.
--
-- keep_in_stock makes it explicit. A stocked item alerts procurement when it
-- falls to its reorder point — or when it hits zero, if no level is set yet.
-- Items that aren't stocked are never flagged.
--
-- Backfill: anything that already has a reorder point was clearly meant to be
-- held, so it is marked stocked and nothing changes for existing customers.
--
-- Additive / idempotent — safe to re-run.
-- ============================================================================

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS keep_in_stock boolean NOT NULL DEFAULT false;

UPDATE public.products
   SET keep_in_stock = true
 WHERE keep_in_stock = false
   AND COALESCE(reorder_point, 0) > 0;

CREATE INDEX IF NOT EXISTS idx_products_keep_in_stock
  ON public.products(org_id, keep_in_stock)
  WHERE keep_in_stock;

NOTIFY pgrst, 'reload schema';
