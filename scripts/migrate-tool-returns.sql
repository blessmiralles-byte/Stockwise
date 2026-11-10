-- ============================================================
-- Stocked — condition on return, and overdue tool reminders
-- Run in Supabase SQL Editor. Safe to re-run.
-- ============================================================

-- What state the tool came back in. NULL on returns recorded before this
-- existed, and on checkouts closed by a lost/stolen report.
ALTER TABLE public.asset_checkouts
  ADD COLUMN IF NOT EXISTS return_condition text
    CHECK (return_condition IN ('good', 'damaged'));

-- What was wrong with it, in the returner's words.
ALTER TABLE public.asset_checkouts
  ADD COLUMN IF NOT EXISTS return_note text;

-- When we last reminded anyone this tool was overdue. Stops a daily nag:
-- a tool is flagged the day it goes overdue, then weekly while it stays out.
ALTER TABLE public.asset_checkouts
  ADD COLUMN IF NOT EXISTS overdue_notified_at timestamptz;

-- The nightly job reads "everything out with a due date"; history reads by
-- organization, newest first.
CREATE INDEX IF NOT EXISTS idx_asset_checkouts_out_due
  ON public.asset_checkouts (org_id, due_at)
  WHERE status = 'out' AND due_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_asset_checkouts_org_time
  ON public.asset_checkouts (org_id, checked_out_at DESC);

NOTIFY pgrst, 'reload schema';
