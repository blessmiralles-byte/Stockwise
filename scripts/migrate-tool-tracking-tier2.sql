-- ============================================================================
-- Tool tracking, tier 2 — inspections & calibration, loss & theft
-- ============================================================================
-- Safety-critical kit has to be inspected or calibrated on a cycle, and the
-- certificate has to be produced on demand. Tools also go missing, and that
-- needs a record: when, who had it, and what happened next.
--
-- Inspections reuse maintenance_schedules (same recurrence, reminders, overdue
-- handling and sign-off) with a `kind` to tell them apart, plus the certificate
-- a passed inspection produces.
--
--   maintenance_schedules.kind            maintenance | inspection | calibration
--   maintenance_schedules.certificate_no  reference on the certificate
--   maintenance_schedules.certified_until the date the certificate expires
--   asset_incidents                       lost / stolen / damaged reports
--   organizations.block_checkout_when_overdue  refuse check-out of kit whose
--                                         inspection is overdue (default off)
--
-- Additive / idempotent — safe to re-run.
-- ============================================================================

ALTER TABLE public.maintenance_schedules
  ADD COLUMN IF NOT EXISTS kind            text NOT NULL DEFAULT 'maintenance',
  ADD COLUMN IF NOT EXISTS certificate_no  text,
  ADD COLUMN IF NOT EXISTS certified_until date;

ALTER TABLE public.maintenance_schedules DROP CONSTRAINT IF EXISTS maintenance_schedules_kind_check;
ALTER TABLE public.maintenance_schedules ADD CONSTRAINT maintenance_schedules_kind_check
  CHECK (kind IN ('maintenance', 'inspection', 'calibration'));

CREATE INDEX IF NOT EXISTS idx_maintenance_kind ON public.maintenance_schedules(org_id, kind, status);

-- ── Loss, theft and damage ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.asset_incidents (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid NOT NULL,
  asset_id         uuid NOT NULL REFERENCES public.fixed_assets(id) ON DELETE CASCADE,
  -- the check-out the tool was on when it happened, when there was one
  checkout_id      uuid REFERENCES public.asset_checkouts(id) ON DELETE SET NULL,
  kind             text NOT NULL CHECK (kind IN ('lost', 'stolen', 'damaged')),
  status           text NOT NULL DEFAULT 'open'
                        CHECK (status IN ('open', 'recovered', 'written_off')),
  occurred_on      date NOT NULL DEFAULT current_date,
  last_seen        text,           -- site, van, job — free text
  description      text,
  police_report_no text,           -- theft reported to the police
  held_by          text,           -- who had it at the time (denormalized)
  estimated_loss   numeric(15, 2),
  reported_by      uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  resolved_by      uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  resolution_note  text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  resolved_at      timestamptz
);

CREATE INDEX IF NOT EXISTS idx_asset_incidents_org    ON public.asset_incidents(org_id, status);
CREATE INDEX IF NOT EXISTS idx_asset_incidents_asset  ON public.asset_incidents(asset_id);

-- Reached only through the API's service client.
ALTER TABLE public.asset_incidents ENABLE ROW LEVEL SECURITY;

-- Asset statuses widen to carry a missing tool. The list is every status the
-- app already accepts (see /api/assets/[id] validStatuses) plus lost/stolen —
-- 'inactive' is a real one, used by the Assets filter.
ALTER TABLE public.fixed_assets DROP CONSTRAINT IF EXISTS fixed_assets_status_check;
ALTER TABLE public.fixed_assets ADD CONSTRAINT fixed_assets_status_check
  CHECK (status IN ('active', 'inactive', 'maintenance', 'lost', 'stolen', 'retired', 'sold', 'disposed'));

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS block_checkout_when_overdue boolean NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';
