-- ============================================================
-- Stocked — make deleting an organization actually work
-- Run in Supabase SQL Editor. Safe to re-run.
-- ============================================================
-- Found by deleting a test company that had inventory:
--
--   update or delete on table "products" violates foreign key constraint
--   "purchase_order_lines_product_id_fkey" on table "purchase_order_lines"
--
-- Every tenant table cascades from organizations, but the tables also point
-- at each other (a PO line at its product, a transaction at its location).
-- Postgres runs each cascade as its own step and checks those links at the
-- end of that step — so removing the products is refused because the PO lines
-- haven't been removed yet, even though they are about to be.
--
-- Making those links cascade would be the wrong fix: deleting one product in
-- normal use would then silently take its whole transaction history with it.
-- Instead:
--
--   1. The links between tables become DEFERRABLE. Nothing changes in normal
--      use — they are still checked immediately.
--   2. purge_organization() defers them for one transaction, deletes the
--      organization, and lets the checks run at the end, when the products
--      and the lines that pointed at them are all gone together.

-- ── 1. Make table-to-table links deferrable ──────────────────────────────────
DO $$
DECLARE r record; def text;
BEGIN
  FOR r IN
    SELECT c.oid, c.conname, c.conrelid::regclass::text AS tbl, c.confdeltype
    FROM pg_constraint c
    WHERE c.contype = 'f'
      AND c.connamespace = 'public'::regnamespace
      AND c.confrelid <> 'public.organizations'::regclass
      AND c.confdeltype IN ('a', 'r')      -- NO ACTION / RESTRICT: the ones that block
      AND NOT c.condeferrable
  LOOP
    IF r.confdeltype = 'a' THEN
      EXECUTE format('ALTER TABLE %s ALTER CONSTRAINT %I DEFERRABLE INITIALLY IMMEDIATE', r.tbl, r.conname);
    ELSE
      -- RESTRICT can never be deferred; NO ACTION refuses the same deletes in
      -- normal use and can be.
      def := replace(pg_get_constraintdef(r.oid), ' ON DELETE RESTRICT', '');
      EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
      EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s DEFERRABLE INITIALLY IMMEDIATE', r.tbl, r.conname, def);
    END IF;
    RAISE NOTICE 'deferrable: %.%', r.tbl, r.conname;
  END LOOP;
END $$;

-- ── 2. The purge ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.purge_organization(p_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- For this transaction only: check links between tables at the end.
  SET CONSTRAINTS ALL DEFERRED;
  DELETE FROM public.organizations WHERE id = p_org_id;
  -- If anything outside this organization still points at its rows, the
  -- deferred checks fail here and the whole purge rolls back — nothing is
  -- half-deleted.
  SET CONSTRAINTS ALL IMMEDIATE;
END;
$$;

-- Deleting a company is the most destructive call there is: server only.
REVOKE ALL ON FUNCTION public.purge_organization(uuid) FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')          THEN REVOKE ALL ON FUNCTION public.purge_organization(uuid) FROM anon;          END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON FUNCTION public.purge_organization(uuid) FROM authenticated; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role')  THEN GRANT EXECUTE ON FUNCTION public.purge_organization(uuid) TO service_role;  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
