-- StockWise — Supabase Schema
-- Run this in the Supabase SQL editor at https://supabase.com/dashboard

-- Locations
create table locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  address text,
  type text check (type in ('warehouse', 'office', 'store', 'other')) default 'warehouse',
  is_active boolean default true,
  created_at timestamptz default now()
);

-- Categories
create table categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text check (type in ('inventory', 'fixed_asset')) not null,
  created_at timestamptz default now()
);

-- Products (inventory items)
create table products (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  barcode text unique,
  name text not null,
  description text,
  category_id uuid references categories(id),
  unit_of_measure text not null default 'pc',
  reorder_point numeric default 0,
  cost_method text check (cost_method in ('fifo', 'average')) not null default 'average',
  image_url text,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- Inventory balances (current qty per product per location)
create table inventory_balances (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  location_id uuid not null references locations(id),
  quantity numeric not null default 0,
  avg_cost numeric not null default 0,
  last_updated timestamptz default now(),
  unique(product_id, location_id)
);

-- FIFO batches (for FIFO cost tracking)
create table inventory_batches (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id),
  location_id uuid not null references locations(id),
  purchase_date date not null,
  quantity_remaining numeric not null,
  unit_cost numeric not null,
  reference_no text,
  created_at timestamptz default now()
);

-- Inventory transactions (audit log)
create table inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  transaction_type text check (transaction_type in ('purchase','transfer','consumption','sale','adjustment')) not null,
  product_id uuid not null references products(id),
  from_location_id uuid references locations(id),
  to_location_id uuid references locations(id),
  quantity numeric not null,
  unit_cost numeric not null default 0,
  total_cost numeric generated always as (quantity * unit_cost) stored,
  reference_no text,
  customer_id text,
  notes text,
  created_at timestamptz default now(),
  created_by uuid references auth.users(id)
);

-- Accountable persons (for fixed assets)
create table accountable_persons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  department text,
  employee_id text,
  created_at timestamptz default now()
);

-- Fixed assets
create table fixed_assets (
  id uuid primary key default gen_random_uuid(),
  asset_tag text not null unique,
  barcode text unique,
  name text not null,
  description text,
  category_id uuid references categories(id),
  location_id uuid references locations(id),
  purchase_date date not null,
  purchase_cost numeric not null,
  current_value numeric,
  status text check (status in ('active','inactive','maintenance','disposed')) default 'active',
  accountable_person_id uuid references accountable_persons(id),
  serial_number text,
  image_url text,
  created_at timestamptz default now()
);

-- Asset movement history
create table asset_movements (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references fixed_assets(id),
  from_location_id uuid references locations(id),
  to_location_id uuid not null references locations(id),
  from_person_id uuid references accountable_persons(id),
  to_person_id uuid references accountable_persons(id),
  moved_at timestamptz default now(),
  reason text,
  created_by uuid references auth.users(id)
);

-- Maintenance schedules
create table maintenance_schedules (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references fixed_assets(id) on delete cascade,
  title text not null,
  description text,
  scheduled_date date not null,
  completed_date date,
  status text check (status in ('scheduled','completed','overdue')) default 'scheduled',
  notify_days_before int not null default 7,
  cost numeric,
  performed_by text,
  notes text,
  created_at timestamptz default now()
);

-- Row Level Security (enable on all tables)
alter table locations enable row level security;
alter table categories enable row level security;
alter table products enable row level security;
alter table inventory_balances enable row level security;
alter table inventory_batches enable row level security;
alter table inventory_transactions enable row level security;
alter table accountable_persons enable row level security;
alter table fixed_assets enable row level security;
alter table asset_movements enable row level security;
alter table maintenance_schedules enable row level security;

-- Basic RLS: authenticated users can read/write all (tighten per business rules)
create policy "Authenticated users full access" on locations for all using (auth.role() = 'authenticated');
create policy "Authenticated users full access" on categories for all using (auth.role() = 'authenticated');
create policy "Authenticated users full access" on products for all using (auth.role() = 'authenticated');
create policy "Authenticated users full access" on inventory_balances for all using (auth.role() = 'authenticated');
create policy "Authenticated users full access" on inventory_batches for all using (auth.role() = 'authenticated');
create policy "Authenticated users full access" on inventory_transactions for all using (auth.role() = 'authenticated');
create policy "Authenticated users full access" on accountable_persons for all using (auth.role() = 'authenticated');
create policy "Authenticated users full access" on fixed_assets for all using (auth.role() = 'authenticated');
create policy "Authenticated users full access" on asset_movements for all using (auth.role() = 'authenticated');
create policy "Authenticated users full access" on maintenance_schedules for all using (auth.role() = 'authenticated');

-- Useful indexes
create index on inventory_balances(product_id);
create index on inventory_balances(location_id);
create index on inventory_transactions(product_id);
create index on inventory_transactions(created_at desc);
create index on maintenance_schedules(scheduled_date);
create index on maintenance_schedules(status);
create index on products(barcode);
create index on fixed_assets(barcode);
