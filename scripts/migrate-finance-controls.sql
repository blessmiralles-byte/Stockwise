-- ============================================================
-- StockWise — Finance Controls  (FC-1, FC-2, Cost Centers)
-- Run in Supabase SQL Editor AFTER all previous migrations.
-- ============================================================
-- Delivers:
--   FC-1  Asset depreciation log + calculation support
--   FC-2  Accounting period lock (blocks transactions in closed periods)
--   CC    Cost centers + job codes on requisitions & inventory transactions
-- ============================================================

-- ── 1. Cost Centers ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cost_centers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text NOT NULL UNIQUE,
  name        text NOT NULL,
  description text,
  is_active   boolean NOT NULL DEFAULT true,
  created_by  uuid REFERENCES public.user_profiles(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cost_centers_code ON public.cost_centers (code) WHERE is_active = true;

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'cost_centers_updated_at'
  ) THEN
    CREATE TRIGGER cost_centers_updated_at
      BEFORE UPDATE ON public.cost_centers
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- ── 2. Accounting Periods ────────────────────────────────────
-- btree_gist is required for the EXCLUDE USING gist overlap constraint below.
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE IF NOT EXISTS public.accounting_periods (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,                       -- e.g. "May 2026"
  period_start date NOT NULL,
  period_end   date NOT NULL,
  status       text NOT NULL DEFAULT 'open'
                 CHECK (status IN ('open', 'closed')),
  closed_by    uuid REFERENCES public.user_profiles(id),
  closed_at    timestamptz,
  notes        text,
  created_by   uuid REFERENCES public.user_profiles(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT periods_no_overlap EXCLUDE USING gist (
    daterange(period_start, period_end, '[]') WITH &&
  )
);

CREATE INDEX IF NOT EXISTS idx_periods_status ON public.accounting_periods (status);

-- Helper: returns true if the given date falls in an open (or non-existent) period.
-- Transactions are blocked if the date falls in a CLOSED period.
CREATE OR REPLACE FUNCTION public.is_period_open(p_date date)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_closed boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.accounting_periods
     WHERE status       = 'closed'
       AND p_date BETWEEN period_start AND period_end
  ) INTO v_closed;
  RETURN NOT v_closed;
END;
$$;

-- ── 3. New columns on inventory_transactions ─────────────────
ALTER TABLE public.inventory_transactions
  ADD COLUMN IF NOT EXISTS cost_center_id uuid REFERENCES public.cost_centers(id),
  ADD COLUMN IF NOT EXISTS job_code        text;

CREATE INDEX IF NOT EXISTS idx_inv_tx_cost_center
  ON public.inventory_transactions (cost_center_id)
  WHERE cost_center_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inv_tx_job_code
  ON public.inventory_transactions (job_code)
  WHERE job_code IS NOT NULL;

-- ── 4. New columns on requisitions ───────────────────────────
ALTER TABLE public.requisitions
  ADD COLUMN IF NOT EXISTS cost_center_id uuid REFERENCES public.cost_centers(id),
  ADD COLUMN IF NOT EXISTS job_code        text;

CREATE INDEX IF NOT EXISTS idx_req_cost_center
  ON public.requisitions (cost_center_id)
  WHERE cost_center_id IS NOT NULL;

-- ── 5. Asset Depreciation Log ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.asset_depreciation_log (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id           uuid NOT NULL REFERENCES public.fixed_assets(id),
  period_start       date NOT NULL,
  period_end         date NOT NULL,
  method             text NOT NULL,
  depreciation_amount numeric(15,2) NOT NULL,
  book_value_before  numeric(15,2) NOT NULL,
  book_value_after   numeric(15,2) NOT NULL,
  run_by             uuid REFERENCES public.user_profiles(id),
  run_at             timestamptz NOT NULL DEFAULT now(),
  notes              text,
  UNIQUE (asset_id, period_start, period_end)   -- idempotent: can't double-post same period
);

CREATE INDEX IF NOT EXISTS idx_depr_log_asset    ON public.asset_depreciation_log (asset_id);
CREATE INDEX IF NOT EXISTS idx_depr_log_period   ON public.asset_depreciation_log (period_start, period_end);

-- ── 6. Updated record_inventory_movement RPC ────────────────
-- Adds period-lock check + cost_center_id / job_code columns.
-- Backward-compatible: new params default to NULL.
CREATE OR REPLACE FUNCTION public.record_inventory_movement(
  p_transaction_type text,
  p_product_id       uuid,
  p_quantity         integer,
  p_unit_cost        numeric    DEFAULT 0,
  p_from_location_id uuid       DEFAULT NULL,
  p_to_location_id   uuid       DEFAULT NULL,
  p_reference_no     text       DEFAULT NULL,
  p_notes            text       DEFAULT NULL,
  p_customer_id      text       DEFAULT NULL,
  p_created_by       uuid       DEFAULT NULL,
  p_batch_no         text       DEFAULT NULL,
  p_expiration_date  date       DEFAULT NULL,
  p_job_order_id     text       DEFAULT NULL,
  p_cost_center_id   uuid       DEFAULT NULL,
  p_job_code         text       DEFAULT NULL
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER AS $$
DECLARE
  v_product  record;
  v_tx_id    uuid;
  v_balance  record;
BEGIN
  -- ── Period lock check ─────────────────────────────────────
  IF NOT public.is_period_open(CURRENT_DATE) THEN
    RAISE EXCEPTION 'Accounting period containing % is closed. No transactions may be posted.', CURRENT_DATE;
  END IF;

  -- ── Validate inputs ───────────────────────────────────────
  IF p_transaction_type NOT IN ('purchase','transfer','consumption','sale','adjustment') THEN
    RAISE EXCEPTION 'Invalid transaction_type: %', p_transaction_type;
  END IF;

  IF p_transaction_type != 'adjustment' AND p_quantity <= 0 THEN
    RAISE EXCEPTION 'quantity must be a positive integer';
  END IF;

  IF p_transaction_type = 'adjustment' AND p_quantity = 0 THEN
    RAISE EXCEPTION 'adjustment quantity cannot be zero';
  END IF;

  IF p_transaction_type = 'transfer'
     AND p_from_location_id IS NOT NULL
     AND p_to_location_id   IS NOT NULL
     AND p_from_location_id = p_to_location_id
  THEN
    RAISE EXCEPTION 'Source and destination must be different for a transfer';
  END IF;

  -- ── Load product ──────────────────────────────────────────
  SELECT id, cost_method INTO v_product
    FROM public.products
   WHERE id = p_product_id AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found or inactive: %', p_product_id;
  END IF;

  -- ── Insert transaction record ─────────────────────────────
  INSERT INTO public.inventory_transactions (
    transaction_type, product_id,
    from_location_id, to_location_id,
    quantity, unit_cost,
    reference_no, notes, customer_id, created_by,
    cost_center_id, job_code
  ) VALUES (
    p_transaction_type, p_product_id,
    p_from_location_id, p_to_location_id,
    p_quantity, COALESCE(p_unit_cost, 0),
    p_reference_no, p_notes, p_customer_id, p_created_by,
    p_cost_center_id, p_job_code
  )
  RETURNING id INTO v_tx_id;

  -- ── Update balances ───────────────────────────────────────
  IF p_transaction_type = 'purchase' THEN
    IF p_to_location_id IS NOT NULL THEN
      PERFORM public.upsert_inventory_balance(
        p_product_id, p_to_location_id, p_quantity,
        COALESCE(p_unit_cost, 0), v_product.cost_method
      );
    END IF;
    IF v_product.cost_method = 'fifo' AND p_to_location_id IS NOT NULL THEN
      INSERT INTO public.inventory_batches (
        product_id, location_id, purchase_date,
        quantity_remaining, unit_cost,
        reference_no, batch_no, expiration_date
      ) VALUES (
        p_product_id, p_to_location_id, CURRENT_DATE,
        p_quantity, COALESCE(p_unit_cost, 0),
        p_reference_no, p_batch_no, p_expiration_date
      );
    END IF;

  ELSIF p_transaction_type = 'transfer' THEN
    IF p_from_location_id IS NOT NULL THEN
      SELECT quantity INTO v_balance
        FROM public.inventory_balances
       WHERE product_id  = p_product_id
         AND location_id = p_from_location_id
         FOR UPDATE;
      IF NOT FOUND OR v_balance.quantity < p_quantity THEN
        RAISE EXCEPTION 'Insufficient stock. Available: %, requested: %',
          COALESCE(v_balance.quantity, 0), p_quantity;
      END IF;
      PERFORM public.upsert_inventory_balance(
        p_product_id, p_from_location_id, -p_quantity,
        COALESCE(p_unit_cost, 0), v_product.cost_method
      );
    END IF;
    IF p_to_location_id IS NOT NULL THEN
      PERFORM public.upsert_inventory_balance(
        p_product_id, p_to_location_id, p_quantity,
        COALESCE(p_unit_cost, 0), v_product.cost_method
      );
    END IF;

  ELSIF p_transaction_type IN ('consumption', 'sale') THEN
    IF p_from_location_id IS NOT NULL THEN
      SELECT quantity INTO v_balance
        FROM public.inventory_balances
       WHERE product_id  = p_product_id
         AND location_id = p_from_location_id
         FOR UPDATE;
      IF NOT FOUND OR v_balance.quantity < p_quantity THEN
        RAISE EXCEPTION 'Insufficient stock. Available: %, requested: %',
          COALESCE(v_balance.quantity, 0), p_quantity;
      END IF;
      PERFORM public.upsert_inventory_balance(
        p_product_id, p_from_location_id, -p_quantity,
        COALESCE(p_unit_cost, 0), v_product.cost_method
      );
    END IF;

  ELSIF p_transaction_type = 'adjustment' THEN
    DECLARE v_loc uuid := COALESCE(p_to_location_id, p_from_location_id);
    BEGIN
      IF v_loc IS NOT NULL THEN
        PERFORM public.upsert_inventory_balance(
          p_product_id, v_loc, p_quantity,
          COALESCE(p_unit_cost, 0), v_product.cost_method
        );
      END IF;
    END;
  END IF;

  RETURN json_build_object('transaction_id', v_tx_id, 'success', true);
END;
$$;

-- ── 7. RLS ────────────────────────────────────────────────────

-- cost_centers: all authenticated can read; owner/procurement/finance can write
ALTER TABLE public.cost_centers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cost_centers_read"  ON public.cost_centers;
DROP POLICY IF EXISTS "cost_centers_write" ON public.cost_centers;

CREATE POLICY "cost_centers_read" ON public.cost_centers
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "cost_centers_write" ON public.cost_centers
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
       WHERE id = auth.uid()
         AND role IN ('owner', 'admin', 'procurement', 'finance')
    )
  );

-- accounting_periods: finance/owner read + write; others read only
ALTER TABLE public.accounting_periods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "periods_read"  ON public.accounting_periods;
DROP POLICY IF EXISTS "periods_write" ON public.accounting_periods;

CREATE POLICY "periods_read" ON public.accounting_periods
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "periods_write" ON public.accounting_periods
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
       WHERE id = auth.uid()
         AND role IN ('owner', 'admin', 'finance')
    )
  );

-- asset_depreciation_log: finance/owner read + write; service role for inserts
ALTER TABLE public.asset_depreciation_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "depr_log_read"  ON public.asset_depreciation_log;

CREATE POLICY "depr_log_read" ON public.asset_depreciation_log
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
       WHERE id = auth.uid()
         AND role IN ('owner', 'admin', 'finance')
    )
  );

-- ── Done ─────────────────────────────────────────────────────
-- Verify:
SELECT table_name
  FROM information_schema.tables
 WHERE table_schema = 'public'
   AND table_name IN ('cost_centers','accounting_periods','asset_depreciation_log')
 ORDER BY table_name;
