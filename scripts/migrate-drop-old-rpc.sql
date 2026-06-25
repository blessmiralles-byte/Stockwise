-- ============================================================
-- Drop ALL old record_inventory_movement overloads.
-- Only the 16-param canonical version from migrate-rpc-consolidated.sql
-- should remain.
-- Run in Supabase SQL Editor.
-- ============================================================

-- 12-param original (rpc_record_movement.sql)
DROP FUNCTION IF EXISTS public.record_inventory_movement(
  text, uuid, integer, numeric, uuid, uuid, text, text, text, uuid, text, date);

-- 13-param with p_job_order_id uuid (migrate-job-orders.sql)
DROP FUNCTION IF EXISTS public.record_inventory_movement(
  text, uuid, integer, numeric, uuid, uuid, text, text, text, uuid, text, date, uuid);

-- 14-param v2 with p_job_order_id uuid + p_org_id (migrate-rpc-v2.sql)
DROP FUNCTION IF EXISTS public.record_inventory_movement(
  text, uuid, integer, numeric, uuid, uuid, text, text, text, uuid, text, date, uuid, uuid);

-- 15-param with p_job_order_id text + cost centers (migrate-finance-controls.sql)
DROP FUNCTION IF EXISTS public.record_inventory_movement(
  text, uuid, integer, numeric, uuid, uuid, text, text, text, uuid, text, date, text, uuid, text);
