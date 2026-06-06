/**
 * createNotification — insert an in-app notification for one or more users.
 * Uses the service client so it bypasses RLS (called from API routes).
 * Errors are swallowed so notification failures never break the primary flow.
 */
import { createServiceClient } from '@/lib/supabase/service'

export interface NotificationPayload {
  userId:     string | string[]   // one or many recipients
  orgId?:     string
  type:       string
  title:      string
  body?:      string
  data?:      Record<string, unknown>
  actionUrl?: string
}

export async function createNotification(payload: NotificationPayload): Promise<void> {
  try {
    const supabase   = createServiceClient()
    const userIds    = Array.isArray(payload.userId) ? payload.userId : [payload.userId]

    const rows = userIds.map(uid => ({
      user_id:    uid,
      org_id:     payload.orgId     ?? null,
      type:       payload.type,
      title:      payload.title,
      body:       payload.body       ?? null,
      data:       payload.data       ?? null,
      action_url: payload.actionUrl  ?? null,
    }))

    await supabase.from('notifications').insert(rows)
  } catch (err) {
    console.error('[notify] Failed to create notification:', (err as Error).message)
  }
}
