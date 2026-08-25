-- Org setting: require a cost center or job code when consuming stock.
-- Default false (opt-in), enforced server-side on consumption transactions.
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS require_cost_dimension boolean NOT NULL DEFAULT false;
