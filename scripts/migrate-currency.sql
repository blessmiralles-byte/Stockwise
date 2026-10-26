-- ============================================================================
-- Display currency per organization
-- ============================================================================
-- Every amount in the app was formatted as US dollars, whoever was looking:
-- a Philippine contractor entering ₱1,200 for a part saw "$1,200". The figures
-- were never converted, only mislabelled — which is worse than it sounds when
-- someone is approving spend against a limit.
--
-- This is a display setting, not a conversion. An organization records its
-- costs in one currency; we now say which one.
--
-- Existing accounts stay on USD, which is what they have been seeing.
--
-- Additive / idempotent — safe to re-run.
-- ============================================================================

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'USD';

-- ISO 4217, three uppercase letters. The app validates against its own list;
-- this stops anything obviously wrong reaching the column.
ALTER TABLE public.organizations DROP CONSTRAINT IF EXISTS organizations_currency_check;
ALTER TABLE public.organizations ADD CONSTRAINT organizations_currency_check
  CHECK (currency ~ '^[A-Z]{3}$');

NOTIFY pgrst, 'reload schema';
