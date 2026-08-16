-- ============================================================
-- Delegation of authority: reporting line + approval limits
-- ============================================================
-- Adds an org hierarchy (who reports to whom) and per-member monetary
-- approval ceilings for requisitions and purchase orders, plus a PO
-- approval gate. Owner is always unlimited.
--
-- Additive / idempotent. Run once in the Supabase SQL editor.

-- ── 1. Reporting line + approval limits on members ───────────
alter table public.user_profiles
  add column if not exists reports_to uuid references public.user_profiles(id) on delete set null,
  add column if not exists requisition_approval_limit numeric(15,2),
  add column if not exists po_approval_limit          numeric(15,2);

-- ── 2. Approval gate on purchase orders ──────────────────────
alter table public.purchase_orders
  add column if not exists approved_by uuid references public.user_profiles(id),
  add column if not exists approved_at timestamptz,
  add column if not exists submitted_at timestamptz;

-- Extend the status set with the approval states.
alter table public.purchase_orders drop constraint if exists purchase_orders_status_check;
alter table public.purchase_orders add constraint purchase_orders_status_check
  check (status in ('draft','pending_approval','approved','sent','partial','received','cancelled'));

notify pgrst, 'reload schema';
