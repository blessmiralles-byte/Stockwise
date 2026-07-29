# Stocked — database migration runbook

A single ordered list of every `scripts/*.sql` migration, in the order they
should be applied to a Supabase database. Use it to bring a database that has
drifted (e.g. a column added to a migration *after* it was first run) back in
sync with the code.

## How to use this

- **Every script is idempotent** — it uses `ADD COLUMN IF NOT EXISTS`,
  `CREATE OR REPLACE`, and `DROP ... IF EXISTS`. Re-running one is safe.
- Run them **top to bottom** in the order below. This order matters for two
  things that get redefined more than once (the signup trigger and the
  inventory RPC) — following the list leaves the *correct* final version in
  place.
- You do **not** have to re-run everything. The app running in production proves
  the foundational scripts are already applied. If you just want to close gaps,
  run the ones marked ⬜ and re-check with the diagnostic query at the bottom.
- After any run that adds columns, finish the SQL with
  `notify pgrst, 'reload schema';` so the API sees them immediately (a stale
  "schema cache" error otherwise looks like the column is still missing).

**Legend:** ✅ confirmed applied · ⬜ verify / run if unsure · ⚠️ special handling

---

## Phase 1 — Foundation

- ⚠️ ⬜ `setup-auth.sql` — user_profiles + RLS + original signup trigger.
  *(Its trigger is superseded — see Phase 9. Safe to run; the trigger is fixed at the end.)*
- ⬜ `migrate-attributes.sql` — product `attributes` (jsonb)
- ⬜ `migrate-locations.sql` — locations table + hierarchy
- ⬜ `rpc_record_movement.sql` — first atomic inventory RPC *(superseded by `fix-rpc-nuclear.sql`)*
- ⬜ `migrate-v2.sql` — schema v2 (stock counts, etc.)
- ⬜ `migrate-job-orders.sql` — `job_order_id` on transactions (JobLedger link)

## Phase 2 — Roles & access control

- ⬜ `setup-roles.sql` — initial roles *(superseded by roles-sod)*
- ⚠️ ⬜ `migrate-roles-sod.sql` — SoD roles (owner/procurement/operations/receiver/finance/viewer).
  *(Also redefines the signup trigger to a single-tenant version — this is the regression fixed in Phase 9. Safe as long as `fix-signup-trigger.sql` runs last.)*
- ⬜ `migrate-field.sql` — field-worker support
- ⬜ `migrate-audit-log.sql` — audit_log table
- ⬜ `migrate-rls-sod.sql` — RLS policies for the SoD roles
- ⬜ `migrate-sequences.sql` — document-number sequences

## Phase 3 — Finance & assets

- ⬜ `migrate-finance-controls.sql` — cost centers, accounting periods
- ⬜ `migrate-asset-rollforward.sql` — asset depreciation rollforward
- ⬜ `migrate-notifications.sql` — notifications table

## Phase 4 — Multi-tenancy (organizations)

- ⚠️ ⬜ `migrate-multitenancy.sql` — organizations table + `org_id` on every table + backfill.
  *(Contains the correct org-aware signup trigger, but Phase 9 restores it as the final word since roles-sod above clobbers it.)*
- ⬜ `migrate-suppliers-org.sql` — `org_id` on suppliers
- ⬜ `migrate-po-org-id.sql` — `org_id` on purchase orders

## Phase 5 — Purchase orders & receiving

- ⬜ `migrate-job-codes.sql` — job codes
- ⬜ `migrate-job-codes-billing.sql` — billable job codes
- ⬜ `migrate-po-invoice-fields.sql` — supplier-invoice fields on POs
- ⬜ `migrate-po-date.sql` — PO date fields
- ⬜ `migrate-po-created-by.sql` — `created_by` on POs
- ⬜ `migrate-grn-condition.sql` — receiving condition (good / damaged / missing)
- ✅ `migrate-over-receipt-tolerance.sql` — over-receipt tolerance

## Phase 6 — Products, categories, tracking

- ⬜ `migrate-products-fix.sql` — product column fixes
- ⬜ `migrate-category-types.sql` — category applies-to (product / asset / both)
- ⬜ `migrate-tracking.sql` — tracking columns
- ⬜ `migrate-last-seen.sql` — user last-seen
- ⬜ `migrate-setup-fix.sql` — setup fixes

## Phase 7 — Inventory transactions & the canonical RPC

Run these **in this order** — the last RPC definition wins.

- ⚠️ ⬜ `migrate-inventory-transactions-fix.sql` — **the one that bit us**: adds
  `status`, `related_po_id`, `org_id`, `created_by`, `cost_center_id`,
  `job_code` to `inventory_transactions`. If this was run before `related_po_id`
  was added to the file, re-run it (or the targeted patch below).
- ⬜ `migrate-assets-v2.sql` — fixed assets v2 (depreciation methods)
- ⬜ `migrate-assets-retire-sell.sql` — retire / sell tracking on assets
- ⬜ `migrate-requisitions.sql` — requisitions tables
- ⬜ `migrate-drop-old-rpc.sql` — drop obsolete RPC overloads
- ⬜ `migrate-rpc-consolidated.sql` — consolidated RPC *(superseded)*
- ⬜ `migrate-rpc-v2.sql` — RPC v2 *(superseded)*
- ✅ `fix-rpc-nuclear.sql` — **authoritative** `record_inventory_movement`. This
  is the final, correct RPC — must run after all the RPC scripts above.
- ⚠️ `reconcile-inventory-balances.sql` — recomputes on-hand balances from the
  ledger. **Run its preview `SELECT` first**; only apply if balances disagree.
  Data-affecting — do not run blindly.

## Phase 8 — Recent features

- ✅ `migrate-stock-count-attendees.sql` — stock-count attendees
- ✅ `migrate-stock-count-confirmations.sql` — stock-count confirmations
- ✅ `migrate-attribution.sql` — `organizations.attribution` (first-touch UTM)
- ✅ `migrate-barcode-cache.sql` — global barcode cache
- ✅ `migrate-product-needs-review.sql` — `products.needs_review`
- ✅ `migrate-tool-tracking.sql` — `asset_checkouts` + custody columns
- ✅ `migrate-lemonsqueezy.sql` — `organizations.ls_subscription_id / ls_customer_id / ls_variant_id`

## Phase 9 — Triggers (ALWAYS LAST)

- ✅ ⚠️ `fix-signup-trigger.sql` — **must be the last script you run.** Restores
  the org-aware signup trigger (new signup → new org + `owner`) that Phases 1–4
  redefine. If you re-run anything in Phases 1, 2, or 4, run this again after.

---

## Quick diagnostic — find gaps without re-running everything

Run this in the Supabase SQL editor. Any row returning `MISSING` points to a
migration in the list above that needs to be (re-)run.

```sql
select 'inventory_transactions.status'        as thing,
       to_regclass('public.inventory_transactions') is not null
       and exists (select 1 from information_schema.columns
                   where table_name='inventory_transactions' and column_name='status') as ok
union all select 'inventory_transactions.related_po_id',
       exists (select 1 from information_schema.columns
               where table_name='inventory_transactions' and column_name='related_po_id')
union all select 'inventory_transactions.org_id',
       exists (select 1 from information_schema.columns
               where table_name='inventory_transactions' and column_name='org_id')
union all select 'organizations.ls_subscription_id',
       exists (select 1 from information_schema.columns
               where table_name='organizations' and column_name='ls_subscription_id')
union all select 'organizations.attribution',
       exists (select 1 from information_schema.columns
               where table_name='organizations' and column_name='attribution')
union all select 'organizations.require_checkout_approval',
       exists (select 1 from information_schema.columns
               where table_name='organizations' and column_name='require_checkout_approval')
union all select 'products.needs_review',
       exists (select 1 from information_schema.columns
               where table_name='products' and column_name='needs_review')
union all select 'table: asset_checkouts',
       to_regclass('public.asset_checkouts') is not null
union all select 'table: notifications',
       to_regclass('public.notifications') is not null
union all select 'table: requisitions',
       to_regclass('public.requisitions') is not null
union all select 'fn: record_inventory_movement',
       exists (select 1 from pg_proc where proname='record_inventory_movement')
union all select 'signup trigger is org-aware',
       (select pg_get_functiondef(oid) ilike '%insert into public.organizations%'
        from pg_proc where proname='handle_new_user' limit 1);
```

Anything `false` → run the matching script(s), then finish with
`notify pgrst, 'reload schema';`

## Full `org_id` drift sweep (every tenant table)

`migrate-multitenancy.sql` was applied unevenly — `inventory_transactions`
and `accountable_persons` both turned up missing pieces mid-feature. This
checks the `org_id` column on **all 26 tenant tables** at once, so you can clear
the drift in a single pass instead of hitting it one feature at a time.

```sql
with expected(tbl) as (values
  ('accountable_persons'),('accounting_periods'),('asset_checkouts'),
  ('asset_depreciation_log'),('asset_movements'),('audit_log'),
  ('categories'),('cost_centers'),('fixed_assets'),('inventory_balances'),
  ('inventory_batches'),('inventory_transactions'),('job_codes'),
  ('locations'),('maintenance_schedules'),('notifications'),('products'),
  ('purchase_order_lines'),('purchase_orders'),('requisition_items'),
  ('requisitions'),('stock_count_attendees'),('stock_count_lines'),
  ('stock_counts'),('suppliers'),('user_profiles')
)
select
  e.tbl                                   as table_name,
  to_regclass('public.' || e.tbl) is not null as table_exists,
  exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name   = e.tbl
      and c.column_name  = 'org_id'
  )                                       as has_org_id
from expected e
order by has_org_id, table_exists, e.tbl;   -- problems float to the top
```

- `has_org_id = false` (but `table_exists = true`) → the table is missing
  `org_id`. That's the drift.
- `table_exists = false` → an entire table's migration never ran.

### Fixing it

**Cleanest:** re-run `migrate-multitenancy.sql` — it's idempotent, adds `org_id`
to every tenant table (`ADD COLUMN IF NOT EXISTS`), and back-fills it from the
linked product where possible. Then re-run `fix-signup-trigger.sql` **last**
(multitenancy resets the signup trigger, and fix-signup-trigger restores the
org-aware version).

**Or patch a single table** — add the column, then back-fill and reload:

```sql
alter table public.<table>
  add column if not exists org_id uuid references public.organizations(id) on delete cascade;

-- back-fill from the linked product when the table has product_id
-- (skip this line for tables without one, e.g. audit_log / notifications):
update public.<table> t set org_id = p.org_id
  from public.products p
 where t.product_id = p.id and t.org_id is null;

notify pgrst, 'reload schema';
```

> Rows left with a `NULL org_id` won't appear in the app (every query filters by
> org), so back-filling matters for any table that already holds data.

## Targeted patch for the column that bit us

If only `inventory_transactions` is behind, this is the minimal safe fix:

```sql
alter table public.inventory_transactions
  add column if not exists org_id         uuid references public.organizations(id) on delete cascade,
  add column if not exists created_by     uuid references auth.users(id),
  add column if not exists job_order_id   uuid,
  add column if not exists cost_center_id uuid,
  add column if not exists job_code       text,
  add column if not exists status         text not null default 'posted' check (status in ('draft','posted')),
  add column if not exists related_po_id  uuid references public.purchase_orders(id) on delete set null;

notify pgrst, 'reload schema';
```
