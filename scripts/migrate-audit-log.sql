-- ============================================================
-- StockWise — Tamper-Evident Audit Log  (M-4)
-- Run in Supabase SQL Editor
-- ============================================================

-- 1. Audit log table — append-only by design
CREATE TABLE IF NOT EXISTS public.audit_log (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  actor_id   uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  action     text        NOT NULL,    -- e.g. 'user.role_change', 'stock_count.approve'
  table_name text,                    -- affected table
  record_id  uuid,                    -- affected row id
  old_value  jsonb,                   -- snapshot before change
  new_value  jsonb,                   -- snapshot after change
  created_at timestamptz DEFAULT now()
);

-- 2. Indexes for common queries (who did what, when)
CREATE INDEX IF NOT EXISTS idx_audit_actor    ON public.audit_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_action   ON public.audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_table    ON public.audit_log(table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_created  ON public.audit_log(created_at DESC);

-- 3. Enable RLS
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- 4. Read: owner only (not even operations can read — prevents covering tracks)
DROP POLICY IF EXISTS "audit_read" ON public.audit_log;
CREATE POLICY "audit_read" ON public.audit_log
  FOR SELECT USING (public.current_user_role() IN ('owner', 'admin'));

-- 5. Insert: NO RLS insert policy — only service role can write
--    Application writes via service client which bypasses RLS entirely.
--    This prevents any user from forging audit entries through the anon key.

-- 6. No UPDATE or DELETE policies — audit entries are immutable.
--    To enforce this at DB level you can also add a trigger:
CREATE OR REPLACE FUNCTION public.prevent_audit_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Audit log entries are immutable';
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_immutable ON public.audit_log;
CREATE TRIGGER trg_audit_immutable
  BEFORE UPDATE OR DELETE ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_mutation();

-- Done. Verify:
-- SELECT * FROM public.audit_log ORDER BY created_at DESC LIMIT 20;
