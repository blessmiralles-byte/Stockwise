-- Lemon Squeezy billing columns on organizations.
-- Replaces the Stripe-specific columns (stripe_customer_id / stripe_subscription_id
-- are left in place but no longer written to — safe to drop later).
--
-- Run once in the Supabase SQL editor before deploying the Lemon Squeezy billing code.

alter table public.organizations
  add column if not exists ls_subscription_id text,
  add column if not exists ls_customer_id     text,
  add column if not exists ls_variant_id      text;

create index if not exists idx_org_ls_subscription
  on public.organizations (ls_subscription_id);
