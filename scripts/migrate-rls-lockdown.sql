-- ============================================================================
-- Stocked — row-level security lockdown (HANDOFF.md, Launch audit A1)
-- Paste the whole file into the Supabase SQL editor and run it once.
-- Safe to re-run. Runs in one transaction: all of it applies, or none of it.
-- ============================================================================
--
-- Why: the public (anon) key ships in the browser and the mobile app. Old
-- policies such as "Authenticated users full access … using (auth.role() =
-- 'authenticated')" and "job_codes_open … using (true)" let any signed-in
-- customer read, change and delete other companies' rows straight through
-- Supabase, and job_codes could be read with no login at all. Policies are
-- OR'd, so the org-scoped ones added later did not help while those existed.
-- Separately, functions that move stock (record_inventory_movement,
-- deduct_inventory_balance, …) could be called by anyone, even logged out.
--
-- The rule after this script:
--   * The web app reads and writes only through its API routes, using the
--     service role, which bypasses RLS. Nothing here changes that.
--   * Signed-in users may READ their own organization's rows (the mobile app
--     reads products, locations, suppliers, user_profiles and
--     inventory_transactions directly). They may not write anything directly.
--   * Logged-out (anon) callers may read and write nothing.
--   * Only the policy helper functions can be called with the public key.
-- ============================================================================

BEGIN;

-- ── 1. Drop every existing policy on every public table ─────────────────────
-- Start from nothing so no forgotten broad policy survives.
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policyname, p.tablename);
  END LOOP;
END $$;

-- ── 2. RLS on for every table; no direct writes; no anon access at all ──────
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT c.relname FROM pg_class c
           WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p') LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.relname);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t.relname);
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.%I FROM authenticated', t.relname);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t.relname);
  END LOOP;
END $$;

-- Views (none exist today) must not bypass RLS if one is added later.
DO $$
DECLARE v record;
BEGIN
  FOR v IN SELECT viewname FROM pg_views WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER VIEW public.%I SET (security_invoker = true)', v.viewname);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', v.viewname);
  END LOOP;
END $$;

-- ── 3. The helper the policies use ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.current_user_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT org_id FROM public.user_profiles WHERE id = auth.uid();
$$;

-- ── 4. Read policies: own organization only ─────────────────────────────────
-- Every table with an org_id gets one read policy, except the special cases
-- below and trial_claims (hashed emails; server only).
DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT c.table_name FROM information_schema.columns c
    JOIN pg_class k ON k.relname = c.table_name AND k.relnamespace = 'public'::regnamespace AND k.relkind IN ('r', 'p')
    WHERE c.table_schema = 'public' AND c.column_name = 'org_id'
      AND c.table_name NOT IN ('audit_log', 'notifications', 'user_profiles', 'trial_claims')
  LOOP
    EXECUTE format(
      'CREATE POLICY org_read ON public.%I FOR SELECT TO authenticated USING (org_id = public.current_user_org_id())',
      t.table_name);
  END LOOP;
END $$;

-- organizations: your own company only.
CREATE POLICY org_read ON public.organizations
  FOR SELECT TO authenticated
  USING (id = public.current_user_org_id());

-- user_profiles: yourself, and your teammates.
CREATE POLICY profiles_read ON public.user_profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR org_id = public.current_user_org_id());

-- notifications: only your own.
CREATE POLICY notifications_read ON public.notifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND org_id = public.current_user_org_id());

-- audit_log: owner, admin and finance of the same company (as before).
CREATE POLICY audit_read ON public.audit_log
  FOR SELECT TO authenticated
  USING (
    org_id = public.current_user_org_id()
    AND EXISTS (SELECT 1 FROM public.user_profiles
                WHERE id = auth.uid() AND role IN ('owner', 'admin', 'finance'))
  );

-- expo_push_tokens: your own devices only (registration goes through the API).
DO $$
BEGIN
  IF to_regclass('public.expo_push_tokens') IS NOT NULL THEN
    EXECUTE 'CREATE POLICY push_tokens_read ON public.expo_push_tokens
             FOR SELECT TO authenticated USING (user_id = auth.uid())';
  END IF;
END $$;

-- No policy (so: no access except the service role) on trial_claims,
-- schema_migrations, barcode_cache, job_orders, support_kb_articles.

-- ── 5. Functions: only the policy helpers may be called with the public key ─
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig, p.proname
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND p.prokind = 'f'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', f.sig);
    IF f.proname IN ('current_user_org_id', 'current_user_role', 'is_period_open', 'is_period_open_for') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f.sig);
    END IF;
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f.sig);
  END LOOP;
END $$;

-- Functions created later are not callable with the public key unless granted.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO service_role;

-- ── 6. Record it ────────────────────────────────────────────────────────────
INSERT INTO public.schema_migrations (name, applied_by, notes)
SELECT 'migrate-rls-lockdown.sql', 'manual',
       'Drop all policies; org-scoped SELECT only for authenticated; no anon; revoke function execute'
WHERE NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE name = 'migrate-rls-lockdown.sql');

COMMIT;

-- ── 7. What it left (read the output) ───────────────────────────────────────
SELECT tablename, policyname, cmd, roles::text, qual
FROM pg_policies WHERE schemaname = 'public' ORDER BY 1, 2;
