-- ============================================================
-- StockWise — Auth & RLS setup
-- Run this once in Supabase SQL Editor
-- ============================================================

-- 1. User profiles (roles + display name)
create table if not exists public.user_profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  role        text not null default 'viewer'
                check (role in ('admin', 'manager', 'viewer')),
  created_at  timestamptz default now()
);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
declare
  user_count int;
begin
  select count(*) into user_count from public.user_profiles;
  insert into public.user_profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    case when user_count = 0 then 'admin' else 'viewer' end
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2. Enable RLS on all app tables
alter table public.user_profiles       enable row level security;
alter table public.locations           enable row level security;
alter table public.categories          enable row level security;
alter table public.products            enable row level security;
alter table public.inventory_balances  enable row level security;
alter table public.inventory_batches   enable row level security;
alter table public.inventory_transactions enable row level security;
alter table public.fixed_assets        enable row level security;
alter table public.accountable_persons enable row level security;
alter table public.asset_movements     enable row level security;
alter table public.maintenance_schedules enable row level security;

-- 3. Helper: get current user's role
create or replace function public.current_user_role()
returns text language sql security definer stable as $$
  select role from public.user_profiles where id = auth.uid();
$$;

-- 4. RLS policies — authenticated users can read everything
do $$
declare
  t text;
begin
  foreach t in array array[
    'locations','categories','products','inventory_balances',
    'inventory_batches','inventory_transactions','fixed_assets',
    'accountable_persons','asset_movements','maintenance_schedules'
  ] loop
    execute format('
      drop policy if exists "auth_read" on public.%I;
      create policy "auth_read" on public.%I
        for select using (auth.role() = ''authenticated'');
    ', t, t);
  end loop;
end $$;

-- 5. Write policies — admin + manager only
do $$
declare
  t text;
begin
  foreach t in array array[
    'locations','categories','products','inventory_balances',
    'inventory_batches','inventory_transactions','fixed_assets',
    'accountable_persons','asset_movements','maintenance_schedules'
  ] loop
    execute format('
      drop policy if exists "auth_write" on public.%I;
      create policy "auth_write" on public.%I
        for all using (public.current_user_role() in (''admin'',''manager''));
    ', t, t);
  end loop;
end $$;

-- 6. User profiles — own row only (service role bypasses for admin ops)
drop policy if exists "profiles_select" on public.user_profiles;
create policy "profiles_select" on public.user_profiles
  for select using (auth.uid() = id or public.current_user_role() = 'admin');

drop policy if exists "profiles_update" on public.user_profiles;
create policy "profiles_update" on public.user_profiles
  for update using (auth.uid() = id or public.current_user_role() = 'admin');
