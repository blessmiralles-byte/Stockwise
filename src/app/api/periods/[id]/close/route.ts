import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAnyRole } from '@/lib/api-auth'
import { logAudit } from '@/lib/audit'

/**
 * POST /api/periods/:id/close
 * Locks the accounting period — no further inventory transactions may be posted
 * against dates within this period.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAnyRole('owner', 'finance')
  if (auth.error) return auth.error

  const { id } = await params
  let body: any = {}
  try { body = await req.json() } catch { /* notes optional */ }

  const supabase = createServiceClient()

  const { data: period, error: fetchErr } = await supabase
    .from('accounting_periods')
    .select('id, name, status, period_start, period_end')
    .eq('id', id)
    .eq('org_id', auth.orgId)
    .single()

  if (fetchErr || !period) {
    return NextResponse.json({ error: 'Period not found' }, { status: 404 })
  }
  if (period.status === 'closed') {
    return NextResponse.json({ error: 'Period is already closed' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('accounting_periods')
    .update({
      status:    'closed',
      closed_by: auth.userId,
      closed_at: new Date().toISOString(),
      notes:     body.notes?.trim() ?? null,
    })
    .eq('id', id)
    .select('id, name, period_start, period_end, status, closed_at')
    .single()

  if (error) {
    return NextResponse.json({ error: 'Failed to close period' }, { status: 500 })
  }

  await logAudit({
    actorId:   auth.userId,
    orgId:     auth.orgId,
    action:    'period.close',
    tableName: 'accounting_periods',
    recordId:  id,
    newValue:  { name: period.name, period_start: period.period_start, period_end: period.period_end, closed_at: data.closed_at },
  })

  return NextResponse.json({ data })
}
