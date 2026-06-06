-- ============================================================
-- StockWise — Job Orders migration
-- Run in Supabase SQL Editor
-- ============================================================

-- ── 1. Job orders table ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.job_orders (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_number    text        UNIQUE NOT NULL,
  title         text        NOT NULL,
  customer_name text,
  description   text,
  status        text        NOT NULL DEFAULT 'open'
                            CHECK (status IN ('open', 'in_progress', 'completed', 'cancelled')),
  start_date    date,
  end_date      date,
  created_by    uuid        REFERENCES auth.users(id),
  created_at    timestamptz DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_orders_status ON public.job_orders (status);

-- ── 2. Link transactions to job orders ───────────────────────
ALTER TABLE public.inventory_transactions
  ADD COLUMN IF NOT EXISTS job_order_id uuid REFERENCES public.job_orders(id);

CREATE INDEX IF NOT EXISTS idx_transactions_job_order
  ON public.inventory_transactions (job_order_id)
  WHERE job_order_id IS NOT NULL;

-- ── 3. Update RPC to accept job_order_id ─────────────────────
-- (CREATE OR REPLACE is safe to re-run)
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
  p_job_order_id     uuid       DEFAULT NULL   -- NEW
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER AS $$
DECLARE
  v_product  record;
  v_tx_id    uuid;
  v_balance  record;
BEGIN
  -- Validate inputs
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

  -- Load product
  SELECT id, cost_method INTO v_product
    FROM products
   WHERE id = p_product_id AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found or inactive: %', p_product_id;
  END IF;

  -- Insert transaction
  INSERT INTO inventory_transactions (
    transaction_type, product_id,
    from_location_id, to_location_id,
    quantity, unit_cost,
    reference_no, notes, customer_id,
    created_by, job_order_id
  ) VALUES (
    p_transaction_type, p_product_id,
    p_from_location_id, p_to_location_id,
    p_quantity, COALESCE(p_unit_cost, 0),
    p_reference_no, p_notes, p_customer_id,
    p_created_by, p_job_order_id
  )
  RETURNING id INTO v_tx_id;

  -- Update balances
  IF p_transaction_type = 'purchase' THEN
    IF p_to_location_id IS NOT NULL THEN
      PERFORM upsert_inventory_balance(
        p_product_id, p_to_location_id, p_quantity,
        COALESCE(p_unit_cost, 0), v_product.cost_method
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
      SELECT quantity INTO v_balance FROM inventory_balances
       WHERE product_id = p_product_id AND location_id = p_from_location_id FOR UPDATE;
      IF NOT FOUND OR v_balance.quantity < p_quantity THEN
        RAISE EXCEPTION 'Insufficient stock. Available: %, requested: %',
          COALESCE(v_balance.quantity, 0), p_quantity;
      END IF;
      PERFORM upsert_inventory_balance(
        p_product_id, p_from_location_id, -p_quantity,
        COALESCE(p_unit_cost, 0), v_product.cost_method
      );
    END IF;
    IF p_to_location_id IS NOT NULL THEN
      PERFORM upsert_inventory_balance(
        p_product_id, p_to_location_id, p_quantity,
        COALESCE(p_unit_cost, 0), v_product.cost_method
      );
    END IF;

  ELSIF p_transaction_type IN ('consumption', 'sale') THEN
    IF p_from_location_id IS NOT NULL THEN
      SELECT quantity INTO v_balance FROM inventory_balances
       WHERE product_id = p_product_id AND location_id = p_from_location_id FOR UPDATE;
      IF NOT FOUND OR v_balance.quantity < p_quantity THEN
        RAISE EXCEPTION 'Insufficient stock. Available: %, requested: %',
          COALESCE(v_balance.quantity, 0), p_quantity;
      END IF;
      PERFORM upsert_inventory_balance(
        p_product_id, p_from_location_id, -p_quantity,
        COALESCE(p_unit_cost, 0), v_product.cost_method
      );
    END IF;

  ELSIF p_transaction_type = 'adjustment' THEN
    DECLARE v_loc uuid := COALESCE(p_to_location_id, p_from_location_id);
    BEGIN
      IF v_loc IS NOT NULL THEN
        PERFORM upsert_inventory_balance(
          p_product_id, v_loc, p_quantity,
          COALESCE(p_unit_cost, 0), v_product.cost_method
        );
      END IF;
    END;
  END IF;

  RETURN json_build_object('transaction_id', v_tx_id, 'success', true);
END;
$$;
