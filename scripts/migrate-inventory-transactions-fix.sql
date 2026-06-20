-- ============================================================
-- Fix inventory transaction recording
-- Adds missing columns + canonical RPC
-- Safe to run multiple times (idempotent)
-- Run this in Supabase SQL Editor
-- ============================================================

-- ── 1. Add missing columns to inventory_transactions ─────────
ALTER TABLE public.inventory_transactions
  ADD COLUMN IF NOT EXISTS org_id         uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS created_by     uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS job_order_id   text,
  ADD COLUMN IF NOT EXISTS cost_center_id uuid,
  ADD COLUMN IF NOT EXISTS job_code       text;

CREATE INDEX IF NOT EXISTS idx_inventory_transactions_org
  ON public.inventory_transactions (org_id);

-- ── 2. Drop all existing overloads so there is exactly one ───
DROP FUNCTION IF EXISTS public.record_inventory_movement(
  text, uuid, integer, numeric, uuid, uuid, text, text, text, uuid, text, date);

DROP FUNCTION IF EXISTS public.record_inventory_movement(
  text, uuid, integer, numeric, uuid, uuid, text, text, text, uuid, text, date, uuid);

DROP FUNCTION IF EXISTS public.record_inventory_movement(
  text, uuid, integer, numeric, uuid, uuid, text, text, text, uuid, text, date, text, uuid, text);

-- Drop old 5-param balance helper so the new 6-param one replaces it cleanly
DROP FUNCTION IF EXISTS public.upsert_inventory_balance(uuid, uuid, integer, numeric, text);

-- ── 3. Balance upsert helper (org-aware) ─────────────────────
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
     FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.inventory_balances (product_id, location_id, quantity, avg_cost, org_id)
    VALUES (p_product_id, p_location_id, p_qty_delta, COALESCE(p_unit_cost, 0), p_org_id);
  ELSE
    v_new_qty  := v_row.quantity + p_qty_delta;
    v_new_cost := v_row.avg_cost;

    IF p_cost_method = 'average' AND p_qty_delta > 0 AND COALESCE(p_unit_cost, 0) > 0 THEN
      v_new_cost := (v_row.quantity * v_row.avg_cost + p_qty_delta * p_unit_cost)
                  / (v_row.quantity + p_qty_delta);
    END IF;

    UPDATE public.inventory_balances
       SET quantity     = v_new_qty,
           avg_cost     = v_new_cost,
           org_id       = COALESCE(org_id, p_org_id),
           last_updated = NOW()
     WHERE id = v_row.id;
  END IF;
END;
$$;

-- ── 4. Canonical record_inventory_movement ───────────────────
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
SECURITY DEFINER AS $$
DECLARE
  v_product        record;
  v_tx_id          uuid;
  v_balance        record;
  v_effective_cost numeric;
  v_adj_loc        uuid;
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
    FROM public.products
   WHERE id = p_product_id AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found or inactive: %', p_product_id;
  END IF;

  -- Effective cost: inbound uses caller cost; outbound uses book avg_cost when caller passes 0
  v_effective_cost := COALESCE(p_unit_cost, 0);
  IF p_transaction_type IN ('consumption','sale','transfer','adjustment') AND v_effective_cost <= 0 THEN
    SELECT avg_cost INTO v_balance
      FROM public.inventory_balances
     WHERE product_id  = p_product_id
       AND location_id = COALESCE(p_from_location_id, p_to_location_id);
    v_effective_cost := COALESCE(v_balance.avg_cost, 0);
  END IF;

  -- Insert transaction record
  INSERT INTO public.inventory_transactions (
    transaction_type, product_id,
    from_location_id, to_location_id,
    quantity, unit_cost,
    reference_no, notes, customer_id, created_by,
    cost_center_id, job_code, job_order_id, org_id
  ) VALUES (
    p_transaction_type, p_product_id,
    p_from_location_id, p_to_location_id,
    p_quantity, v_effective_cost,
    p_reference_no, p_notes, p_customer_id, p_created_by,
    p_cost_center_id, p_job_code, p_job_order_id, p_org_id
  )
  RETURNING id INTO v_tx_id;

  -- Update balances
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
       WHERE product_id  = p_product_id AND location_id = p_from_location_id
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
       WHERE product_id  = p_product_id AND location_id = p_from_location_id
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
    v_adj_loc := COALESCE(p_to_location_id, p_from_location_id);
    IF v_adj_loc IS NOT NULL THEN
      IF p_quantity < 0 THEN
        SELECT quantity INTO v_balance
          FROM public.inventory_balances
         WHERE product_id  = p_product_id AND location_id = v_adj_loc
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

-- ── 5. Backfill org_id on rows written by old RPC ────────────
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
