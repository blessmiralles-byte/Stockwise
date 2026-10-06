-- ============================================================================
-- Sample data for new accounts — remembered exactly, so it can be removed
-- ============================================================================
-- A new owner lands on an app full of zeros. Loading a small sample lets them
-- see stock levels, a low-stock alert, a draft purchase order and a couple of
-- tools before importing anything of their own.
--
-- The ids created are stored here as {table: [id, ...]}, so "Remove sample
-- data" deletes exactly those rows — never a guess based on names, which would
-- risk deleting something real that happens to match.
--
-- Additive / idempotent — safe to re-run.
-- ============================================================================

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS sample_data      jsonb,
  ADD COLUMN IF NOT EXISTS sample_loaded_at timestamptz;

NOTIFY pgrst, 'reload schema';
