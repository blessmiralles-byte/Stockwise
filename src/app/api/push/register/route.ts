import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAuth } from '@/lib/api-auth'

/**
 * POST /api/push/register
 * Body: { token: string }
 *
 * Called by the mobile app after obtaining an Expo push token so the server
 * can notify this user's device(s). Upserts the token for the current user.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  let body: any
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const token = String(body.token ?? '').trim()
  if (!token) {
    return NextResponse.json({ error: 'token is required' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('expo_push_tokens')
    .upsert(
      { user_id: auth.userId, token, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,token' },
    )

  if (error) {
    console.error('[POST /api/push/register]', error)
    return NextResponse.json({ error: 'Failed to register push token' }, { status: 500 })
  }

  return NextResponse.json({ data: { registered: true } })
}

/**
 * DELETE /api/push/register?token=...  — unregister a device (logout)
 */
export async function DELETE(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const token = req.nextUrl.searchParams.get('token')?.trim()
  if (!token) {
    return NextResponse.json({ error: 'token is required' }, { status: 400 })
  }

  const supabase = createServiceClient()
  await supabase
    .from('expo_push_tokens')
    .delete()
    .eq('user_id', auth.userId)
    .eq('token', token)

  return NextResponse.json({ data: { unregistered: true } })
}
