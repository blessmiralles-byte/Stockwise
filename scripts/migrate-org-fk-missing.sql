-- ============================================================
-- Stocked — tables whose org_id was never linked to organizations
-- Run in Supabase SQL Editor. Safe to re-run.
-- ============================================================
-- migrate-org-delete-cascade.sql fixed foreign keys that BLOCKED deleting an
-- organization. Verifying it showed the opposite fault on audit_log: its
-- org_id has no foreign key at all (the column existed before
-- "ADD COLUMN IF NOT EXISTS org_id ... REFERENCES ..." ran, so the reference
-- was skipped). Deleting an organization therefore left its audit entries
-- behind, belonging to nobody — data we would have told a customer was gone.
--
-- This adds the missing key, ON DELETE CASCADE, to every public table that
-- has an org_id column and no foreign key to organizations. The NOTICE lines
-- list what was linked. (audit_log's immutability trigger already allows the
-- delete once the organization itself is gone.)

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.oid::regclass::text AS tbl, c.relname
    FROM pg_class c
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'org_id' AND NOT a.attisdropped
    WHERE c.relnamespace = 'public'::regnamespace
      AND c.relkind = 'r'
      AND c.relname <> 'organizations'
      AND NOT EXISTS (
        SELECT 1 FROM pg_constraint k
        WHERE k.conrelid = c.oid AND k.contype = 'f'
          AND k.confrelid = 'public.organizations'::regclass
          AND a.attnum = ANY (k.conkey)
      )
  LOOP
    RAISE NOTICE 'linking %.org_id to organizations', r.tbl;
    EXECUTE format(
      'ALTER TABLE %s ADD CONSTRAINT %I FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE',
      r.tbl, r.relname || '_org_id_fkey');
  END LOOP;
END $$;
