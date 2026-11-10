-- ============================================================
-- Stocked — item codes and barcodes unique per company, not globally
-- Run in Supabase SQL Editor
-- ============================================================
--
-- THE BUG
--
-- supabase-schema.sql declared, before multi-tenancy existed:
--
--   sku     text not null unique,
--   barcode text unique,
--
-- No migration ever made those per-organization. So:
--
--   * Company B can't use the item code PVC-20 because Company A already
--     does — and is told "An item with that SKU already exists" about an item
--     it can't see.
--   * Barcodes are the MANUFACTURER's code, identical for every contractor
--     who stocks the same box of anchors. The first company to scan one owns
--     it; for everyone after, scan-to-receive fails.
--
-- THE FIX
--
-- 1. Drop whatever unique constraint or index covers sku or barcode on its
--    own. Found by column, not by name, since the generated names vary.
-- 2. Unique on (org_id, sku) and (org_id, barcode).
-- 3. recode_products(): apply a bulk code change as one transaction.
--
-- Safe to re-run.

-- ── 1. Remove the global uniqueness ─────────────────────────
DO $$
DECLARE r record;
BEGIN
  -- Unique constraints whose only column is sku or barcode
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'public.products'::regclass
      AND c.contype  = 'u'
      AND (SELECT array_agg(a.attname::text ORDER BY a.attname)
             FROM unnest(c.conkey) k
             JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k)
          IN (ARRAY['sku'], ARRAY['barcode'])
  LOOP
    RAISE NOTICE 'dropping constraint %', r.conname;
    EXECUTE format('ALTER TABLE public.products DROP CONSTRAINT %I', r.conname);
  END LOOP;

  -- Standalone unique indexes on the same (not backing a constraint)
  FOR r IN
    SELECT i.indexrelid::regclass::text AS idx
    FROM pg_index i
    WHERE i.indrelid    = 'public.products'::regclass
      AND i.indisunique
      AND NOT i.indisprimary
      AND NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conindid = i.indexrelid)
      AND (SELECT array_agg(a.attname::text ORDER BY a.attname)
             FROM unnest(i.indkey::int2[]) k
             JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k)
          IN (ARRAY['sku'], ARRAY['barcode'])
  LOOP
    RAISE NOTICE 'dropping index %', r.idx;
    EXECUTE format('DROP INDEX %s', r.idx);
  END LOOP;
END $$;

-- ── 2. Unique within one company ────────────────────────────
-- These can't fail on existing data: the old global rule was stricter.
CREATE UNIQUE INDEX IF NOT EXISTS products_org_sku_key
  ON public.products (org_id, sku);

-- Many items have no barcode; only real ones need to be distinct.
CREATE UNIQUE INDEX IF NOT EXISTS products_org_barcode_key
  ON public.products (org_id, barcode)
  WHERE barcode IS NOT NULL;

-- ── 3. Bulk code change, all or nothing ─────────────────────
-- p_changes: [{ "id": "<product uuid>", "sku": "<new code>" }, ...]
--
-- Two phases inside one transaction. First every item in the batch is parked
-- on a code nobody else can hold ('__recode__' + its id), then each takes its
-- new code. That's what lets chains (A→B while B→C) and swaps (A↔B) work —
-- one at a time they'd collide halfway. If any new code clashes with an item
-- outside the batch, the unique index raises and BOTH phases roll back, so a
-- half-finished recode can't be left behind.
CREATE OR REPLACE FUNCTION public.recode_products(p_org_id uuid, p_changes jsonb)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  expected integer := jsonb_array_length(p_changes);
  n        integer;
BEGIN
  UPDATE public.products p
     SET sku = '__recode__' || p.id::text
    FROM jsonb_to_recordset(p_changes) AS c(id uuid, sku text)
   WHERE p.id = c.id
     AND p.org_id = p_org_id;
  GET DIAGNOSTICS n = ROW_COUNT;

  -- Every item named must belong to this organization.
  IF n <> expected THEN
    RAISE EXCEPTION 'recode_products: % of % items belong to this organization', n, expected;
  END IF;

  UPDATE public.products p
     SET sku = c.sku
    FROM jsonb_to_recordset(p_changes) AS c(id uuid, sku text)
   WHERE p.id = c.id
     AND p.org_id = p_org_id;

  RETURN n;
END;
$$;

-- Functions are executable by PUBLIC by default, which would let any signed-in
-- user call this through the API with any organization's id. Only the server
-- (service role) may run it.
REVOKE ALL ON FUNCTION public.recode_products(uuid, jsonb) FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')          THEN REVOKE ALL ON FUNCTION public.recode_products(uuid, jsonb) FROM anon;          END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON FUNCTION public.recode_products(uuid, jsonb) FROM authenticated; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role')  THEN GRANT EXECUTE ON FUNCTION public.recode_products(uuid, jsonb) TO service_role;  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ── Verify ───────────────────────────────────────────────────
-- Should list products_org_sku_key and products_org_barcode_key, and no
-- unique index on sku or barcode alone:
--
--   SELECT indexname, indexdef FROM pg_indexes
--   WHERE schemaname = 'public' AND tablename = 'products';
