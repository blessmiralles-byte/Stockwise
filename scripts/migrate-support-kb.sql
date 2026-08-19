-- ============================================================================
-- Support chatbot knowledge base — live additions layer
-- ============================================================================
-- The base product knowledge lives in code (src/lib/support-kb.ts) and is
-- always sent to the assistant. This table holds ADDITIONAL entries the founder
-- can edit without a code deploy — new features, corrections, FAQs. The chat
-- route appends every active row's content on top of the built-in text.
--
-- This is GLOBAL product knowledge (not per-org): no org_id. It is read only by
-- the server via the service-role client, so RLS denies all direct access.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.support_kb_articles (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title      text NOT NULL,
  content    text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Fetch ordering for active rows
CREATE INDEX IF NOT EXISTS idx_support_kb_active
  ON public.support_kb_articles (is_active, sort_order);

-- Lock it down: only the service role (server) may read/write. No public/anon
-- or authenticated access — the assistant reads it server-side.
ALTER TABLE public.support_kb_articles ENABLE ROW LEVEL SECURITY;

-- keep updated_at fresh
CREATE OR REPLACE FUNCTION public.touch_support_kb_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_support_kb_touch ON public.support_kb_articles;
CREATE TRIGGER trg_support_kb_touch
  BEFORE UPDATE ON public.support_kb_articles
  FOR EACH ROW EXECUTE FUNCTION public.touch_support_kb_updated_at();

-- ── How to add knowledge later (examples) ───────────────────────────────────
-- INSERT INTO public.support_kb_articles (title, content, sort_order) VALUES
--   ('Barcodes',
--    'Products can carry a barcode. Add or edit it in Setup & Import > Products '
--    || '(type or tap Scan to use the camera), during item review in Inventory, '
--    || 'or in bulk via the product import (the barcode column).',
--    10);
--
-- Edit:      UPDATE public.support_kb_articles SET content = '...' WHERE id = '...';
-- Disable:   UPDATE public.support_kb_articles SET is_active = false WHERE id = '...';
