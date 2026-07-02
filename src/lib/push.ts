import { createServiceClient } from '@/lib/supabase/service'

/**
 * Expo push delivery.
 *
 * Sends a notification to a user's registered devices via Expo's push service.
 * Tokens live in expo_push_tokens (written by the mobile app on login).
 * Failures are swallowed — a push failure must never break the primary flow.
 */
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'

export interface PushMessage {
  title: string
  body: string
  data?: Record<string, unknown>
}

/** Send a push to every device registered to the given user(s). */
export async function sendPushToUsers(
  userIds: string | string[],
  message: PushMessage,
): Promise<void> {
  try {
    const ids = (Array.isArray(userIds) ? userIds : [userIds]).filter(Boolean)
    if (ids.length === 0) return

    const supabase = createServiceClient()
    const { data: tokens } = await supabase
      .from('expo_push_tokens')
      .select('token')
      .in('user_id', ids)

    const to = (tokens ?? []).map((t: any) => t.token).filter(Boolean)
    if (to.length === 0) return

    // Expo accepts an array of messages; one per token
    const messages = to.map(token => ({
      to: token,
      sound: 'default',
      title: message.title,
      body: message.body,
      data: message.data ?? {},
    }))

    await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Accept-encoding': 'gzip, deflate',
      },
      body: JSON.stringify(messages),
    })
  } catch (err) {
    console.error('[push] Failed to send Expo push:', (err as Error).message)
  }
}
