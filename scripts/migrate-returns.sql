-- ============================================================
-- Stocked — returns: from a job back into stock, and back to the vendor
-- Run in Supabase SQL Editor. Safe to re-run.
-- ============================================================
-- Adds two kinds of stock movement to record_inventory_movement():
--
--   return         Unused material coming back from a job. Stock goes up at
--                  the location it is returned to, and the job is credited.
--   vendor_return  Received goods going back to the vendor. Stock goes down,
--                  exactly as an issue does.
--
-- Also fixes one fault found on the way: a positive adjustment (a stock count
-- overage, say) at a location that has never held the item failed with
-- "record v_balance is not assigned yet" when no cost was supplied.
--
-- The function body is the one from migrate-stock-movement-fixes.sql with
-- only those changes applied.

-- If the table restricts transaction_type to a list, widen the list. A
-- constraint is only touched when it is plainly that list.
DO $widen$
DECLARE c record; v_found boolean := false;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'public.inventory_transactions'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%transaction_type%'
       AND pg_get_constraintdef(oid) ILIKE '%consumption%'
       AND pg_get_constraintdef(oid) ILIKE '%purchase%'
       AND pg_get_constraintdef(oid) NOT ILIKE '%vendor_return%'
  LOOP
    EXECUTE format('ALTER TABLE public.inventory_transactions DROP CONSTRAINT %I', c.conname);
    v_found := true;
  END LOOP;
  IF v_found THEN
    ALTER TABLE public.inventory_transactions
      ADD CONSTRAINT inventory_transactions_transaction_type_check
      CHECK (transaction_type IN ('purchase','transfer','consumption','sale','adjustment','return','vendor_return'));
  END IF;
END;
$widen$;

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
  IF NOT public.is_period_open_for(p_org_id, CURRENT_DATE) THEN
    RAISE EXCEPTION 'Accounting period containing % is closed. No transactions may be posted.', CURRENT_DATE;
  END IF;

  IF p_transaction_type NOT IN ('purchase','transfer','consumption','sale','adjustment','return','vendor_return') THEN
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
   WHERE id = p_product_id AND is_active = true
     AND (p_org_id IS NULL OR org_id = p_org_id);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found or inactive: %', p_product_id;
  END IF;

  IF p_org_id IS NOT NULL THEN
    IF p_from_location_id IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM public.locations WHERE id = p_from_location_id AND org_id = p_org_id) THEN
      RAISE EXCEPTION 'Location not found: %', p_from_location_id;
    END IF;
    IF p_to_location_id IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM public.locations WHERE id = p_to_location_id AND org_id = p_org_id) THEN
      RAISE EXCEPTION 'Location not found: %', p_to_location_id;
    END IF;
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
      SELECT quantity, avg_cost INTO v_balance
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

  ELSIF p_transaction_type IN ('consumption', 'sale', 'vendor_return') THEN
    IF p_from_location_id IS NOT NULL THEN
      SELECT quantity, avg_cost INTO v_balance
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

  ELSIF p_transaction_type = 'return' THEN
    -- Unused material coming back from a job: stock in, at the cost supplied
    -- (the cost it was issued at), else the current book cost.
    IF p_to_location_id IS NULL THEN
      RAISE EXCEPTION 'A return needs the location the stock is going back into';
    END IF;
    IF v_effective_cost <= 0 THEN
      v_effective_cost := COALESCE((
        SELECT avg_cost FROM public.inventory_balances
         WHERE product_id = p_product_id AND location_id = p_to_location_id), 0);
    END IF;
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
    END IF;
    PERFORM public.upsert_inventory_balance(
      p_product_id, p_to_location_id, p_quantity,
      v_effective_cost, v_product.cost_method, p_org_id
    );
    IF v_is_fifo THEN
      PERFORM public.recompute_fifo_balance_cost(p_product_id, p_to_location_id);
    END IF;

  ELSIF p_transaction_type = 'adjustment' THEN
    v_adj_loc := COALESCE(p_to_location_id, p_from_location_id);
    IF v_adj_loc IS NOT NULL THEN
      IF p_quantity < 0 THEN
        SELECT quantity, avg_cost INTO v_balance
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
          v_effective_cost := COALESCE((
            SELECT avg_cost FROM public.inventory_balances
             WHERE product_id = p_product_id AND location_id = v_adj_loc), 0);
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

NOTIFY pgrst, 'reload schema';
