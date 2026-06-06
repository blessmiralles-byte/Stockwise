import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAuth } from '@/lib/api-auth'

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const { searchParams } = req.nextUrl
  const status   = searchParams.get('status')
  const assetId  = searchParams.get('asset_id')

  const supabase = createServiceClient()

  let query = supabase
    .from('maintenance_schedules')
    .select(`
      id, title, description, scheduled_date, completed_date,
      status, notify_days_before, cost, performed_by, notes, created_at,
      asset:fixed_assets(id, asset_tag, name, status)
    `)
    .eq('org_id', auth.orgId)
    .order('scheduled_date', { ascending: true })

  if (status)  query = query.eq('status', status)
  if (assetId) query = query.eq('asset_id', assetId)

  const { data, error } = await query
  if (error) {
    console.error('[GET /api/maintenance]', error)
    return NextResponse.json({ error: 'Failed to fetch maintenance schedules' }, { status: 500 })
  }

  return NextResponse.json({ data: data ?? [], count: data?.length ?? 0 })
}

// POST /api/maintenance — log a new issue or schedule (any authenticated user can report)
export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  let body: any
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { asset_id, title, description, scheduled_date, notify_days_before, status } = body

  if (!asset_id)  return NextResponse.json({ error: 'asset_id is required' }, { status: 400 })
  if (!title?.trim()) return NextResponse.json({ error: 'title is required' }, { status: 400 })

  const supabase = createServiceClient()

  // When a field worker reports an issue, also set the asset to "maintenance" status
  const reportedAsIssue = status === 'overdue' || (!scheduled_date)
  if (reportedAsIssue) {
    await supabase
      .from('fixed_assets')
      .update({ status: 'maintenance' })
      .eq('id', asset_id)
  }

  const { data, error } = await supabase
    .from('maintenance_schedules')
    .insert({
      org_id: auth.orgId,
      asset_id,
      title: title.trim(),
      description: description?.trim() || null,
      scheduled_date: scheduled_date || new Date().toISOString().split('T')[0],
      status: status ?? (scheduled_date ? 'scheduled' : 'overdue'),
      notify_days_before: notify_days_before ?? 1,
      reported_by: auth.userId,
    })
    .select(`
      id, title, description, scheduled_date, status,
      asset:fixed_assets(id, asset_tag, name)
    `)
    .single()

  if (error) {
    console.error('[POST /api/maintenance]', error)
    return NextResponse.json({ error: 'Failed to create maintenance record' }, { status: 500 })
  }

  return NextResponse.json({ data }, { status: 201 })
}
