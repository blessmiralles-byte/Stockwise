import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAuth } from '@/lib/api-auth'

/** GET /api/notifications — fetch the current user's notifications */
export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const { searchParams } = req.nextUrl
  const unreadOnly = searchParams.get('unread') === 'true'
  const limit      = Math.min(Number(searchParams.get('limit') ?? '50'), 100)

  const supabase = createServiceClient()
  let query = supabase
    .from('notifications')
    .select('id, type, title, body, data, action_url, read_at, created_at')
    .eq('user_id', auth.userId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (unreadOnly) query = query.is('read_at', null)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 })

  const unreadCount = unreadOnly
    ? (data ?? []).length
    : (data ?? []).filter((n: any) => !n.read_at).length

  return NextResponse.json({ data: data ?? [], unread_count: unreadCount })
}

/** PATCH /api/notifications — mark all as read */
export async function PATCH(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', auth.userId)
    .is('read_at', null)

  if (error) return NextResponse.json({ error: 'Failed to mark notifications as read' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
