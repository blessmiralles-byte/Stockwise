-- ============================================================
-- Drop the old v1 record_inventory_movement (12-param version)
-- so PostgreSQL stops seeing two ambiguous overloads.
-- Run in Supabase SQL Editor.
-- ============================================================

DROP FUNCTION IF EXISTS record_inventory_movement(
  text, uuid, integer, numeric,
  uuid, uuid, text, text,
  text, uuid, text, date
);
