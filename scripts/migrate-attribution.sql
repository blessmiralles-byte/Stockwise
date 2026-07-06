-- ============================================================
-- migrate-attribution.sql
--
-- Marketing attribution: which channel produced each signup. Captured
-- first-touch on the landing/register pages (UTM params, referrer, landing
-- path), carried through auth user metadata at signup, and stamped onto the
-- organization at onboarding.
--
-- Example value:
--   { "utm_source": "capterra", "utm_medium": "listing",
--     "referrer": "www.capterra.com", "landing_page": "/",
--     "captured_at": "2026-07-06T03:21:00Z" }
--
-- Reporting, e.g. trials by channel:
--   SELECT attribution->>'utm_source' AS source, count(*),
--          count(*) FILTER (WHERE plan <> 'trial') AS paying
--     FROM organizations GROUP BY 1 ORDER BY 2 DESC;
--
-- Run in the Supabase SQL Editor. Idempotent.
-- ============================================================

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS attribution jsonb;
