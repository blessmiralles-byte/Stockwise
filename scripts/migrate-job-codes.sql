-- ── Job Codes ──────────────────────────────────────────────────────────────────
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query).
-- No other migration needs to run first.

CREATE TABLE IF NOT EXISTS public.job_codes (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid        NOT NULL,
  code        text        NOT NULL,
  name        text        NOT NULL,
  description text,
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT NOW(),

  UNIQUE (org_id, code)
);

CREATE INDEX IF NOT EXISTS idx_job_codes_org ON public.job_codes(org_id);

-- Add FK to organizations only if that table already exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'organizations'
  ) THEN
    ALTER TABLE public.job_codes
      DROP CONSTRAINT IF EXISTS job_codes_org_id_fkey;
    ALTER TABLE public.job_codes
      ADD CONSTRAINT job_codes_org_id_fkey
      FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
  END IF;
END $$;

-- RLS (enable only if the helper function exists)
ALTER TABLE public.job_codes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'current_user_org_id'
  ) THEN
    -- Drop and recreate so re-running is safe
    DROP POLICY IF EXISTS job_codes_org_read  ON public.job_codes;
    DROP POLICY IF EXISTS job_codes_org_write ON public.job_codes;

    CREATE POLICY job_codes_org_read ON public.job_codes
      FOR SELECT USING (org_id = current_user_org_id());

    CREATE POLICY job_codes_org_write ON public.job_codes
      FOR ALL USING (org_id = current_user_org_id());
  ELSE
    -- Fallback: open read policy so the app can function without the helper
    DROP POLICY IF EXISTS job_codes_open ON public.job_codes;
    CREATE POLICY job_codes_open ON public.job_codes FOR ALL USING (true);
  END IF;
END $$;
