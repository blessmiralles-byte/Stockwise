-- ============================================================
-- Stocked — codes and document numbers unique per company
-- Run in Supabase SQL Editor. Safe to re-run.
-- ============================================================
-- The same fault item codes and asset tags had, on the remaining tables:
-- columns declared UNIQUE before multi-tenancy are unique across ALL
-- companies. locations.code is the one a customer will hit — the second
-- company to name a location "MAIN" or "WH1" is refused — but any
-- single-column unique on a tenant table has the same shape.
--
-- This finds every single-column UNIQUE on a public table that has an org_id
-- column and replaces it with UNIQUE (org_id, that column). The NOTICE lines
-- list what was changed. Generated numbers (PO-…, AST-…) come from shared
-- sequences and stay unique either way.
--
-- Left alone on purpose: tables whose uniqueness is meant to be global
-- (logins, device tokens, the shared barcode cache, trial claims).

DO $$
DECLARE r record; col text; idx text;
BEGIN
  FOR r IN
    SELECT c.oid, c.conname, c.conrelid, c.conrelid::regclass::text AS tbl, cl.relname, c.conkey
    FROM pg_constraint c
    JOIN pg_class cl ON cl.oid = c.conrelid
    WHERE c.contype = 'u'
      AND c.connamespace = 'public'::regnamespace
      AND array_length(c.conkey, 1) = 1
      AND cl.relname NOT IN ('organizations', 'user_profiles', 'expo_push_tokens',
                             'barcode_cache', 'trial_claims', 'schema_migrations')
      AND EXISTS (SELECT 1 FROM pg_attribute a
                   WHERE a.attrelid = c.conrelid AND a.attname = 'org_id' AND NOT a.attisdropped)
  LOOP
    SELECT a.attname INTO col FROM pg_attribute a
     WHERE a.attrelid = r.conrelid AND a.attnum = r.conkey[1];
    CONTINUE WHEN col = 'org_id';

    idx := r.relname || '_org_' || col || '_key';
    RAISE NOTICE 'per company: %.% (was %)', r.tbl, col, r.conname;
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
    EXECUTE format('CREATE UNIQUE INDEX IF NOT EXISTS %I ON %s (org_id, %I)', idx, r.tbl, col);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
