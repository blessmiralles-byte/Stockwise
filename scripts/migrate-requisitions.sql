-- ============================================================
-- StockWise — Asset & Inventory Requisitions
-- Run in Supabase SQL Editor
-- ============================================================

-- 1. Main requisitions table
CREATE TABLE IF NOT EXISTS public.requisitions (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  req_number    text UNIQUE NOT NULL,
  type          text NOT NULL CHECK (type IN ('checkout', 'new_asset', 'inventory')),
  status        text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'checked_out', 'returned', 'fulfilled')),
  requested_by  uuid REFERENCES public.user_profiles(id) NOT NULL,
  approved_by   uuid REFERENCES public.user_profiles(id),
  job_reference text,
  -- For inventory type: which location to pull stock from
  location_id   uuid REFERENCES public.locations(id),
  notes         text,
  reject_reason text,
  required_by   date,
  approved_at   timestamptz,
  fulfilled_at  timestamptz,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

-- 2. Line items
--    item_type 'asset'   → references fixed_assets (checkout requests)
--    item_type 'product' → references products     (inventory requests)
--    item_type 'new'     → free-text only (new asset purchase requests)
CREATE TABLE IF NOT EXISTS public.requisition_items (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  requisition_id  uuid REFERENCES public.requisitions(id) ON DELETE CASCADE NOT NULL,
  item_type       text NOT NULL CHECK (item_type IN ('asset', 'product', 'new')),
  asset_id        uuid REFERENCES public.fixed_assets(id),
  product_id      uuid REFERENCES public.products(id),
  quantity        numeric(12, 3) DEFAULT 1,
  unit_cost       numeric(15, 2),   -- estimated cost for 'new' items
  notes           text,             -- description / spec for 'new' items
  returned_at     timestamptz       -- set when individual asset is returned
);

-- 3. Auto-update updated_at
CREATE OR REPLACE FUNCTION public.set_requisition_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_requisitions_updated_at ON public.requisitions;
CREATE TRIGGER trg_requisitions_updated_at
  BEFORE UPDATE ON public.requisitions
  FOR EACH ROW EXECUTE FUNCTION public.set_requisition_updated_at();

-- 4. Indexes
CREATE INDEX IF NOT EXISTS idx_requisitions_requested_by ON public.requisitions(requested_by);
CREATE INDEX IF NOT EXISTS idx_requisitions_status       ON public.requisitions(status);
CREATE INDEX IF NOT EXISTS idx_requisitions_type         ON public.requisitions(type);
CREATE INDEX IF NOT EXISTS idx_req_items_req_id          ON public.requisition_items(requisition_id);

-- Done. Verify:
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'requisitions' ORDER BY ordinal_position;
