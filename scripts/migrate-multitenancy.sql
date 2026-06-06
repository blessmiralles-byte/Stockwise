-- ============================================================
-- StockWise — Multi-Tenancy: Organizations
-- Run in Supabase SQL Editor AFTER all previous migrations.
-- ============================================================
-- This migration adds an `organizations` table and an `org_id`
-- column to every data table.  All application-layer queries
-- MUST filter by org_id (enforcement is at the app layer because
-- we use the service-role client; RLS here is defence-in-depth).
-- ============================================================

-- ── 0. organisations table ────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.organizations (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                   text        NOT NULL DEFAULT 'My Company',
  slug                   text        UNIQUE,          -- future: subdomain routing
  plan                   text        NOT NULL DEFAULT 'trial'
                                     CHECK (plan IN ('trial', 'starter', 'pro', 'enterprise')),
  plan_status            text        NOT NULL DEFAULT 'active'
                                     CHECK (plan_status IN ('active', 'past_due', 'cancelled')),
  trial_ends_at          timestamptz NOT NULL DEFAULT (NOW() + INTERVAL '14 days'),
  stripe_customer_id     text        UNIQUE,
  stripe_subscription_id text        UNIQUE,
  max_users              integer     NOT NULL DEFAULT 5,
  created_at             timestamptz NOT NULL DEFAULT NOW(),
  updated_at             timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orgs_stripe_customer ON public.organizations (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_org_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_orgs_updated_at ON public.organizations;
CREATE TRIGGER trg_orgs_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.set_org_updated_at();

-- RLS: service role bypasses; direct access only via service client
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "orgs_select_own" ON public.organizations;
CREATE POLICY "orgs_select_own" ON public.organizations
  FOR SELECT TO authenticated
  USING (
    id IN (
      SELECT org_id FROM public.user_profiles WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "orgs_update_owner" ON public.organizations;
CREATE POLICY "orgs_update_owner" ON public.organizations
  FOR UPDATE TO authenticated
  USING (
    id IN (
      SELECT org_id FROM public.user_profiles
       WHERE id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- ── 1. Add org_id to user_profiles ───────────────────────────

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_user_profiles_org ON public.user_profiles (org_id);

-- ── 2. Add org_id to every data table ────────────────────────
-- (All nullable initially to allow backfill; set NOT NULL after backfill below.)

ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.inventory_balances
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.inventory_batches
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.inventory_transactions
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.purchase_order_lines
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.stock_counts
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.stock_count_lines
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.fixed_assets
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.accountable_persons
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.asset_movements
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.maintenance_schedules
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.requisitions
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.requisition_items
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.cost_centers
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.accounting_periods
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.asset_depreciation_log
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.audit_log
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

-- ── 3. Indexes on org_id (performance) ───────────────────────

CREATE INDEX IF NOT EXISTS idx_categories_org         ON public.categories (org_id);
CREATE INDEX IF NOT EXISTS idx_locations_org          ON public.locations (org_id);
CREATE INDEX IF NOT EXISTS idx_products_org           ON public.products (org_id);
CREATE INDEX IF NOT EXISTS idx_inv_balances_org       ON public.inventory_balances (org_id);
CREATE INDEX IF NOT EXISTS idx_inv_batches_org        ON public.inventory_batches (org_id);
CREATE INDEX IF NOT EXISTS idx_inv_transactions_org   ON public.inventory_transactions (org_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_org          ON public.suppliers (org_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_org    ON public.purchase_orders (org_id);
CREATE INDEX IF NOT EXISTS idx_pol_org                ON public.purchase_order_lines (org_id);
CREATE INDEX IF NOT EXISTS idx_stock_counts_org       ON public.stock_counts (org_id);
CREATE INDEX IF NOT EXISTS idx_scl_org                ON public.stock_count_lines (org_id);
CREATE INDEX IF NOT EXISTS idx_fixed_assets_org       ON public.fixed_assets (org_id);
CREATE INDEX IF NOT EXISTS idx_accountable_org        ON public.accountable_persons (org_id);
CREATE INDEX IF NOT EXISTS idx_asset_movements_org    ON public.asset_movements (org_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_org        ON public.maintenance_schedules (org_id);
CREATE INDEX IF NOT EXISTS idx_requisitions_org       ON public.requisitions (org_id);
CREATE INDEX IF NOT EXISTS idx_req_items_org          ON public.requisition_items (org_id);
CREATE INDEX IF NOT EXISTS idx_cost_centers_org       ON public.cost_centers (org_id);
CREATE INDEX IF NOT EXISTS idx_acct_periods_org       ON public.accounting_periods (org_id);
CREATE INDEX IF NOT EXISTS idx_depr_log_org           ON public.asset_depreciation_log (org_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_org          ON public.audit_log (org_id);
CREATE INDEX IF NOT EXISTS idx_notifications_org      ON public.notifications (org_id);

-- ── 4. Backfill: create one "default" org for existing data ──
-- If you have existing users/data, this creates a single org and
-- assigns all rows to it.  Safe to run on a fresh database too.

DO $$
DECLARE
  v_org_id uuid;
BEGIN
  -- Only run if there are existing users without an org
  IF EXISTS (SELECT 1 FROM public.user_profiles WHERE org_id IS NULL LIMIT 1) THEN

    -- Create a default org
    INSERT INTO public.organizations (name, plan)
    VALUES ('Default Organization', 'trial')
    RETURNING id INTO v_org_id;

    -- Assign all existing users to this org
    UPDATE public.user_profiles SET org_id = v_org_id WHERE org_id IS NULL;

    -- Make the earliest user the owner
    UPDATE public.user_profiles
       SET role = 'owner'
     WHERE id = (
       SELECT id FROM public.user_profiles ORDER BY created_at ASC LIMIT 1
     );

    -- Backfill org_id on all data tables
    UPDATE public.categories            SET org_id = v_org_id WHERE org_id IS NULL;
    UPDATE public.locations             SET org_id = v_org_id WHERE org_id IS NULL;
    UPDATE public.products              SET org_id = v_org_id WHERE org_id IS NULL;
    UPDATE public.inventory_balances    SET org_id = v_org_id WHERE org_id IS NULL;
    UPDATE public.inventory_batches     SET org_id = v_org_id WHERE org_id IS NULL;
    UPDATE public.inventory_transactions SET org_id = v_org_id WHERE org_id IS NULL;
    UPDATE public.suppliers             SET org_id = v_org_id WHERE org_id IS NULL;
    UPDATE public.purchase_orders       SET org_id = v_org_id WHERE org_id IS NULL;
    UPDATE public.purchase_order_lines  SET org_id = v_org_id WHERE org_id IS NULL;
    UPDATE public.stock_counts          SET org_id = v_org_id WHERE org_id IS NULL;
    UPDATE public.stock_count_lines     SET org_id = v_org_id WHERE org_id IS NULL;
    UPDATE public.fixed_assets          SET org_id = v_org_id WHERE org_id IS NULL;
    UPDATE public.maintenance_schedules SET org_id = v_org_id WHERE org_id IS NULL;
    UPDATE public.requisitions          SET org_id = v_org_id WHERE org_id IS NULL;
    UPDATE public.requisition_items     SET org_id = v_org_id WHERE org_id IS NULL;
    UPDATE public.cost_centers          SET org_id = v_org_id WHERE org_id IS NULL;
    UPDATE public.accounting_periods    SET org_id = v_org_id WHERE org_id IS NULL;
    UPDATE public.asset_depreciation_log SET org_id = v_org_id WHERE org_id IS NULL;
    UPDATE public.audit_log             SET org_id = v_org_id WHERE org_id IS NULL;
    UPDATE public.notifications         SET org_id = v_org_id WHERE org_id IS NULL;

    RAISE NOTICE 'Backfill complete. Default org id = %', v_org_id;
  ELSE
    RAISE NOTICE 'No backfill needed (no users without org_id).';
  END IF;
END $$;

-- ── 5. Replace handle_new_user() with org-aware version ──────
--
-- Rules:
--   a) Invited user  → raw_user_meta_data has 'org_id' and 'role'
--                       → join that org with supplied role
--   b) Fresh sign-up → create a new org (name set in /onboarding)
--                       → user becomes 'owner'

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_meta     jsonb := NEW.raw_user_meta_data;
  v_org_id   uuid;
  v_role     text;
  v_name     text;
BEGIN
  v_name := COALESCE(v_meta->>'full_name', split_part(NEW.email, '@', 1));

  -- ── Invited user: join existing org ──────────────────────────
  IF (v_meta->>'org_id') IS NOT NULL THEN
    v_org_id := (v_meta->>'org_id')::uuid;
    v_role   := COALESCE(v_meta->>'role', 'viewer');

    -- Validate role
    IF v_role NOT IN ('owner','admin','procurement','operations','receiver','finance','viewer') THEN
      v_role := 'viewer';
    END IF;

  -- ── New sign-up: create a fresh organization ─────────────────
  ELSE
    INSERT INTO public.organizations (name)
    VALUES (COALESCE(v_meta->>'company_name', 'My Company'))
    RETURNING id INTO v_org_id;

    v_role := 'owner';
  END IF;

  -- ── Create the user profile ───────────────────────────────────
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

-- Recreate trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── 6. Helper: current user's org_id ─────────────────────────

CREATE OR REPLACE FUNCTION public.current_user_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT org_id FROM public.user_profiles WHERE id = auth.uid();
$$;

-- ── 7. Defence-in-depth RLS (service role bypasses) ──────────
-- Policy pattern: user must be in the same org as the row.

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'categories','locations','products','inventory_balances',
    'inventory_batches','inventory_transactions',
    'suppliers','purchase_orders','purchase_order_lines',
    'stock_counts','stock_count_lines',
    'fixed_assets','maintenance_schedules',
    'requisitions','requisition_items',
    'cost_centers','accounting_periods',
    'asset_depreciation_log'
  ] LOOP
    -- Drop old broad policies first
    EXECUTE format('DROP POLICY IF EXISTS "auth_read"  ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "auth_write" ON public.%I', t);
    -- Org-scoped read
    EXECUTE format('
      DROP POLICY IF EXISTS "org_read" ON public.%I;
      CREATE POLICY "org_read" ON public.%I
        FOR SELECT TO authenticated
        USING (org_id = public.current_user_org_id());
    ', t, t);
    -- Org-scoped write
    EXECUTE format('
      DROP POLICY IF EXISTS "org_write" ON public.%I;
      CREATE POLICY "org_write" ON public.%I
        FOR ALL TO authenticated
        USING (org_id = public.current_user_org_id());
    ', t, t);
  END LOOP;
END $$;

-- audit_log: org-scoped read, no direct write (service role only)
DROP POLICY IF EXISTS "audit_read"   ON public.audit_log;
DROP POLICY IF EXISTS "org_read"     ON public.audit_log;
CREATE POLICY "org_read" ON public.audit_log
  FOR SELECT TO authenticated
  USING (
    org_id = public.current_user_org_id()
    AND
    EXISTS (
      SELECT 1 FROM public.user_profiles
       WHERE id = auth.uid() AND role IN ('owner', 'admin', 'finance')
    )
  );

-- notifications: user-scoped (already filtered by user_id in app)
DROP POLICY IF EXISTS "notif_select" ON public.notifications;
CREATE POLICY "notif_select" ON public.notifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND org_id = public.current_user_org_id());

-- user_profiles: updated org-scoped policies
DROP POLICY IF EXISTS "profiles_select"           ON public.user_profiles;
DROP POLICY IF EXISTS "Admins can read all profiles" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can read own profile"   ON public.user_profiles;

CREATE POLICY "profiles_select" ON public.user_profiles
  FOR SELECT TO authenticated
  USING (
    -- Own row OR same org (for team management)
    id = auth.uid()
    OR org_id = public.current_user_org_id()
  );

-- ── Done ─────────────────────────────────────────────────────

SELECT
  (SELECT COUNT(*) FROM public.organizations)      AS organizations,
  (SELECT COUNT(*) FROM public.user_profiles WHERE org_id IS NOT NULL) AS users_with_org,
  (SELECT COUNT(*) FROM public.products      WHERE org_id IS NOT NULL) AS products_with_org,
  (SELECT COUNT(*) FROM public.locations     WHERE org_id IS NOT NULL) AS locations_with_org;
