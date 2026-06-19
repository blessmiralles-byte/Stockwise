-- ============================================================
-- Fix: ensure suppliers table exists with org_id column
-- Safe to run multiple times (all statements are idempotent)
-- ============================================================

-- 1. Create table if it doesn't exist yet (includes org_id from the start)
CREATE TABLE IF NOT EXISTS public.suppliers (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid        REFERENCES public.organizations(id) ON DELETE CASCADE,
  name            text        NOT NULL,
  contact_name    text,
  email           text,
  phone           text,
  lead_time_days  integer     NOT NULL DEFAULT 7,
  payment_terms   text,
  notes           text,
  is_active       boolean     NOT NULL DEFAULT true,
  created_at      timestamptz DEFAULT NOW()
);

-- 2. Add org_id if table already existed without it
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_suppliers_active ON public.suppliers (is_active);
CREATE INDEX IF NOT EXISTS idx_suppliers_org    ON public.suppliers (org_id);

-- 4. Enable RLS (defence-in-depth — app uses service role so this is a safety net)
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "suppliers_read"  ON public.suppliers;
CREATE POLICY "suppliers_read" ON public.suppliers
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "suppliers_write" ON public.suppliers;
CREATE POLICY "suppliers_write" ON public.suppliers
  FOR ALL USING (
    public.current_user_role() IN (
      'owner', 'procurement', 'operations',
      'admin', 'manager'
    )
  );
