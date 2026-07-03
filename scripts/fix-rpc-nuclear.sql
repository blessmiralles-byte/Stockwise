-- ============================================================
-- NUCLEAR FIX: Drop ALL overloads of record_inventory_movement
-- and recreate the single canonical 16-param version.
-- Run this in Supabase SQL Editor.
-- ============================================================

-- Step 1: Drop every overload regardless of signature
DO $do_drop$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure::text AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE p.proname = 'record_inventory_movement'
      AND n.nspname = 'public'
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END;
$do_drop$;

-- Step 2: Ensure is_period_open exists (required by the canonical function)
CREATE OR REPLACE FUNCTION public.is_period_open(p_date date)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $is_period_open$
DECLARE v_closed boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.accounting_periods
     WHERE status = 'closed'
       AND p_date BETWEEN period_start AND period_end
  ) INTO v_closed;
  RETURN NOT v_closed;
END;
$is_period_open$;

-- Step 3: Ensure upsert_inventory_balance exists (org-aware version)
-- Weighted-average costing: avg_cost recomputed only on inbound, guarded
-- against divide-by-zero. For FIFO products avg_cost is set separately by
-- recompute_fifo_balance_cost() from the open batch layers.
CREATE OR REPLACE FUNCTION public.upsert_inventory_balance(
  p_product_id  uuid,
  p_location_id uuid,
  p_qty_delta   integer,
  p_unit_cost   numeric,
  p_cost_method text,
  p_org_id      uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql AS $upsert_balance$
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
     FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.inventory_balances (product_id, location_id, quantity, avg_cost, org_id)
    VALUES (p_product_id, p_location_id, p_qty_delta, COALESCE(p_unit_cost, 0), p_org_id);
  ELSE
    v_new_qty  := v_row.quantity + p_qty_delta;
    v_new_cost := v_row.avg_cost;

    IF p_cost_method = 'average' AND p_qty_delta > 0 AND COALESCE(p_unit_cost, 0) > 0 THEN
      IF (v_row.quantity + p_qty_delta) > 0 THEN
        v_new_cost := (v_row.quantity * v_row.avg_cost + p_qty_delta * p_unit_cost)
                    / (v_row.quantity + p_qty_delta);
      END IF;
    END IF;

    UPDATE public.inventory_balances
       SET quantity     = v_new_qty,
           avg_cost     = v_new_cost,
           org_id       = COALESCE(org_id, p_org_id),
           last_updated = NOW()
     WHERE id = v_row.id;
  END IF;
END;
$upsert_balance$;

-- Step 3a: FIFO layer consumption — walk open batches oldest-first, decrement
-- quantity_remaining, and return the actual cost of goods issued (COGS).
-- If batch layers are short of the requested qty (e.g. legacy stock added
-- without batches), the shortfall is costed at the last layer's unit cost,
-- or 0 if no layers exist.
CREATE OR REPLACE FUNCTION public.fifo_consume_batches(
  p_product_id  uuid,
  p_location_id uuid,
  p_qty         integer
) RETURNS numeric
LANGUAGE plpgsql AS $fifo_consume$
DECLARE
  v_remaining integer := p_qty;
  v_cogs      numeric := 0;
  v_take      integer;
  v_last_cost numeric := 0;
  b           record;
BEGIN
  FOR b IN
    SELECT id, quantity_remaining, unit_cost
      FROM public.inventory_batches
     WHERE product_id  = p_product_id
       AND location_id = p_location_id
       AND quantity_remaining > 0
     ORDER BY purchase_date ASC, id ASC
     FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_take      := LEAST(b.quantity_remaining, v_remaining);
    v_cogs      := v_cogs + v_take * b.unit_cost;
    v_last_cost := b.unit_cost;
    UPDATE public.inventory_batches
       SET quantity_remaining = quantity_remaining - v_take
     WHERE id = b.id;
    v_remaining := v_remaining - v_take;
  END LOOP;

  -- Cost any shortfall (fewer/zero layers than requested — e.g. legacy stock
  -- that predates batch tracking) at the last layer's cost, or if there were
  -- no layers at all, at the balance's book avg_cost rather than zero.
  IF v_remaining > 0 THEN
    IF v_last_cost = 0 THEN
      SELECT avg_cost INTO v_last_cost
        FROM public.inventory_balances
       WHERE product_id = p_product_id AND location_id = p_location_id;
      v_last_cost := COALESCE(v_last_cost, 0);
    END IF;
    v_cogs := v_cogs + v_remaining * v_last_cost;
  END IF;

  RETURN v_cogs;
END;
$fifo_consume$;

-- Step 3b: Recompute a FIFO product's balance avg_cost from its open layers
-- so the dashboard "Total Value" (avg_cost × quantity) is always correct.
CREATE OR REPLACE FUNCTION public.recompute_fifo_balance_cost(
  p_product_id  uuid,
  p_location_id uuid
) RETURNS void
LANGUAGE plpgsql AS $recompute_fifo$
DECLARE
  v_qty numeric;
  v_val numeric;
BEGIN
  SELECT COALESCE(SUM(quantity_remaining), 0),
         COALESCE(SUM(quantity_remaining * unit_cost), 0)
    INTO v_qty, v_val
    FROM public.inventory_batches
   WHERE product_id  = p_product_id
     AND location_id = p_location_id
     AND quantity_remaining > 0;

  IF v_qty > 0 THEN
    UPDATE public.inventory_balances
       SET avg_cost = v_val / v_qty, last_updated = NOW()
     WHERE product_id = p_product_id AND location_id = p_location_id;
  END IF;
END;
$recompute_fifo$;

-- Step 4: Create the ONE canonical record_inventory_movement (16 params)
-- Reordered: balance/batch updates run FIRST so that for FIFO products the
-- transaction's unit_cost/total_cost reflect the ACTUAL consumed layer cost
-- (COGS), not the book average.
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
  p_job_code         text       DEFAULT NULL,
  p_org_id           uuid       DEFAULT NULL
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER AS $record_movement$
DECLARE
  v_product        record;
  v_tx_id          uuid;
  v_balance        record;
  v_effective_cost numeric;
  v_adj_loc        uuid;
  v_is_fifo        boolean;
BEGIN
  IF NOT public.is_period_open(CURRENT_DATE) THEN
    RAISE EXCEPTION 'Accounting period containing % is closed. No transactions may be posted.', CURRENT_DATE;
  END IF;

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

  SELECT id, cost_method INTO v_product
    FROM public.products
   WHERE id = p_product_id AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found or inactive: %', p_product_id;
  END IF;

  v_is_fifo        := (v_product.cost_method = 'fifo');
  v_effective_cost := COALESCE(p_unit_cost, 0);

  -- ── Apply balance / batch movements; set v_effective_cost for outbound ──
  IF p_transaction_type = 'purchase' THEN
    IF p_to_location_id IS NOT NULL THEN
      PERFORM public.upsert_inventory_balance(
        p_product_id, p_to_location_id, p_quantity,
        v_effective_cost, v_product.cost_method, p_org_id
      );
      IF v_is_fifo THEN
        INSERT INTO public.inventory_batches (
          product_id, location_id, purchase_date,
          quantity_remaining, unit_cost,
          reference_no, batch_no, expiration_date, org_id
        ) VALUES (
          p_product_id, p_to_location_id, CURRENT_DATE,
          p_quantity, v_effective_cost,
          p_reference_no, p_batch_no, p_expiration_date, p_org_id
        );
        -- Refresh book cost from all open layers
        PERFORM public.recompute_fifo_balance_cost(p_product_id, p_to_location_id);
      END IF;
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

      IF v_is_fifo THEN
        -- Consume source layers; the moved goods carry their actual FIFO cost
        v_effective_cost := public.fifo_consume_batches(p_product_id, p_from_location_id, p_quantity) / p_quantity;
      ELSIF v_effective_cost <= 0 THEN
        SELECT avg_cost INTO v_balance
          FROM public.inventory_balances
         WHERE product_id = p_product_id AND location_id = p_from_location_id;
        v_effective_cost := COALESCE(v_balance.avg_cost, 0);
      END IF;

      PERFORM public.upsert_inventory_balance(
        p_product_id, p_from_location_id, -p_quantity,
        v_effective_cost, v_product.cost_method, p_org_id
      );
      IF v_is_fifo THEN
        PERFORM public.recompute_fifo_balance_cost(p_product_id, p_from_location_id);
      END IF;
    END IF;
    IF p_to_location_id IS NOT NULL THEN
      PERFORM public.upsert_inventory_balance(
        p_product_id, p_to_location_id, p_quantity,
        v_effective_cost, v_product.cost_method, p_org_id
      );
      IF v_is_fifo THEN
        -- Land the moved goods as a new layer at their carried cost
        INSERT INTO public.inventory_batches (
          product_id, location_id, purchase_date,
          quantity_remaining, unit_cost,
          reference_no, batch_no, expiration_date, org_id
        ) VALUES (
          p_product_id, p_to_location_id, CURRENT_DATE,
          p_quantity, v_effective_cost,
          p_reference_no, p_batch_no, p_expiration_date, p_org_id
        );
        PERFORM public.recompute_fifo_balance_cost(p_product_id, p_to_location_id);
      END IF;
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

      IF v_is_fifo THEN
        -- Actual COGS from oldest layers
        v_effective_cost := public.fifo_consume_batches(p_product_id, p_from_location_id, p_quantity) / p_quantity;
      ELSIF v_effective_cost <= 0 THEN
        v_effective_cost := COALESCE(v_balance.avg_cost, 0);
      END IF;

      PERFORM public.upsert_inventory_balance(
        p_product_id, p_from_location_id, -p_quantity,
        v_effective_cost, v_product.cost_method, p_org_id
      );
      IF v_is_fifo THEN
        PERFORM public.recompute_fifo_balance_cost(p_product_id, p_from_location_id);
      END IF;
    END IF;

  ELSIF p_transaction_type = 'adjustment' THEN
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

        IF v_is_fifo THEN
          v_effective_cost := public.fifo_consume_batches(p_product_id, v_adj_loc, ABS(p_quantity)) / ABS(p_quantity);
        ELSIF v_effective_cost <= 0 THEN
          v_effective_cost := COALESCE(v_balance.avg_cost, 0);
        END IF;
      ELSE
        -- positive adjustment: value at supplied cost, else current book cost
        IF v_effective_cost <= 0 THEN
          SELECT avg_cost INTO v_balance
            FROM public.inventory_balances
           WHERE product_id = p_product_id AND location_id = v_adj_loc;
          v_effective_cost := COALESCE(v_balance.avg_cost, 0);
        END IF;
        IF v_is_fifo THEN
          INSERT INTO public.inventory_batches (
            product_id, location_id, purchase_date,
            quantity_remaining, unit_cost,
            reference_no, batch_no, expiration_date, org_id
          ) VALUES (
            p_product_id, v_adj_loc, CURRENT_DATE,
            p_quantity, v_effective_cost,
            p_reference_no, p_batch_no, p_expiration_date, p_org_id
          );
        END IF;
      END IF;

      PERFORM public.upsert_inventory_balance(
        p_product_id, v_adj_loc, p_quantity,
        v_effective_cost, v_product.cost_method, p_org_id
      );
      IF v_is_fifo THEN
        PERFORM public.recompute_fifo_balance_cost(p_product_id, v_adj_loc);
      END IF;
    END IF;
  END IF;

  -- ── Insert transaction record with the final effective cost ──
  -- NB: total_cost is a GENERATED column (quantity * unit_cost) — never insert it.
  INSERT INTO public.inventory_transactions (
    transaction_type, product_id,
    from_location_id, to_location_id,
    quantity, unit_cost,
    reference_no, notes, customer_id, created_by,
    cost_center_id, job_code,
    job_order_id, org_id
  ) VALUES (
    p_transaction_type, p_product_id,
    p_from_location_id, p_to_location_id,
    p_quantity, v_effective_cost,
    p_reference_no, p_notes, p_customer_id, p_created_by,
    p_cost_center_id, p_job_code,
    p_job_order_id, p_org_id
  )
  RETURNING id INTO v_tx_id;

  RETURN json_build_object('transaction_id', v_tx_id, 'success', true);
END;
$record_movement$;

-- Step 4a: Backfill avg_cost on existing FIFO balances from their open layers.
-- Fixes historic FIFO items showing $0.00 Total Value because avg_cost was
-- never maintained on purchase before this migration.
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

-- Step 5: Verify only ONE function exists
SELECT p.oid::regprocedure::text AS function_signature
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.proname = 'record_inventory_movement'
  AND n.nspname = 'public';
