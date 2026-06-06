import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAuth, requireAnyRole } from '@/lib/api-auth'

/** GET /api/periods */
export async function GET(_req: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('accounting_periods')
    .select(`
      id, name, period_start, period_end, status, closed_at, notes, created_at,
      closed_by:user_profiles!closed_by(id, full_name),
      created_by:user_profiles!created_by(id, full_name)
    `)
    .eq('org_id', auth.orgId)
    .order('period_start', { ascending: false })

  if (error) return NextResponse.json({ error: 'Failed to fetch periods' }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}

/** POST /api/periods — finance / owner only */
export async function POST(req: NextRequest) {
  const auth = await requireAnyRole('owner', 'finance')
  if (auth.error) return auth.error

  let body: any
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { name, period_start, period_end, notes } = body
  if (!name?.trim() || !period_start || !period_end) {
    return NextResponse.json({ error: 'name, period_start, and period_end are required' }, { status: 400 })
  }

  if (new Date(period_start) > new Date(period_end)) {
    return NextResponse.json({ error: 'period_start must be before period_end' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('accounting_periods')
    .insert({
      org_id: auth.orgId,
      name: name.trim(),
      period_start,
      period_end,
      notes: notes?.trim() ?? null,
      created_by: auth.userId,
    })
    .select('id, name, period_start, period_end, status, notes, created_at')
    .single()

  if (error) {
    // Overlap exclusion constraint
    if (error.code === '23P01' || error.message?.includes('overlap')) {
      return NextResponse.json({ error: 'This period overlaps with an existing accounting period' }, { status: 409 })
    }
    console.error('[POST /api/periods]', error)
    return NextResponse.json({ error: 'Failed to create period' }, { status: 500 })
  }
  return NextResponse.json({ data }, { status: 201 })
}
