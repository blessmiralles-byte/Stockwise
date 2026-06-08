-- ─────────────────────────────────────────────────────────────────────────────
-- Migration tracking table
-- Run this ONCE in your Supabase SQL editor (or via the Supabase CLI).
--
-- After running, record every past and future migration in this table so you
-- always know exactly which scripts have been applied to each environment.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.schema_migrations (
  id          bigint       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        text         NOT NULL UNIQUE,          -- e.g. 'migrate-v2.sql'
  applied_at  timestamptz  NOT NULL DEFAULT now(),
  applied_by  text,                                   -- operator/deployer name
  notes       text                                    -- optional free text
);

-- Only owners / service role can see migration history
ALTER TABLE public.schema_migrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role only"
  ON public.schema_migrations
  FOR ALL
  USING (auth.role() = 'service_role');

-- ── Back-fill all migrations already applied to production ───────────────────
-- (adjust dates to match when you actually ran each script)

INSERT INTO public.schema_migrations (name, applied_by, notes) VALUES
  ('setup-auth.sql',               'manual', 'Auth trigger + handle_new_user'),
  ('setup-roles.sql',              'manual', 'Role definitions'),
  ('migrate-v2.sql',               'manual', 'Core inventory schema v2'),
  ('migrate-locations.sql',        'manual', 'Locations table'),
  ('migrate-assets-v2.sql',        'manual', 'Fixed assets schema'),
  ('migrate-finance-controls.sql', 'manual', 'Finance / AP controls'),
  ('migrate-multitenancy.sql',     'manual', 'Multi-tenancy org_id + organizations table'),
  ('migrate-audit-log.sql',        'manual', 'Audit log table'),
  ('migrate-notifications.sql',    'manual', 'In-app notifications'),
  ('migrate-requisitions.sql',     'manual', 'Purchase requisitions'),
  ('migrate-roles-sod.sql',        'manual', 'Segregation-of-duties roles'),
  ('migrate-rls-sod.sql',          'manual', 'Row-level security policies'),
  ('migrate-sequences.sql',        'manual', 'PO / GRN sequence numbers'),
  ('migrate-job-codes.sql',        'manual', 'Job codes for JobLedger integration'),
  ('migrate-job-orders.sql',       'manual', 'Job order lines'),
  ('migrate-field.sql',            'manual', 'Field / mobile features'),
  ('migrate-attributes.sql',       'manual', 'Custom item attributes'),
  ('migrate-po-invoice-fields.sql','manual', 'PO invoice extra fields'),
  ('migrate-asset-rollforward.sql','manual', 'Asset roll-forward schedule'),
  ('migrate-last-seen.sql',         'manual', 'last_seen_at column on user_profiles'),
  ('migrate-tracking.sql',         'manual', 'This migration tracking table')
ON CONFLICT (name) DO NOTHING;

-- ── Helper: call this after running any future migration ─────────────────────
-- Usage from your app or a deploy script:
--   SELECT record_migration('migrate-foo.sql', 'deploy-bot', 'Added foo table');

CREATE OR REPLACE FUNCTION public.record_migration(
  p_name       text,
  p_applied_by text DEFAULT NULL,
  p_notes      text DEFAULT NULL
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  INSERT INTO public.schema_migrations (name, applied_by, notes)
  VALUES (p_name, p_applied_by, p_notes)
  ON CONFLICT (name) DO NOTHING;
$$;
