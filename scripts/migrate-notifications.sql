-- ============================================================
-- StockWise — In-App Notifications
-- Run in Supabase SQL Editor.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.notifications (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  type        text        NOT NULL,   -- e.g. 'requisition.approved', 'stock.low', 'maintenance.overdue'
  title       text        NOT NULL,
  body        text,
  data        jsonb,                  -- arbitrary context: { req_id, asset_id, ... }
  action_url  text,                   -- where to navigate on click
  read_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notif_user_unread
  ON public.notifications (user_id, created_at DESC)
  WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_notif_user_all
  ON public.notifications (user_id, created_at DESC);

-- RLS: each user sees only their own notifications
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notif_select" ON public.notifications;
DROP POLICY IF EXISTS "notif_update" ON public.notifications;

CREATE POLICY "notif_select" ON public.notifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Users can mark their own notifications as read (update read_at only)
CREATE POLICY "notif_update" ON public.notifications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

-- Done.
SELECT 'notifications table created' AS status;
