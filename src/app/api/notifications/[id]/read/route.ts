import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAuth } from '@/lib/api-auth'

/** POST /api/notifications/:id/read — mark a single notification as read */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const { id } = await params
  const supabase = createServiceClient()

  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', auth.userId)   // users can only mark their own

  if (error) return NextResponse.json({ error: 'Failed to mark as read' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
