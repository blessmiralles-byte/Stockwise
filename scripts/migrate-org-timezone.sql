-- A6: each organization's time zone, so "today", due dates and report days
-- follow the customer's clock instead of UTC.
--
-- NULL until the first browser that opens the app reports its zone
-- (POST /api/org/timezone); the owner can change it in Settings → Company.
-- While NULL the server falls back to UTC (the old behaviour).
-- Safe to run more than once. Paste into Supabase → SQL editor.

BEGIN;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS timezone text;

-- IANA names are short ('Asia/Manila', 'America/Argentina/Buenos_Aires').
-- The app validates the name; this only keeps junk out.
ALTER TABLE public.organizations DROP CONSTRAINT IF EXISTS organizations_timezone_len;
ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_timezone_len CHECK (timezone IS NULL OR char_length(timezone) BETWEEN 1 AND 64);

INSERT INTO public.schema_migrations (name, applied_by, notes)
SELECT 'migrate-org-timezone.sql', 'manual', 'organizations.timezone (IANA name) for customer-local dates'
WHERE NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE name = 'migrate-org-timezone.sql');

COMMIT;

SELECT 'org timezone ready' AS result,
       (SELECT count(*) FROM public.organizations WHERE timezone IS NOT NULL) AS orgs_with_zone;
