-- ============================================================
-- Stocked — RPC v2: adds p_org_id, p_job_order_id, total_cost
-- Run in Supabase SQL Editor (replaces rpc_record_movement.sql)
-- ============================================================

-- ── Helper: upsert a single balance row (now org-aware) ──────
CREATE OR REPLACE FUNCTION upsert_inventory_balance(
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
    FROM inventory_balances
   WHERE product_id  = p_product_id
     AND location_id = p_location_id
     FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO inventory_balances (product_id, location_id, quantity, avg_cost, org_id)
    VALUES (p_product_id, p_location_id, p_qty_delta, COALESCE(p_unit_cost, 0), p_org_id);
  ELSE
    v_new_qty  := v_row.quantity + p_qty_delta;
    v_new_cost := v_row.avg_cost;

    IF p_cost_method = 'average' AND p_qty_delta > 0 AND COALESCE(p_unit_cost, 0) > 0 THEN
      v_new_cost := (v_row.quantity * v_row.avg_cost + p_qty_delta * p_unit_cost)
                  / (v_row.quantity + p_qty_delta);
    END IF;

    UPDATE inventory_balances
       SET quantity     = v_new_qty,
           avg_cost     = v_new_cost,
           last_updated = NOW()
     WHERE id = v_row.id;
  END IF;
END;
$$;


-- ── Main RPC v2: adds p_org_id, p_job_order_id, writes total_cost ─
CREATE OR REPLACE FUNCTION record_inventory_movement(
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
  p_job_order_id     uuid       DEFAULT NULL,
  p_org_id           uuid       DEFAULT NULL
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER AS $$
DECLARE
  v_product    record;
  v_tx_id      uuid;
  v_balance    record;
  v_total_cost numeric;
BEGIN
  -- ── Validate inputs ──────────────────────────────────────
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

  -- ── Load product ─────────────────────────────────────────
  SELECT id, cost_method INTO v_product
    FROM products
   WHERE id = p_product_id AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found or inactive: %', p_product_id;
  END IF;

  -- total_cost = |qty| * unit_cost (always positive; direction implicit in type)
  v_total_cost := ABS(p_quantity) * COALESCE(p_unit_cost, 0);

  -- ── Insert transaction record ─────────────────────────────
  INSERT INTO inventory_transactions (
    org_id,
    transaction_type, product_id,
    from_location_id, to_location_id,
    quantity, unit_cost, total_cost,
    reference_no, notes, customer_id, created_by,
    job_order_id
  ) VALUES (
    p_org_id,
    p_transaction_type, p_product_id,
    p_from_location_id, p_to_location_id,
    p_quantity, COALESCE(p_unit_cost, 0), v_total_cost,
    p_reference_no, p_notes, p_customer_id, p_created_by,
    p_job_order_id
  )
  RETURNING id INTO v_tx_id;

  -- ── Update balances ───────────────────────────────────────
  IF p_transaction_type = 'purchase' THEN
    IF p_to_location_id IS NOT NULL THEN
      PERFORM upsert_inventory_balance(
        p_product_id, p_to_location_id, p_quantity,
        COALESCE(p_unit_cost, 0), v_product.cost_method, p_org_id
      );
    END IF;

    IF v_product.cost_method = 'fifo' AND p_to_location_id IS NOT NULL THEN
      INSERT INTO inventory_batches (
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
        FROM inventory_balances
       WHERE product_id  = p_product_id
         AND location_id = p_from_location_id
         FOR UPDATE;

      IF NOT FOUND OR v_balance.quantity < p_quantity THEN
        RAISE EXCEPTION 'Insufficient stock. Available: %, requested: %',
          COALESCE(v_balance.quantity, 0), p_quantity;
      END IF;

      PERFORM upsert_inventory_balance(
        p_product_id, p_from_location_id, -p_quantity,
        COALESCE(p_unit_cost, 0), v_product.cost_method, p_org_id
      );
    END IF;

    IF p_to_location_id IS NOT NULL THEN
      PERFORM upsert_inventory_balance(
        p_product_id, p_to_location_id, p_quantity,
        COALESCE(p_unit_cost, 0), v_product.cost_method, p_org_id
      );
    END IF;

  ELSIF p_transaction_type IN ('consumption', 'sale') THEN
    IF p_from_location_id IS NOT NULL THEN
      SELECT quantity INTO v_balance
        FROM inventory_balances
       WHERE product_id  = p_product_id
         AND location_id = p_from_location_id
         FOR UPDATE;

      IF NOT FOUND OR v_balance.quantity < p_quantity THEN
        RAISE EXCEPTION 'Insufficient stock. Available: %, requested: %',
          COALESCE(v_balance.quantity, 0), p_quantity;
      END IF;

      PERFORM upsert_inventory_balance(
        p_product_id, p_from_location_id, -p_quantity,
        COALESCE(p_unit_cost, 0), v_product.cost_method, p_org_id
      );
    END IF;

  ELSIF p_transaction_type = 'adjustment' THEN
    DECLARE v_loc uuid := COALESCE(p_to_location_id, p_from_location_id);
    BEGIN
      IF v_loc IS NOT NULL THEN
        PERFORM upsert_inventory_balance(
          p_product_id, v_loc, p_quantity,
          COALESCE(p_unit_cost, 0), v_product.cost_method, p_org_id
        );
      END IF;
    END;
  END IF;

  RETURN json_build_object('transaction_id', v_tx_id, 'success', true);
END;
$$;
