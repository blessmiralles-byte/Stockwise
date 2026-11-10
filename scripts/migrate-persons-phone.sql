-- ============================================================
-- Stocked — the people list was failing for every account
-- Run in Supabase SQL Editor. Safe to re-run.
-- ============================================================
-- /api/accountable-persons selects and writes a `phone` column that no
-- migration ever created, so the list returned a 500 for everyone: the
-- "pick from people" dropdown on tool check-out was empty, and the People
-- screen could neither list nor save.

ALTER TABLE public.accountable_persons
  ADD COLUMN IF NOT EXISTS phone text;

NOTIFY pgrst, 'reload schema';
