-- ============================================================
-- Stocked — let an erased organization take its audit trail with it
-- Run in Supabase SQL Editor
-- ============================================================
--
-- THE BUG
--
-- migrate-audit-log.sql made audit_log immutable with a trigger that raises
-- on UPDATE *or* DELETE, for every row, unconditionally:
--
--   CREATE TRIGGER trg_audit_immutable
--     BEFORE UPDATE OR DELETE ON public.audit_log ...
--
-- migrate-multitenancy.sql then gave audit_log an org_id with
-- ON DELETE CASCADE. A cascade is a real DELETE on the child table, so it
-- fires that trigger, which raises, which aborts the whole transaction.
--
-- Net effect: DELETE FROM organizations fails for any org that has ever
-- written an audit entry — i.e. every real organization. That silently
-- breaks two things we tell people we do:
--
--   * the 90-day retention purge (/api/notifications/retention), which
--     deletes the organization row and relies on cascades
--   * any account-deletion / erasure request
--
-- THE FIX
--
-- Keep audit entries immutable while the organization exists — that is the
-- point of the trigger, and nobody should be able to edit or erase their own
-- tracks. Allow the delete only when the parent organization row is already
-- gone, which inside a cascade is exactly the case: Postgres deletes the
-- parent first, then cascades to children, so by the time this trigger runs
-- the organizations row is no longer visible in the transaction.
--
-- UPDATE stays blocked unconditionally. An audit entry is never rewritten.

CREATE OR REPLACE FUNCTION public.prevent_audit_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Rewriting history is never allowed, for anyone, ever.
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Audit log entries are immutable';
  END IF;

  -- A delete is allowed in exactly one case: the organization this entry
  -- belongs to has itself been deleted, so we are inside its cascade and the
  -- trail is being erased along with the account it describes.
  IF TG_OP = 'DELETE'
     AND OLD.org_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = OLD.org_id)
  THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'Audit log entries are immutable';
END;
$$;

-- The trigger itself is unchanged; recreate it only if it went missing.
DROP TRIGGER IF EXISTS trg_audit_immutable ON public.audit_log;
CREATE TRIGGER trg_audit_immutable
  BEFORE UPDATE OR DELETE ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_mutation();

-- ── Verify ───────────────────────────────────────────────────
-- 1. Rewriting an entry still fails:
--      UPDATE public.audit_log SET action = 'nope' WHERE id = (
--        SELECT id FROM public.audit_log LIMIT 1);
--      -- expected: ERROR  Audit log entries are immutable
--
-- 2. Deleting an entry whose org is alive still fails:
--      DELETE FROM public.audit_log WHERE id = (
--        SELECT id FROM public.audit_log LIMIT 1);
--      -- expected: ERROR  Audit log entries are immutable
--
-- 3. Erasing an organization now succeeds and takes its trail with it.
--    Against a throwaway org only:
--      DELETE FROM public.organizations WHERE slug = 'some-test-org';
--      -- expected: DELETE 1, and its audit_log rows are gone
