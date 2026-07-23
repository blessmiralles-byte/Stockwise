-- ============================================================
-- FIX: restore the org-aware signup trigger
-- ============================================================
-- A later migration (migrate-roles-sod.sql) accidentally overwrote the
-- multi-tenant handle_new_user() with a single-tenant version that:
--   - never creates an organization
--   - assigns 'owner' only to the very first user, everyone else 'viewer'
--   - never sets org_id
--
-- This restores the correct behavior: every fresh sign-up creates its own
-- organization (a 14-day trial via table defaults) and becomes its owner;
-- invited users (metadata carries org_id/role) join the existing org.
--
-- Run once in the Supabase SQL editor. Idempotent (CREATE OR REPLACE).

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_meta   jsonb := NEW.raw_user_meta_data;
  v_org_id uuid;
  v_role   text;
  v_name   text;
BEGIN
  v_name := COALESCE(v_meta->>'full_name', split_part(NEW.email, '@', 1));

  -- ── Invited user: join existing org ──────────────────────────
  IF (v_meta->>'org_id') IS NOT NULL THEN
    v_org_id := (v_meta->>'org_id')::uuid;
    v_role   := COALESCE(v_meta->>'role', 'viewer');

    IF v_role NOT IN ('owner','admin','procurement','operations','receiver','finance','viewer') THEN
      v_role := 'viewer';
    END IF;

  -- ── New sign-up: create a fresh organization (14-day trial) ──
  ELSE
    INSERT INTO public.organizations (name)
    VALUES (COALESCE(v_meta->>'company_name', 'My Company'))
    RETURNING id INTO v_org_id;

    v_role := 'owner';
  END IF;

  -- ── Create / update the user profile ─────────────────────────
  INSERT INTO public.user_profiles (id, full_name, email, role, org_id)
  VALUES (NEW.id, v_name, NEW.email, v_role, v_org_id)
  ON CONFLICT (id) DO UPDATE
    SET full_name = EXCLUDED.full_name,
        email     = EXCLUDED.email,
        role      = EXCLUDED.role,
        org_id    = EXCLUDED.org_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── Optional: heal accounts created while the trigger was broken ──
-- Any profile with a NULL org_id was created by the buggy trigger and has
-- no organization. This gives each orphaned user their own org + owner role.
-- Review the SELECT first; run the DO block only if the orphans are throwaway
-- test accounts you're happy to convert into solo owners.
--
--   SELECT id, email, role, org_id FROM public.user_profiles WHERE org_id IS NULL;
--
DO $$
DECLARE
  r        record;
  v_org_id uuid;
BEGIN
  FOR r IN SELECT id, email FROM public.user_profiles WHERE org_id IS NULL LOOP
    INSERT INTO public.organizations (name)
    VALUES ('My Company')
    RETURNING id INTO v_org_id;

    UPDATE public.user_profiles
       SET org_id = v_org_id,
           role   = 'owner'
     WHERE id = r.id;

    RAISE NOTICE 'Healed orphan user % → new org %', r.email, v_org_id;
  END LOOP;
END $$;
