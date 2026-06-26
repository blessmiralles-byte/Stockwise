-- ─────────────────────────────────────────────────────────────────────────────
-- migrate-rpc-consolidated.sql
--
-- Consolidates record_inventory_movement into ONE canonical definition and
-- fixes four defects found in the June 2026 engineering review:
--
--   1. THREE overloads of record_inventory_movement coexist (12-param from
--      rpc_record_movement.sql, 13-param with p_job_order_id uuid from
--      migrate-job-orders.sql, 15-param with p_job_order_id text from
--      migrate-finance-controls.sql). CREATE OR REPLACE with a different
--      signature creates an overload, not a replacement. Named-arg calls from
--      PostgREST can hit ambiguity (PGRST203) and silently fall back to
--      non-atomic code paths in the API routes.
--   2. The RPC never writes org_id → every movement it records is invisible
--      to all org-filtered reads (transactions list, valuation report, and
--      the JobLedger integration endpoints).
--   3. The 15-param RPC accepts p_job_order_id but omits it from the INSERT
--      → job linkage silently dropped; JobLedger material sync returns empty.
--   4. Outbound movements are costed at whatever the caller passes (often 0)
--      → consumption rows carry zero cost and job costing understates
--      materials. Outbound is now costed at the balance's avg_cost (book
--      cost) whenever the caller does not supply an explicit positive cost.
--
-- Also: adjustments now take a SIGNED quantity (negative = stock decrease)
-- and negative adjustments are guarded against driving stock below zero.
-- Stock-count shortage approvals previously ADDED stock because the route
-- passed abs(variance) and the RPC ignored from/to direction.
--
-- Run AFTER: migrate-multitenancy.sql (org_id columns must exist).
-- Safe to re-run (idempotent: DROP IF EXISTS + CREATE OR REPLACE + ON CONFLICT).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Drop ALL existing overloads ───────────────────────────────────────────

-- 12-param original (rpc_record_movement.sql)
DROP FUNCTION IF EXISTS public.record_inventory_movement(
  text, uuid, integer, numeric, uuid, uuid, text, text, text, uuid, text, date);

-- 13-param with p_job_order_id uuid (migrate-job-orders.sql)
DROP FUNCTION IF EXISTS public.record_inventory_movement(
  text, uuid, integer, numeric, uuid, uuid, text, text, text, uuid, text, date, uuid);

-- 15-param with p_job_order_id text + cost centers (migrate-finance-controls.sql)
DROP FUNCTION IF EXISTS public.record_inventory_movement(
  text, uuid, integer, numeric, uuid, uuid, text, text, text, uuid, text, date, text, uuid, text);

-- Old 5-param balance helper (re-created below with org support)
DROP FUNCTION IF EXISTS public.upsert_inventory_balance(uuid, uuid, integer, numeric, text);

-- ── 2. Balance upsert helper (now org-aware) ─────────────────────────────────

CREATE OR REPLACE FUNCTION public.upsert_inventory_balance(
  p_product_id  uuid,
  p_location_id uuid,
  p_qty_delta   integer,
  p_unit_cost   numeric,
  p_cost_method text,
  p_org_id      uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  v_row record;
  v_new_qty   numeric;
  v_new_cost  numeric;
BEGIN
  SELECT id, quantity, avg_cost
    INTO v_row
    FROM public.inventory_balances
   WHERE product_id  = p_product_id
     AND location_id = p_location_id
     FOR UPDATE;           -- row-level lock prevents concurrent races

  IF NOT FOUND THEN
    INSERT INTO public.inventory_balances (product_id, location_id, quantity, avg_cost, org_id)
    VALUES (p_product_id, p_location_id, p_qty_delta, COALESCE(p_unit_cost, 0), p_org_id);
  ELSE
    v_new_qty  := v_row.quantity + p_qty_delta;
    v_new_cost := v_row.avg_cost;

    -- Weighted average: recalculate only on inbound, guard against division by zero
    IF p_cost_method = 'average' AND p_qty_delta > 0 AND COALESCE(p_unit_cost, 0) > 0 THEN
      IF (v_row.quantity + p_qty_delta) > 0 THEN
        v_new_cost := (v_row.quantity * v_row.avg_cost + p_qty_delta * p_unit_cost)
                    / (v_row.quantity + p_qty_delta);
      END IF;
    END IF;

    UPDATE public.inventory_balances
       SET quantity     = v_new_qty,
           avg_cost     = v_new_cost,
           org_id       = COALESCE(org_id, p_org_id),  -- heal rows created before multitenancy
           last_updated = NOW()
     WHERE id = v_row.id;
  END IF;
END;
$$;

-- ── 3. Canonical record_inventory_movement ───────────────────────────────────

CREATE OR REPLACE FUNCTION public.record_inventory_movement(
  p_transaction_type text,
  p_product_id       uuid,
  p_quantity         integer,            -- SIGNED for adjustments; positive otherwise
  p_unit_cost        numeric    DEFAULT 0,
  p_from_location_id uuid       DEFAULT NULL,
  p_to_location_id   uuid       DEFAULT NULL,
  p_reference_no     text       DEFAULT NULL,
  p_notes            text       DEFAULT NULL,
  p_customer_id      text       DEFAULT NULL,
  p_created_by       uuid       DEFAULT NULL,
  p_batch_no         text       DEFAULT NULL,
  p_expiration_date  date       DEFAULT NULL,
  p_job_order_id     text       DEFAULT NULL,  -- text job number, e.g. "JOB-2026-001" or a CrewSync job id
  p_cost_center_id   uuid       DEFAULT NULL,
  p_job_code         text       DEFAULT NULL,
  p_org_id           uuid       DEFAULT NULL
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER AS $$
DECLARE
  v_product        record;
  v_tx_id          uuid;
  v_balance        record;
  v_effective_cost numeric;
  v_adj_loc        uuid;
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

  -- ── Determine effective unit cost ─────────────────────────
  -- Inbound (purchase): caller-supplied cost is authoritative.
  -- Outbound (consumption/sale/transfer) and adjustments: when the caller
  -- supplies no positive cost, value the movement at the source balance's
  -- avg_cost (book cost) so the ledger never records zero-cost consumption.
  v_effective_cost := COALESCE(p_unit_cost, 0);

  IF p_transaction_type IN ('consumption','sale','transfer','adjustment')
     AND v_effective_cost <= 0
  THEN
    SELECT avg_cost INTO v_balance
      FROM public.inventory_balances
     WHERE product_id  = p_product_id
       AND location_id = COALESCE(p_from_location_id, p_to_location_id);
    v_effective_cost := COALESCE(v_balance.avg_cost, 0);
  END IF;

  -- ── Insert transaction record ─────────────────────────────
  INSERT INTO public.inventory_transactions (
    transaction_type, product_id,
    from_location_id, to_location_id,
    quantity, unit_cost, total_cost,
    reference_no, notes, customer_id, created_by,
    cost_center_id, job_code,
    job_order_id, org_id
  ) VALUES (
    p_transaction_type, p_product_id,
    p_from_location_id, p_to_location_id,
    p_quantity, v_effective_cost, ABS(p_quantity) * v_effective_cost,
    p_reference_no, p_notes, p_customer_id, p_created_by,
    p_cost_center_id, p_job_code,
    p_job_order_id, p_org_id
  )
  RETURNING id INTO v_tx_id;

  -- ── Update balances ───────────────────────────────────────
  IF p_transaction_type = 'purchase' THEN
    IF p_to_location_id IS NOT NULL THEN
      PERFORM public.upsert_inventory_balance(
        p_product_id, p_to_location_id, p_quantity,
        v_effective_cost, v_product.cost_method, p_org_id
      );
    END IF;
    IF v_product.cost_method = 'fifo' AND p_to_location_id IS NOT NULL THEN
      INSERT INTO public.inventory_batches (
        product_id, location_id, purchase_date,
        quantity_remaining, unit_cost,
        reference_no, batch_no, expiration_date, org_id
      ) VALUES (
        p_product_id, p_to_location_id, CURRENT_DATE,
        p_quantity, v_effective_cost,
        p_reference_no, p_batch_no, p_expiration_date, p_org_id
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
        v_effective_cost, v_product.cost_method, p_org_id
      );
    END IF;
    IF p_to_location_id IS NOT NULL THEN
      PERFORM public.upsert_inventory_balance(
        p_product_id, p_to_location_id, p_quantity,
        v_effective_cost, v_product.cost_method, p_org_id
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
        v_effective_cost, v_product.cost_method, p_org_id
      );
    END IF;

  ELSIF p_transaction_type = 'adjustment' THEN
    -- SIGNED quantity: positive = increase, negative = decrease.
    -- (Stock-count shortages post a negative quantity.)
    v_adj_loc := COALESCE(p_to_location_id, p_from_location_id);
    IF v_adj_loc IS NOT NULL THEN
      IF p_quantity < 0 THEN
        SELECT quantity INTO v_balance
          FROM public.inventory_balances
         WHERE product_id  = p_product_id
           AND location_id = v_adj_loc
           FOR UPDATE;
        IF NOT FOUND OR v_balance.quantity < ABS(p_quantity) THEN
          RAISE EXCEPTION 'Adjustment would drive stock negative. Available: %, adjustment: %',
            COALESCE(v_balance.quantity, 0), p_quantity;
        END IF;
      END IF;
      PERFORM public.upsert_inventory_balance(
        p_product_id, v_adj_loc, p_quantity,
        v_effective_cost, v_product.cost_method, p_org_id
      );
    END IF;
  END IF;

  RETURN json_build_object('transaction_id', v_tx_id, 'success', true);
END;
$$;

-- ── 4. Backfill org_id on historic rows ──────────────────────────────────────
-- Rows written by the old RPC have org_id NULL and are invisible to all
-- org-filtered reads. Products carry org_id, so derive it from there.

UPDATE public.inventory_transactions t
   SET org_id = p.org_id
  FROM public.products p
 WHERE t.product_id = p.id
   AND t.org_id IS NULL
   AND p.org_id IS NOT NULL;

UPDATE public.inventory_balances b
   SET org_id = p.org_id
  FROM public.products p
 WHERE b.product_id = p.id
   AND b.org_id IS NULL
   AND p.org_id IS NOT NULL;

UPDATE public.inventory_batches ib
   SET org_id = p.org_id
  FROM public.products p
 WHERE ib.product_id = p.id
   AND ib.org_id IS NULL
   AND p.org_id IS NOT NULL;

-- ── 5. Register in migration tracker ─────────────────────────────────────────

INSERT INTO public.schema_migrations (name, applied_by, notes) VALUES
  ('migrate-rpc-consolidated.sql', 'manual',
   'Single canonical record_inventory_movement: drops 3 overloads, writes org_id + job_order_id, costs outbound at book avg_cost, signed adjustments, org_id backfill')
ON CONFLICT (name) DO NOTHING;
