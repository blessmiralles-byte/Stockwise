-- ============================================================
-- Fix: ensure setup tables have org_id and exist
-- Covers: locations, categories, cost_centers
-- Safe to run multiple times (all statements are idempotent)
-- ============================================================

-- ── Locations ────────────────────────────────────────────────
ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS level     integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS parent_id uuid    REFERENCES public.locations(id);

CREATE INDEX IF NOT EXISTS idx_locations_org ON public.locations (org_id);

-- ── Categories ───────────────────────────────────────────────
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_categories_org ON public.categories (org_id);

-- ── Cost Centers ─────────────────────────────────────────────
-- Create table if it doesn't exist yet
CREATE TABLE IF NOT EXISTS public.cost_centers (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid        REFERENCES public.organizations(id) ON DELETE CASCADE,
  code        text        NOT NULL,
  name        text        NOT NULL,
  description text,
  is_active   boolean     NOT NULL DEFAULT true,
  created_by  uuid        REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Add org_id if table existed without it
ALTER TABLE public.cost_centers
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_cost_centers_org  ON public.cost_centers (org_id);
CREATE INDEX IF NOT EXISTS idx_cost_centers_code ON public.cost_centers (code) WHERE is_active = true;

-- RLS
ALTER TABLE public.cost_centers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cost_centers_read"  ON public.cost_centers;
DROP POLICY IF EXISTS "cost_centers_write" ON public.cost_centers;
CREATE POLICY "cost_centers_read"  ON public.cost_centers FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "cost_centers_write" ON public.cost_centers FOR ALL    USING (auth.role() = 'authenticated');
