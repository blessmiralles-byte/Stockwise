-- ============================================================
-- StockWise — User Roles & Profiles
-- Run in Supabase SQL Editor ONCE
-- ============================================================

-- ── 1. user_profiles table ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id          uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   text,
  email       text,
  role        text        NOT NULL DEFAULT 'viewer'
                          CHECK (role IN ('admin', 'manager', 'viewer')),
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz DEFAULT NOW()
);

-- ── 2. RLS ───────────────────────────────────────────────────
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- Everyone can read their own profile
CREATE POLICY "Users can read own profile"
  ON public.user_profiles FOR SELECT
  USING (auth.uid() = id);

-- Admins can read all profiles
CREATE POLICY "Admins can read all profiles"
  ON public.user_profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid() AND up.role = 'admin'
    )
  );

-- Admins can update any profile
CREATE POLICY "Admins can update profiles"
  ON public.user_profiles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid() AND up.role = 'admin'
    )
  );

-- Users can update their own profile (name only — role change blocked by app layer)
CREATE POLICY "Users can update own profile"
  ON public.user_profiles FOR UPDATE
  USING (auth.uid() = id);

-- Service role can do everything (used by API routes with service client)
-- This is granted automatically to the service_role key

-- ── 3. Auto-create profile on sign-up ────────────────────────
-- First user ever → admin. All subsequent users → viewer.
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
  assigned_role := CASE WHEN existing_count = 0 THEN 'admin' ELSE 'viewer' END;

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

-- Drop + recreate trigger so re-running is safe
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── 4. Back-fill profiles for any existing auth users ────────
-- Assigns 'admin' to the earliest user, 'viewer' to the rest
INSERT INTO public.user_profiles (id, full_name, email, role)
SELECT
  u.id,
  COALESCE(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)),
  u.email,
  CASE
    WHEN ROW_NUMBER() OVER (ORDER BY u.created_at) = 1 THEN 'admin'
    ELSE 'viewer'
  END
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_profiles p WHERE p.id = u.id
);
