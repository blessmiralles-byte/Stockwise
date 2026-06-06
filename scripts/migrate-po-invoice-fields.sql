-- ── Supplier Invoice fields on purchase_orders ────────────────────────────────
-- Run this in Supabase SQL Editor to enable three-way match (PO / GRN / Invoice).
-- Safe to run multiple times.

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS supplier_invoice_no     text,
  ADD COLUMN IF NOT EXISTS supplier_invoice_date   date,
  ADD COLUMN IF NOT EXISTS supplier_invoice_amount numeric(14,2);

-- Add index — include org_id only if that column already exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'purchase_orders'
      AND column_name  = 'org_id'
  ) THEN
    -- Multi-tenant index (org_id already present)
    EXECUTE $idx$
      CREATE INDEX IF NOT EXISTS idx_po_invoice_no
        ON public.purchase_orders(org_id, supplier_invoice_no)
        WHERE supplier_invoice_no IS NOT NULL
    $idx$;
  ELSE
    -- Single-tenant index (no org_id yet)
    EXECUTE $idx$
      CREATE INDEX IF NOT EXISTS idx_po_invoice_no
        ON public.purchase_orders(supplier_invoice_no)
        WHERE supplier_invoice_no IS NOT NULL
    $idx$;
  END IF;
END $$;
