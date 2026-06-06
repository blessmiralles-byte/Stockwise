-- ============================================================
-- StockWise — Segregation of Duties Role Migration
-- Run in Supabase SQL Editor
-- ============================================================
-- New roles:
--   owner       — full access, assigns roles (replaces 'admin')
--   procurement — create/send POs, manage suppliers
--   operations  — manage stock counts, approve adjustments
--   receiver    — record goods receipt / GRN
--   finance     — read-only: valuation, ledger, PO matching
--   viewer      — read-only everywhere
--
-- Legacy aliases kept: 'admin' → treated as 'owner' in app code
--                      'manager' → treated as 'operations' in app code
-- ============================================================

-- 1. Add email column if it doesn't exist
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS email text;

-- 2. Sync email from auth.users where missing
UPDATE public.user_profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id AND (p.email IS NULL OR p.email = '');

-- 3. Drop the old CHECK constraint and add the new one
ALTER TABLE public.user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_role_check;

ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_role_check
  CHECK (role IN ('owner', 'procurement', 'operations', 'receiver', 'finance', 'viewer', 'admin', 'manager'));

-- 4. Migrate legacy roles
--    admin  → owner   (same privileges, new name)
--    manager → operations  (closest equivalent)
UPDATE public.user_profiles SET role = 'owner'      WHERE role = 'admin';
UPDATE public.user_profiles SET role = 'operations' WHERE role = 'manager';

-- 5. Now drop legacy aliases from the check (optional — keep for backward compat)
--    Comment this out if you want to keep 'admin' and 'manager' as valid DB values.
--    Leaving them in is safer since old sessions may still have the old role cached.

-- 6. Update handle_new_user() trigger to assign 'owner' instead of 'admin'
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  existing_count integer;
  assigned_role  text;
BEGIN
  SELECT COUNT(*) INTO existing_count FROM public.user_profiles;
  assigned_role := CASE WHEN existing_count = 0 THEN 'owner' ELSE 'viewer' END;

  INSERT INTO public.user_profiles (id, full_name, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.email,
    assigned_role
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Done. Verify with:
-- SELECT id, full_name, email, role FROM public.user_profiles ORDER BY created_at;
