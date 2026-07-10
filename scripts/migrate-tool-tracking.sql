-- ============================================================
-- migrate-tool-tracking.sql
--
-- Turns the fixed-asset register into a contractor tool tracker: live
-- check-out / check-in custody, per-asset approval control, van assignment,
-- and full custody history.
--
--   organizations.require_checkout_approval — org-wide default
--   categories.require_checkout_approval     — per-category default (null = inherit org)
--   fixed_assets.requires_checkout_approval  — resolved per tool at creation, editable
--   fixed_assets.current_checkout_id + denormalized holder/job/due — fast "who has it now"
--   asset_checkouts                          — one row per check-out, the chain of custody
--   locations 'vehicle' type                 — vans/trucks tools live in
--
-- Run in the Supabase SQL Editor. Idempotent.
-- ============================================================

-- ── Approval control (org default → category default → per-asset) ─────────────
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS require_checkout_approval boolean NOT NULL DEFAULT false;

ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS require_checkout_approval boolean;   -- null = inherit org

ALTER TABLE public.fixed_assets
  ADD COLUMN IF NOT EXISTS requires_checkout_approval boolean NOT NULL DEFAULT false;

-- ── Denormalized current custody (for fast list/detail display) ───────────────
ALTER TABLE public.fixed_assets
  ADD COLUMN IF NOT EXISTS current_checkout_id uuid,
  ADD COLUMN IF NOT EXISTS checked_out_to      text,
  ADD COLUMN IF NOT EXISTS checked_out_job     text,
  ADD COLUMN IF NOT EXISTS checkout_due_at     timestamptz;

-- ── Custody log ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.asset_checkouts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid,
  asset_id      uuid NOT NULL REFERENCES public.fixed_assets(id) ON DELETE CASCADE,
  status        text NOT NULL DEFAULT 'out'
                     CHECK (status IN ('pending','out','returned','rejected')),
  holder_name   text NOT NULL,                                   -- who has it (crew member / worker)
  holder_person_id uuid REFERENCES public.accountable_persons(id),
  job_code      text,
  job_reference text,
  checked_out_by uuid REFERENCES public.user_profiles(id),
  checked_out_at timestamptz NOT NULL DEFAULT NOW(),
  due_at        timestamptz,
  approved_by   uuid REFERENCES public.user_profiles(id),
  approved_at   timestamptz,
  reject_reason text,
  returned_at   timestamptz,
  returned_to_location_id uuid REFERENCES public.locations(id),
  returned_by   uuid REFERENCES public.user_profiles(id),
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_asset_checkouts_asset  ON public.asset_checkouts (asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_checkouts_status ON public.asset_checkouts (org_id, status);
-- Only one live (pending/out) checkout per asset
CREATE UNIQUE INDEX IF NOT EXISTS uq_asset_checkouts_active
  ON public.asset_checkouts (asset_id)
  WHERE status IN ('pending','out');

-- ── Vans / trucks as a location type tools can live in ───────────────────────
ALTER TABLE public.locations DROP CONSTRAINT IF EXISTS locations_type_check;
ALTER TABLE public.locations
  ADD CONSTRAINT locations_type_check
  CHECK (type IN ('warehouse', 'office', 'store', 'room', 'shelf', 'vehicle', 'other'));
