-- ============================================================
-- reconcile-inventory-balances.sql
--
-- Resyncs inventory_balances.quantity (the "On Hand" figure shown on the
-- Inventory tab and the Ledger header) with the posted transaction ledger
-- (the running balance shown in the Ledger table).
--
-- They drifted because some outbound movements — notably requisition
-- consumptions recorded with no from_location_id — were written as
-- transactions but never decremented a location balance. The ledger
-- (computed from transactions) showed the correct net, while the balance
-- row stayed stale (e.g. A4 Bond paper: On Hand 80 vs Closing Balance 33).
--
-- Run this ONCE in the Supabase SQL Editor after deploying fix-rpc-nuclear.sql.
-- Idempotent and safe to re-run.
--
-- Sign convention (matches the Ledger view):
--   purchase            → +quantity
--   consumption / sale  → −quantity   (outbound)
--   adjustment          → +quantity   (already SIGNED; shortages are negative)
--   transfer            → nets to zero across locations (ignored in the
--                         single-location reconciliation below)
-- ============================================================

-- ── Preview: balances that disagree with the ledger ──────────────────────────
WITH ledger_net AS (
  SELECT product_id,
         SUM(CASE transaction_type
               WHEN 'purchase'    THEN  ABS(quantity)
               WHEN 'consumption' THEN -ABS(quantity)
               WHEN 'sale'        THEN -ABS(quantity)
               WHEN 'adjustment'  THEN  quantity         -- signed
               ELSE 0                                     -- transfer: nets to 0
             END) AS net_qty
    FROM public.inventory_transactions
   WHERE status <> 'draft'
   GROUP BY product_id
),
single_loc AS (   -- products tracked at exactly one location
  SELECT product_id, MIN(id) AS bal_id
    FROM public.inventory_balances
   GROUP BY product_id
  HAVING COUNT(*) = 1
)
SELECT p.name, p.sku,
       b.quantity        AS on_hand_before,
       ln.net_qty        AS ledger_net,
       (ln.net_qty - b.quantity) AS delta
  FROM public.inventory_balances b
  JOIN single_loc  s  ON s.bal_id     = b.id
  JOIN ledger_net  ln ON ln.product_id = b.product_id
  JOIN public.products p ON p.id = b.product_id
 WHERE b.quantity IS DISTINCT FROM ln.net_qty
 ORDER BY p.name;

-- ── Apply: set On Hand = ledger net for single-location products ──────────────
WITH ledger_net AS (
  SELECT product_id,
         SUM(CASE transaction_type
               WHEN 'purchase'    THEN  ABS(quantity)
               WHEN 'consumption' THEN -ABS(quantity)
               WHEN 'sale'        THEN -ABS(quantity)
               WHEN 'adjustment'  THEN  quantity
               ELSE 0
             END) AS net_qty
    FROM public.inventory_transactions
   WHERE status <> 'draft'
   GROUP BY product_id
),
single_loc AS (
  SELECT product_id, MIN(id) AS bal_id
    FROM public.inventory_balances
   GROUP BY product_id
  HAVING COUNT(*) = 1
)
UPDATE public.inventory_balances b
   SET quantity     = ln.net_qty,
       last_updated = NOW()
  FROM ledger_net ln
  JOIN single_loc s ON s.product_id = ln.product_id
 WHERE b.id = s.bal_id
   AND b.quantity IS DISTINCT FROM ln.net_qty;

-- ── Refresh FIFO avg_cost from open layers so Stock Value stays correct ───────
UPDATE public.inventory_balances b
   SET avg_cost = layers.wac,
       last_updated = NOW()
  FROM (
    SELECT ib.product_id, ib.location_id,
           SUM(ib.quantity_remaining * ib.unit_cost)::numeric
             / NULLIF(SUM(ib.quantity_remaining), 0) AS wac
      FROM public.inventory_batches ib
     WHERE ib.quantity_remaining > 0
     GROUP BY ib.product_id, ib.location_id
  ) layers
  JOIN public.products p ON p.id = layers.product_id
 WHERE b.product_id  = layers.product_id
   AND b.location_id = layers.location_id
   AND p.cost_method = 'fifo'
   AND layers.wac IS NOT NULL
   AND COALESCE(b.avg_cost, 0) <> layers.wac;

-- ── Verify: balances now equal the ledger ────────────────────────────────────
WITH ledger_net AS (
  SELECT product_id,
         SUM(CASE transaction_type
               WHEN 'purchase'    THEN  ABS(quantity)
               WHEN 'consumption' THEN -ABS(quantity)
               WHEN 'sale'        THEN -ABS(quantity)
               WHEN 'adjustment'  THEN  quantity
               ELSE 0
             END) AS net_qty
    FROM public.inventory_transactions
   WHERE status <> 'draft'
   GROUP BY product_id
)
SELECT p.name, p.sku, b.quantity AS on_hand, ln.net_qty AS ledger_net
  FROM public.inventory_balances b
  JOIN ledger_net ln ON ln.product_id = b.product_id
  JOIN public.products p ON p.id = b.product_id
 ORDER BY p.name;
