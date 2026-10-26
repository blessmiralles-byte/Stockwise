-- ============================================================================
-- Controls on issuing equipment
-- ============================================================================
-- Any signed-in person could check out any tool to any name they typed, so a
-- labourer could walk off with a laser level recorded as "the new guy".
--
--   restrict_checkout_to_self  when on, a crew member may only take a tool for
--                              themselves; owners, supervisors, buyers and the
--                              storekeeper may still issue to anyone
--   checkout_approval_over     tools worth more than this need approval
--                              whatever their own flag says, so nobody has to
--                              remember to tick the box on every costly item
--                              (null or 0 = no threshold)
--
-- Both default to off, so nothing changes for anyone already using Stocked
-- until an owner turns them on.
--
-- Additive / idempotent — safe to re-run.
-- ============================================================================

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS restrict_checkout_to_self boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS checkout_approval_over    numeric(15, 2);

ALTER TABLE public.organizations DROP CONSTRAINT IF EXISTS organizations_checkout_approval_over_check;
ALTER TABLE public.organizations ADD CONSTRAINT organizations_checkout_approval_over_check
  CHECK (checkout_approval_over IS NULL OR checkout_approval_over >= 0);

NOTIFY pgrst, 'reload schema';
