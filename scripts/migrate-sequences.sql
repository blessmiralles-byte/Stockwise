-- ============================================================
-- StockWise — Atomic Reference Number Sequences  (H-3)
-- Replaces COUNT(*)+1 pattern which has a race condition.
-- Run in Supabase SQL Editor.
-- ============================================================

-- 1. Create sequences (safe to re-run)
CREATE SEQUENCE IF NOT EXISTS public.po_seq           START 1;
CREATE SEQUENCE IF NOT EXISTS public.stock_count_seq  START 1;
CREATE SEQUENCE IF NOT EXISTS public.asset_seq        START 1;
CREATE SEQUENCE IF NOT EXISTS public.requisition_seq  START 1;

-- 2. Sync each sequence to current record count so no collisions occur.
--
--    setval(seq, N, is_called):
--      is_called = true  → sequence is "at" N, next nextval() returns N+1
--      is_called = false → sequence will return N on the very next nextval()
--
--    Rule used here:
--      • Table has rows  → setval(COUNT, true)  so next ID = COUNT + 1
--      • Table is empty  → setval(1,     false) so first ID = 1
--
--    The SELECT output will show the value setval was given (not what
--    nextval will return next). That is expected and correct.

DO $$
DECLARE
  v bigint;
BEGIN
  -- Purchase orders
  SELECT COUNT(*) INTO v FROM public.purchase_orders;
  IF v > 0 THEN
    PERFORM setval('public.po_seq', v, true);   -- next = v + 1
  ELSE
    PERFORM setval('public.po_seq', 1, false);  -- next = 1
  END IF;

  -- Stock counts
  SELECT COUNT(*) INTO v FROM public.stock_counts;
  IF v > 0 THEN
    PERFORM setval('public.stock_count_seq', v, true);
  ELSE
    PERFORM setval('public.stock_count_seq', 1, false);
  END IF;

  -- Fixed assets
  SELECT COUNT(*) INTO v FROM public.fixed_assets;
  IF v > 0 THEN
    PERFORM setval('public.asset_seq', v, true);
  ELSE
    PERFORM setval('public.asset_seq', 1, false);
  END IF;

  -- Requisitions (table may not exist yet if migrate-requisitions.sql wasn't run)
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'requisitions') THEN
    SELECT COUNT(*) INTO v FROM public.requisitions;
    IF v > 0 THEN
      PERFORM setval('public.requisition_seq', v, true);
    ELSE
      PERFORM setval('public.requisition_seq', 1, false);
    END IF;
  END IF;

  RAISE NOTICE 'Sequences synced. Current counts — POs: %, stock counts: %, assets: %',
    (SELECT COUNT(*) FROM public.purchase_orders),
    (SELECT COUNT(*) FROM public.stock_counts),
    (SELECT COUNT(*) FROM public.fixed_assets);
END $$;

-- 3. RPC wrapper callable from the application layer.
--    Allowlisted sequence names prevent SQL injection.
CREATE OR REPLACE FUNCTION public.next_ref_number(p_seq text)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_seq NOT IN (
    'public.po_seq',
    'public.stock_count_seq',
    'public.asset_seq',
    'public.requisition_seq'
  ) THEN
    RAISE EXCEPTION 'Unknown sequence: %', p_seq;
  END IF;

  RETURN nextval(p_seq::regclass);
END;
$$;

-- Verify current sequence positions:
SELECT
  'public.po_seq'          AS seq, last_value, is_called FROM public.po_seq
UNION ALL SELECT
  'public.stock_count_seq' AS seq, last_value, is_called FROM public.stock_count_seq
UNION ALL SELECT
  'public.asset_seq'       AS seq, last_value, is_called FROM public.asset_seq
UNION ALL SELECT
  'public.requisition_seq' AS seq, last_value, is_called FROM public.requisition_seq;
