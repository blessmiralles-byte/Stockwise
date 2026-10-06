-- ============================================================================
-- Reorder alerts — tell procurement when stock crosses its reorder point
-- ============================================================================
-- A reorder point was only a number on a page: the dashboard counted low items
-- and the inventory list could filter them, but nobody was told and nothing
-- started a purchase order.
--
-- One row per product that has crossed its reorder point, so the daily digest
-- reports a crossing ONCE instead of nagging every morning. The row closes when
-- stock recovers, or when procurement raises a PO from it.
--
--   status  open      below the reorder point, nothing ordered yet
--           ordered   a draft PO covers it (po_id)
--           resolved  stock came back above the line
--
-- Additive / idempotent — safe to re-run.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.reorder_alerts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL,
  product_id     uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  status         text NOT NULL DEFAULT 'open'
                      CHECK (status IN ('open', 'ordered', 'resolved')),
  -- snapshot at the moment it crossed, so the digest and the PO agree
  quantity_at_trigger numeric(14, 3),
  reorder_point       numeric(14, 3),
  suggested_qty       numeric(14, 3),
  po_id          uuid REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  triggered_at   timestamptz NOT NULL DEFAULT now(),
  notified_at    timestamptz,
  resolved_at    timestamptz
);

CREATE INDEX IF NOT EXISTS idx_reorder_alerts_org ON public.reorder_alerts(org_id, status);

-- One live alert per product: the daily run upserts against this.
CREATE UNIQUE INDEX IF NOT EXISTS idx_reorder_alerts_live
  ON public.reorder_alerts(org_id, product_id)
  WHERE status IN ('open', 'ordered');

-- Reached only through the API's service client.
ALTER TABLE public.reorder_alerts ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
