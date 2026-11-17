-- ============================================================================
-- Stocked — one API key per organization (HANDOFF.md, Launch audit A3)
-- Paste the whole file into the Supabase SQL editor and run it once. Safe to re-run.
-- ============================================================================
--
-- Replaces the shared POS_API_KEY / ACCOUNTING_API_KEY / JOBLEDGER_API_KEY env
-- vars, which worked for every company and let the caller name the company.
-- Now the key itself decides the company.
--
-- Only a SHA-256 hash of each key is stored. Keys are 32 random bytes, so a
-- plain hash is enough (no slow password hash needed); the full key is shown
-- to the owner once, when it is created, and cannot be shown again.
--
-- Server only: RLS is on with no policy, so the public key can't read it.

BEGIN;

CREATE TABLE IF NOT EXISTS public.api_keys (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name          text        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  scope         text        NOT NULL CHECK (scope IN ('pos', 'accounting', 'jobledger')),
  key_prefix    text        NOT NULL,           -- first characters, to tell keys apart on screen
  key_hash      text        NOT NULL UNIQUE,    -- sha256 hex of the full key
  created_by    uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_used_at  timestamptz,
  revoked_at    timestamptz,
  revoked_by    uuid        REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_api_keys_org ON public.api_keys(org_id);

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.api_keys FROM anon, authenticated;

-- purge_organization deletes by org; ON DELETE CASCADE above covers api_keys
-- when the organization row goes.

INSERT INTO public.schema_migrations (name, applied_by, notes)
SELECT 'migrate-api-keys.sql', 'manual', 'api_keys: one hashed key per organization and scope (pos, accounting, jobledger)'
WHERE NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE name = 'migrate-api-keys.sql');

COMMIT;

SELECT 'api_keys ready' AS result,
       (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.api_keys'::regclass) AS rls_on;
