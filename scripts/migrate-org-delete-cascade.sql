-- ============================================================
-- Stocked — deleting an organization must take its data with it
-- Run in Supabase SQL Editor. Safe to re-run.
-- ============================================================
-- Found by deleting a test account: the delete failed with
--
--   update or delete on table "organizations" violates foreign key
--   constraint "fixed_assets_org_id_fkey" on table "fixed_assets"
--
-- migrate-multitenancy.sql declared every org_id as
--   ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE CASCADE
-- but where the column already existed, IF NOT EXISTS skipped the whole
-- clause — so the older foreign key, without the cascade, stayed. Any table
-- in that state blocks the delete, which is what the 90-day retention purge
-- and account erasure both rely on.
--
-- This finds every foreign key that points at organizations(id) and would
-- BLOCK a delete (NO ACTION or RESTRICT), and recreates it with ON DELETE
-- CASCADE. Keys that already cascade, and the deliberate SET NULL ones, are
-- left alone. The NOTICE lines list what was changed.

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.conname,
           c.conrelid::regclass::text AS tbl,
           (SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY k.ord)
              FROM unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord)
              JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum) AS cols
    FROM pg_constraint c
    WHERE c.contype      = 'f'
      AND c.confrelid    = 'public.organizations'::regclass
      AND c.confdeltype IN ('a', 'r')          -- NO ACTION / RESTRICT
      AND c.connamespace = 'public'::regnamespace
  LOOP
    RAISE NOTICE 'cascade: %.% (%)', r.tbl, r.conname, r.cols;
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
    EXECUTE format(
      'ALTER TABLE %s ADD CONSTRAINT %I FOREIGN KEY (%s) REFERENCES public.organizations(id) ON DELETE CASCADE',
      r.tbl, r.conname, r.cols);
  END LOOP;
END $$;

-- ── Verify ───────────────────────────────────────────────────
-- Should return no rows: nothing left that blocks deleting an organization.
--
--   SELECT conrelid::regclass AS table_name, conname
--   FROM pg_constraint
--   WHERE contype = 'f'
--     AND confrelid = 'public.organizations'::regclass
--     AND confdeltype IN ('a', 'r');
