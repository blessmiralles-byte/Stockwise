-- ============================================================
-- StockWise — Location hierarchy migration
-- Run in Supabase SQL Editor
-- ============================================================

-- Widen the type check constraint to include room and shelf
-- (original constraint only allowed: warehouse, office, store, other)
ALTER TABLE public.locations DROP CONSTRAINT IF EXISTS locations_type_check;
ALTER TABLE public.locations ADD CONSTRAINT locations_type_check
  CHECK (type IN ('warehouse', 'office', 'store', 'room', 'shelf', 'other'));

-- Add parent_id and level to locations
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.locations(id);
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS level smallint DEFAULT 1;

-- Mark existing top-level locations as level 1
UPDATE public.locations SET level = 1 WHERE parent_id IS NULL;

-- ── Insert Room-level locations (level 2) ─────────────────
-- You can add more after running the seed
WITH parents AS (
  SELECT id, code FROM public.locations WHERE level = 1
)
INSERT INTO public.locations (name, code, type, level, parent_id, is_active)
SELECT sub.name, sub.code, 'room', 2, p.id, true
FROM (VALUES
  ('WH-MAIN',    'Admin Office',         'WH-MAIN-ADMIN'),
  ('WH-MAIN',    'Receiving Bay',        'WH-MAIN-RECV'),
  ('WH-MAIN',    'Bulk Storage',         'WH-MAIN-BULK'),
  ('OFF-HEAD',   'Admin Room',           'OFF-HEAD-ADMIN'),
  ('OFF-HEAD',   'Conference Room',      'OFF-HEAD-CONF'),
  ('OFF-HEAD',   'Server Room',          'OFF-HEAD-SRV'),
  ('STR-RETAIL', 'Sales Floor',          'STR-RETAIL-FLOOR'),
  ('STR-RETAIL', 'Back Office',          'STR-RETAIL-BACK'),
  ('OFF-BRANCH', 'Open Work Area',       'OFF-BRANCH-OPEN'),
  ('OFF-BRANCH', 'Storage Closet',       'OFF-BRANCH-STOR')
) AS sub(parent_code, name, code)
JOIN parents p ON p.code = sub.parent_code
ON CONFLICT (code) DO NOTHING;

-- ── Insert Shelf-level locations (level 3) ────────────────
WITH rooms AS (
  SELECT id, code FROM public.locations WHERE level = 2
)
INSERT INTO public.locations (name, code, type, level, parent_id, is_active)
SELECT sub.name, sub.code, 'shelf', 3, r.id, true
FROM (VALUES
  ('WH-MAIN-BULK',  'Shelf A',   'WH-MAIN-BULK-A'),
  ('WH-MAIN-BULK',  'Shelf B',   'WH-MAIN-BULK-B'),
  ('WH-MAIN-BULK',  'Shelf C',   'WH-MAIN-BULK-C'),
  ('WH-MAIN-RECV',  'Bay 1',     'WH-MAIN-RECV-1'),
  ('WH-MAIN-RECV',  'Bay 2',     'WH-MAIN-RECV-2'),
  ('OFF-HEAD-ADMIN','Cabinet 1', 'OFF-HEAD-ADMIN-C1'),
  ('OFF-HEAD-ADMIN','Cabinet 2', 'OFF-HEAD-ADMIN-C2'),
  ('STR-RETAIL-FLOOR','Rack 1',  'STR-RETAIL-FLOOR-R1'),
  ('STR-RETAIL-FLOOR','Rack 2',  'STR-RETAIL-FLOOR-R2'),
  ('OFF-BRANCH-STOR','Shelf 1',  'OFF-BRANCH-STOR-S1'),
  ('OFF-BRANCH-STOR','Shelf 2',  'OFF-BRANCH-STOR-S2')
) AS sub(parent_code, name, code)
JOIN rooms r ON r.code = sub.parent_code
ON CONFLICT (code) DO NOTHING;
