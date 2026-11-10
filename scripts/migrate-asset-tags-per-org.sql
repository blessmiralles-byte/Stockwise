-- ============================================================
-- Stocked — asset tags and asset barcodes unique per company
-- Run in Supabase SQL Editor. Safe to re-run.
-- ============================================================
-- Same fault as item codes had: fixed_assets declared
--   asset_tag text not null unique,  barcode text unique
-- before multi-tenancy. Generated tags (AST-...) come from one sequence and
-- never clash, but a tag a customer types — "GRINDER-1", "EXC-001" — is
-- refused if any other company already uses it, and so is a manufacturer
-- barcode two companies both own. With Stocked Tools open to sign-ups, that
-- stops being hypothetical.

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'public.fixed_assets'::regclass
      AND c.contype  = 'u'
      AND (SELECT array_agg(a.attname::text ORDER BY a.attname)
             FROM unnest(c.conkey) k
             JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k)
          IN (ARRAY['asset_tag'], ARRAY['barcode'])
  LOOP
    RAISE NOTICE 'dropping constraint %', r.conname;
    EXECUTE format('ALTER TABLE public.fixed_assets DROP CONSTRAINT %I', r.conname);
  END LOOP;

  FOR r IN
    SELECT i.indexrelid::regclass::text AS idx
    FROM pg_index i
    WHERE i.indrelid = 'public.fixed_assets'::regclass
      AND i.indisunique AND NOT i.indisprimary
      AND NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conindid = i.indexrelid)
      AND (SELECT array_agg(a.attname::text ORDER BY a.attname)
             FROM unnest(i.indkey::int2[]) k
             JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k)
          IN (ARRAY['asset_tag'], ARRAY['barcode'])
  LOOP
    RAISE NOTICE 'dropping index %', r.idx;
    EXECUTE format('DROP INDEX %s', r.idx);
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS fixed_assets_org_tag_key
  ON public.fixed_assets (org_id, asset_tag);

CREATE UNIQUE INDEX IF NOT EXISTS fixed_assets_org_barcode_key
  ON public.fixed_assets (org_id, barcode)
  WHERE barcode IS NOT NULL;

NOTIFY pgrst, 'reload schema';
