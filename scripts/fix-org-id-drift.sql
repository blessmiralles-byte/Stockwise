-- ============================================================
-- Fix org_id drift — the 7 tenant tables that never got org_id
-- from migrate-multitenancy.sql. Adds the column and back-fills
-- existing rows from each table's natural link so nothing vanishes
-- from the app (every query filters by org_id).
--
-- Safe / idempotent: ADD COLUMN IF NOT EXISTS + NULL-only back-fills.
-- Run once in the Supabase SQL editor.
--
-- Identified via the org_id sweep in MIGRATIONS.md:
--   accounting_periods, asset_depreciation_log, asset_movements,
--   maintenance_schedules, notifications, stock_counts, stock_count_lines
-- ============================================================

-- 1) Add the column ------------------------------------------------------------
alter table public.accounting_periods     add column if not exists org_id uuid references public.organizations(id) on delete cascade;
alter table public.asset_depreciation_log add column if not exists org_id uuid references public.organizations(id) on delete cascade;
alter table public.asset_movements        add column if not exists org_id uuid references public.organizations(id) on delete cascade;
alter table public.maintenance_schedules  add column if not exists org_id uuid references public.organizations(id) on delete cascade;
alter table public.notifications          add column if not exists org_id uuid references public.organizations(id) on delete cascade;
alter table public.stock_counts           add column if not exists org_id uuid references public.organizations(id) on delete cascade;
alter table public.stock_count_lines      add column if not exists org_id uuid references public.organizations(id) on delete cascade;

-- 2) Back-fill from each table's natural link (touches NULLs only) --------------
update public.accounting_periods p set org_id = up.org_id
  from public.user_profiles up where p.created_by = up.id and p.org_id is null;

update public.asset_depreciation_log d set org_id = a.org_id
  from public.fixed_assets a where d.asset_id = a.id and d.org_id is null;

update public.maintenance_schedules m set org_id = a.org_id
  from public.fixed_assets a where m.asset_id = a.id and m.org_id is null;

update public.notifications n set org_id = up.org_id
  from public.user_profiles up where n.user_id = up.id and n.org_id is null;

-- stock_count_lines link straight to a product (product_id is NOT NULL)
update public.stock_count_lines scl set org_id = p.org_id
  from public.products p where scl.product_id = p.id and scl.org_id is null;

-- stock_counts: prefer its location; fall back to its lines' product
update public.stock_counts s set org_id = l.org_id
  from public.locations l where s.location_id = l.id and s.org_id is null;

update public.stock_counts s set org_id = p.org_id
  from public.stock_count_lines scl
  join public.products p on p.id = scl.product_id
 where scl.stock_count_id = s.id and s.org_id is null;

-- asset_movements: legacy table, schema not tracked here — back-fill via asset_id
-- only if that column exists (harmless no-op otherwise).
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='asset_movements' and column_name='asset_id'
  ) then
    update public.asset_movements mv set org_id = a.org_id
      from public.fixed_assets a where mv.asset_id = a.id and mv.org_id is null;
  end if;
end $$;

notify pgrst, 'reload schema';
