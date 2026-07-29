-- Employee number on accountable persons (the tool-custody people master).
-- Gives each crew member a stable reference so tool reports don't rely on
-- how a name was typed. Optional per person; unique per org when set.
--
-- Run once in the Supabase SQL editor. Additive and idempotent.

-- Safety: some databases never got org_id on this table (multi-tenancy drift).
-- It's required for tenant isolation and for the per-org unique index below.
alter table public.accountable_persons
  add column if not exists org_id uuid references public.organizations(id) on delete cascade;

alter table public.accountable_persons
  add column if not exists employee_no text;

-- Case-insensitive uniqueness per organization (only when a number is set).
create unique index if not exists uq_accountable_persons_emp_no
  on public.accountable_persons (org_id, lower(employee_no))
  where employee_no is not null;

notify pgrst, 'reload schema';
