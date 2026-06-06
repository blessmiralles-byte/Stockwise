-- ============================================================
-- StockWise v2 — Supply Chain Migration
-- Run in Supabase SQL Editor
-- ============================================================

-- ── 1. Suppliers ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.suppliers (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text        NOT NULL,
  contact_name    text,
  email           text,
  phone           text,
  lead_time_days  integer     NOT NULL DEFAULT 7,
  payment_terms   text,
  notes           text,
  is_active       boolean     NOT NULL DEFAULT true,
  created_at      timestamptz DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_suppliers_active ON public.suppliers (is_active);

-- ── 2. Extend products ───────────────────────────────────────
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS supplier_id    uuid REFERENCES public.suppliers(id),
  ADD COLUMN IF NOT EXISTS lead_time_days integer DEFAULT NULL,  -- overrides supplier if set
  ADD COLUMN IF NOT EXISTS safety_stock   integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS abc_class      char(1),
  ADD COLUMN IF NOT EXISTS xyz_class      char(1),
  ADD COLUMN IF NOT EXISTS abc_xyz_updated_at timestamptz;

-- ── 3. Purchase Orders ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.purchase_orders (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number     text        UNIQUE NOT NULL,
  supplier_id   uuid        REFERENCES public.suppliers(id),
  status        text        NOT NULL DEFAULT 'draft'
                            CHECK (status IN ('draft','sent','partial','received','cancelled')),
  expected_date date,
  notes         text,
  created_by    uuid        REFERENCES auth.users(id),
  created_at    timestamptz DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.purchase_order_lines (
  id               uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id uuid   NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  product_id        uuid   NOT NULL REFERENCES public.products(id),
  quantity_ordered  integer NOT NULL CHECK (quantity_ordered > 0),
  quantity_received integer NOT NULL DEFAULT 0,
  unit_cost         numeric NOT NULL DEFAULT 0,
  notes             text,
  created_at        timestamptz DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_po_status     ON public.purchase_orders (status);
CREATE INDEX IF NOT EXISTS idx_pol_po        ON public.purchase_order_lines (purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_pol_product   ON public.purchase_order_lines (product_id);

-- ── 4. Stock Counts ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.stock_counts (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  count_number text        UNIQUE NOT NULL,
  location_id  uuid        REFERENCES public.locations(id),
  status       text        NOT NULL DEFAULT 'open'
                           CHECK (status IN ('open','counting','reviewing','approved','cancelled')),
  notes        text,
  created_by   uuid        REFERENCES auth.users(id),
  approved_by  uuid        REFERENCES auth.users(id),
  created_at   timestamptz DEFAULT NOW(),
  approved_at  timestamptz
);

CREATE TABLE IF NOT EXISTS public.stock_count_lines (
  id            uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_count_id uuid   NOT NULL REFERENCES public.stock_counts(id) ON DELETE CASCADE,
  product_id    uuid    NOT NULL REFERENCES public.products(id),
  location_id   uuid    NOT NULL REFERENCES public.locations(id),
  system_qty    numeric NOT NULL DEFAULT 0,
  counted_qty   numeric,            -- NULL until physically counted
  variance      numeric GENERATED ALWAYS AS (
    CASE WHEN counted_qty IS NOT NULL THEN counted_qty - system_qty ELSE NULL END
  ) STORED,
  notes         text
);

CREATE INDEX IF NOT EXISTS idx_sc_status  ON public.stock_counts (status);
CREATE INDEX IF NOT EXISTS idx_scl_count  ON public.stock_count_lines (stock_count_id);

-- ── 5. job_order_id on transactions (cross-system ref for JobLedger) ──────────
-- job_order_id is already a plain text/uuid column on inventory_transactions
-- if it does not exist yet, add it:
ALTER TABLE public.inventory_transactions
  ADD COLUMN IF NOT EXISTS job_order_id text;   -- stores JobLedger job reference (e.g. JOB-2026-001)
