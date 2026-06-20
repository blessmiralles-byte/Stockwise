-- ============================================================
-- Fix categories type check constraint
-- The original schema only allowed ('inventory', 'fixed_asset').
-- This widens it to also allow 'both'.
-- Safe to run multiple times.
-- ============================================================

-- Drop whatever constraint exists on type (name may vary)
DO $$
DECLARE
  c text;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.categories'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%type%'
  LOOP
    EXECUTE format('ALTER TABLE public.categories DROP CONSTRAINT %I', c);
  END LOOP;
END;
$$;

-- Add the correct constraint
ALTER TABLE public.categories
  ADD CONSTRAINT categories_type_check
  CHECK (type IN ('inventory', 'fixed_asset', 'both'));
