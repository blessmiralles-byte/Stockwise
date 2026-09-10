-- ============================================================================
-- Regional pricing — lock each organization to a price band
-- ============================================================================
--   'asean'    → ASEAN member states: Starter $49, Pro $99
--   'standard' → everyone else (North America rates): Starter $75, Pro $149
--
-- NULL = not yet seen. The app sets it from the visitor's country
-- (Vercel's x-vercel-ip-country header) the first time the org loads the
-- dashboard, calls /api/org, or starts a checkout — then never changes it on
-- its own, so the price stays stable when an owner travels. Existing orgs start
-- NULL and lock on their next visit; no backfill needed.
--
-- To move an org between bands manually:
--   UPDATE public.organizations SET pricing_region = 'asean' WHERE id = '...';
--
-- Idempotent — safe to re-run.
-- ============================================================================

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS pricing_region text;

ALTER TABLE public.organizations
  DROP CONSTRAINT IF EXISTS organizations_pricing_region_check;
ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_pricing_region_check
  CHECK (pricing_region IS NULL OR pricing_region IN ('standard', 'asean'));

-- PostgREST caches the schema; make the new column visible immediately.
NOTIFY pgrst, 'reload schema';
