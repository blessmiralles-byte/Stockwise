-- ============================================================================
-- Link a purchase order back to the requisition that asked for it
-- ============================================================================
-- Procurement turns an approved requisition into a draft PO. The link lets the
-- PO's approvers see what was originally requested — quantities and estimated
-- prices — next to what procurement actually negotiated, so a price increase
-- between request and order is visible at the moment of approval.
--
--   purchase_orders.requisition_id        the request this PO came from
--   purchase_order_lines.requisition_item_id  the requested line it covers
--
-- Additive / idempotent — safe to re-run.
-- ============================================================================

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS requisition_id uuid REFERENCES public.requisitions(id) ON DELETE SET NULL;

ALTER TABLE public.purchase_order_lines
  ADD COLUMN IF NOT EXISTS requisition_item_id uuid REFERENCES public.requisition_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_purchase_orders_requisition ON public.purchase_orders(requisition_id);

NOTIFY pgrst, 'reload schema';
