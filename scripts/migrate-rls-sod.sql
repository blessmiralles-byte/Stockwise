-- ============================================================
-- StockWise — RLS Policy Update for SOD Roles  (M-1)
-- Aligns Row Level Security with the SOD role names.
-- Run AFTER migrate-roles-sod.sql
-- ============================================================

-- 1. Update current_user_role() helper to cover all SOD roles
--    (Already correct — returns the raw role string, no change needed)

-- 2. Update write policies to use SOD role names
--    Note: all application writes go via service role (bypasses RLS).
--    These policies are defense-in-depth for any direct/anon-key access.

-- Tables where any authenticated user above viewer can write
-- (field workers need to insert transactions, maintenance records, etc.)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'inventory_transactions',
    'maintenance_schedules',
    'asset_movements'
  ] LOOP
    EXECUTE format('
      DROP POLICY IF EXISTS "auth_write" ON public.%I;
      CREATE POLICY "auth_write" ON public.%I
        FOR ALL USING (
          public.current_user_role() IN (
            ''owner'', ''procurement'', ''operations'', ''receiver'', ''finance'',
            ''admin'', ''manager''   -- legacy aliases
          )
        );
    ', t, t);
  END LOOP;
END $$;

-- Tables that require operations/procurement/owner to write
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'products',
    'categories',
    'locations',
    'inventory_balances',
    'inventory_batches',
    'fixed_assets',
    'accountable_persons'
  ] LOOP
    EXECUTE format('
      DROP POLICY IF EXISTS "auth_write" ON public.%I;
      CREATE POLICY "auth_write" ON public.%I
        FOR ALL USING (
          public.current_user_role() IN (
            ''owner'', ''procurement'', ''operations'',
            ''admin'', ''manager''   -- legacy aliases
          )
        );
    ', t, t);
  END LOOP;
END $$;

-- 3. Update user_profiles policies to use 'owner' instead of 'admin'
DROP POLICY IF EXISTS "profiles_select" ON public.user_profiles;
CREATE POLICY "profiles_select" ON public.user_profiles
  FOR SELECT USING (
    auth.uid() = id OR
    public.current_user_role() IN ('owner', 'admin')
  );

DROP POLICY IF EXISTS "profiles_update" ON public.user_profiles;
CREATE POLICY "profiles_update" ON public.user_profiles
  FOR UPDATE USING (
    auth.uid() = id OR
    public.current_user_role() IN ('owner', 'admin')
  );

-- 4. Enable RLS on new tables from the requisitions migration
ALTER TABLE IF EXISTS public.requisitions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.requisition_items  ENABLE ROW LEVEL SECURITY;

-- Read: any authenticated user can read requisitions
DROP POLICY IF EXISTS "req_read" ON public.requisitions;
CREATE POLICY "req_read" ON public.requisitions
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "req_items_read" ON public.requisition_items;
CREATE POLICY "req_items_read" ON public.requisition_items
  FOR SELECT USING (auth.role() = 'authenticated');

-- Write: any authenticated non-viewer can create/update requisitions
DROP POLICY IF EXISTS "req_write" ON public.requisitions;
CREATE POLICY "req_write" ON public.requisitions
  FOR ALL USING (
    public.current_user_role() IN (
      'owner', 'procurement', 'operations', 'receiver', 'finance',
      'admin', 'manager'
    )
  );

DROP POLICY IF EXISTS "req_items_write" ON public.requisition_items;
CREATE POLICY "req_items_write" ON public.requisition_items
  FOR ALL USING (
    public.current_user_role() IN (
      'owner', 'procurement', 'operations', 'receiver', 'finance',
      'admin', 'manager'
    )
  );

-- 5. Audit log table (if migrate-audit-log.sql was run first)
--    Policy is already defined there; this is a no-op if already applied.
ALTER TABLE IF EXISTS public.audit_log ENABLE ROW LEVEL SECURITY;

-- Done. Verify with:
-- SELECT tablename, policyname, cmd FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename;
