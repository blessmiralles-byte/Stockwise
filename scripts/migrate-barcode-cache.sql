-- ============================================================
-- migrate-barcode-cache.sql
--
-- Caches global barcode lookups (from Open Food Facts / UPCitemdb / etc.) so a
-- barcode is only fetched from an external provider once, ever, across the
-- whole platform. The catalog data behind a UPC/EAN is the same for everyone,
-- so this cache is intentionally NOT org-scoped — it saves external API quota
-- and makes repeat scans instant.
--
-- `found = false` rows are negative cache: a barcode that no provider knows,
-- so we don't hammer the APIs on every re-scan of an unlisted item.
--
-- Run in the Supabase SQL Editor. Idempotent.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.barcode_cache (
  barcode     text PRIMARY KEY,
  found       boolean NOT NULL DEFAULT false,
  name        text,
  brand       text,
  category    text,
  image_url   text,
  source      text,                       -- provider that answered (e.g. 'open_food_facts')
  fetched_at  timestamptz NOT NULL DEFAULT now()
);
