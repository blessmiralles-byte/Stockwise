-- ============================================================
-- Add billing/contact fields to job_codes
-- Safe to run multiple times
-- ============================================================

ALTER TABLE public.job_codes
  ADD COLUMN IF NOT EXISTS billing_entity  text,
  ADD COLUMN IF NOT EXISTS address         text,
  ADD COLUMN IF NOT EXISTS contact_name    text,
  ADD COLUMN IF NOT EXISTS contact_phone   text,
  ADD COLUMN IF NOT EXISTS contact_email   text;
