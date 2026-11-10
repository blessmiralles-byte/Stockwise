-- ============================================================
-- Stocked Tools — the tool tracker as its own plan
-- Run in Supabase SQL Editor. Safe to re-run.
-- ============================================================

-- 1. Allow the two new plan values. The old CHECK was declared inline, so its
--    name is generated; find it by what it constrains.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.organizations'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%plan%'
      AND pg_get_constraintdef(oid) ILIKE '%trial%'
  LOOP
    EXECUTE format('ALTER TABLE public.organizations DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_plan_check
  CHECK (plan IN ('trial', 'starter', 'pro', 'enterprise', 'tools_free', 'tools'));

-- 2. Sign-ups that arrived for Stocked Tools (metadata product = 'tools')
--    start on the free Tools plan with 2 seats, not a full-Stocked trial.
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

  IF (v_meta->>'org_id') IS NOT NULL THEN
    v_org_id := (v_meta->>'org_id')::uuid;
    v_role   := COALESCE(v_meta->>'role', 'viewer');
    IF v_role NOT IN ('owner','admin','procurement','operations','receiver','finance','viewer') THEN
      v_role := 'viewer';
    END IF;

  ELSIF (v_meta->>'product') = 'tools' THEN
    INSERT INTO public.organizations (name, plan, max_users)
    VALUES (COALESCE(v_meta->>'company_name', 'My Company'), 'tools_free', 2)
    RETURNING id INTO v_org_id;
    v_role := 'owner';

  ELSE
    INSERT INTO public.organizations (name)
    VALUES (COALESCE(v_meta->>'company_name', 'My Company'))
    RETURNING id INTO v_org_id;
    v_role := 'owner';
  END IF;

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

NOTIFY pgrst, 'reload schema';
