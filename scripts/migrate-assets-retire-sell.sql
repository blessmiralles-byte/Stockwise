-- Add retire / sell tracking columns to fixed_assets
-- Run once in Supabase SQL Editor

ALTER TABLE public.fixed_assets
  ADD COLUMN IF NOT EXISTS retired_at        timestamptz,
  ADD COLUMN IF NOT EXISTS retired_by        uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS retirement_reason text,

  ADD COLUMN IF NOT EXISTS sold_at    timestamptz,
  ADD COLUMN IF NOT EXISTS sold_by    uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS sale_price numeric(15, 2),
  ADD COLUMN IF NOT EXISTS sale_buyer text,
  ADD COLUMN IF NOT EXISTS sale_notes text;
