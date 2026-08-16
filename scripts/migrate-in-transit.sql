-- ============================================================
-- In-transit stock transfers (two-step: ship → receive)
-- ============================================================
-- A long-distance Move ships stock to a system "In Transit" holding location
-- (so nothing vanishes from inventory), tagged with its final destination. The
-- receiving team then confirms the delivery (received qty) and it lands at the
-- destination. Additive / idempotent.

-- Flag the system In-Transit location so pickers can exclude it.
alter table public.locations
  add column if not exists is_transit boolean not null default false;

-- Delivery manifest.
create table if not exists public.stock_transfers (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations(id) on delete cascade,
  product_id        uuid not null references public.products(id),
  from_location_id  uuid references public.locations(id),   -- original source
  to_location_id    uuid not null references public.locations(id),  -- final destination
  quantity          numeric(15,3) not null,                 -- shipped
  quantity_received numeric(15,3) not null default 0,
  unit_cost         numeric(15,2) not null default 0,
  status            text not null default 'in_transit'
                    check (status in ('in_transit','received','cancelled')),
  reference_no      text,
  notes             text,
  shipped_by        uuid references public.user_profiles(id),
  shipped_at        timestamptz not null default now(),
  received_by       uuid references public.user_profiles(id),
  received_at       timestamptz,
  created_at        timestamptz not null default now()
);

create index if not exists idx_stock_transfers_org    on public.stock_transfers (org_id);
create index if not exists idx_stock_transfers_status on public.stock_transfers (org_id, status);
create index if not exists idx_stock_transfers_dest   on public.stock_transfers (to_location_id);

notify pgrst, 'reload schema';
