import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAuth } from '@/lib/api-auth'
import { createNotification } from '@/lib/notify'

/**
 * POST /api/stock-counts/:id/confirm
 * Body: { status: 'confirmed' | 'disputed', note?: string }
 *
 * The calling user attests (from their mobile app or the web) that the counted
 * quantities match — or disputes them. Only listed attendee-users may confirm.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const { id } = await params
  let body: any
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const status = body.status
  if (!['confirmed', 'disputed'].includes(status)) {
    return NextResponse.json({ error: "status must be 'confirmed' or 'disputed'" }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Must be a listed attendee-user on this count
  const { data: attendee } = await supabase
    .from('stock_count_attendees')
    .select('id')
    .eq('stock_count_id', id)
    .eq('user_id', auth.userId)
    .maybeSingle()

  if (!attendee) {
    return NextResponse.json({ error: 'You are not a listed attendee on this count' }, { status: 403 })
  }

  const { error } = await supabase
    .from('stock_count_attendees')
    .update({
      confirmation_status: status,
      confirmed_at: new Date().toISOString(),
      note: body.note?.trim() || null,
    })
    .eq('id', attendee.id)

  if (error) {
    console.error('[POST /api/stock-counts/:id/confirm]', error)
    return NextResponse.json({ error: 'Failed to record confirmation' }, { status: 500 })
  }

  // Notify the count's creator so they can see attestations / disputes roll in
  const { data: sc } = await supabase
    .from('stock_counts')
    .select('count_number, created_by, org_id')
    .eq('id', id)
    .single()

  if (sc?.created_by && sc.created_by !== auth.userId) {
    await createNotification({
      userId: sc.created_by,
      orgId: sc.org_id ?? auth.orgId,
      type: `stock_count.${status}`,
      title: status === 'confirmed'
        ? `Count ${sc.count_number} confirmed`
        : `Count ${sc.count_number} disputed`,
      body: status === 'disputed' && body.note ? `Reason: ${body.note}` : undefined,
      data: { stock_count_id: id },
      actionUrl: `/stock-counts/${id}`,
    })
  }

  return NextResponse.json({ data: { status } })
}
