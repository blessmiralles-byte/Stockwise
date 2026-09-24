import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAuth, requireAnyRole } from '@/lib/api-auth'
import { logAudit } from '@/lib/audit'
import { createNotification } from '@/lib/notify'

/**
 * Lost, stolen and damaged tools.
 *
 * GET  /api/assets/incidents?status=open   — the register of incidents
 * POST /api/assets/incidents               — report one (any signed-in user:
 *                                            the person who lost it reports it)
 *
 * Reporting closes the tool's open check-out and marks the asset lost or
 * stolen, so it stops appearing as available. Owners and admins are notified.
 * Damaged tools stay usable-but-flagged: they go to 'maintenance', not missing.
 */

const SELECT = `
  id, kind, status, occurred_on, last_seen, description, police_report_no,
  held_by, estimated_loss, resolution_note, created_at, resolved_at,
  asset:fixed_assets(id, asset_tag, name, status, purchase_cost, current_value),
  reporter:user_profiles!reported_by(id, full_name, email),
  resolver:user_profiles!resolved_by(id, full_name, email)
`

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const status  = req.nextUrl.searchParams.get('status')
  const assetId = req.nextUrl.searchParams.get('asset_id')

  const supabase = createServiceClient()
  let query = supabase
    .from('asset_incidents')
    .select(SELECT)
    .eq('org_id', auth.orgId)
    .order('occurred_on', { ascending: false })

  if (status)  query = query.eq('status', status)
  if (assetId) query = query.eq('asset_id', assetId)

  const { data, error } = await query
  if (error) {
    console.error('[GET /api/assets/incidents]', error)
    return NextResponse.json({ error: error.message ?? 'Failed to load incidents' }, { status: 500 })
  }
  return NextResponse.json({ data: data ?? [] })
}

const KINDS = ['lost', 'stolen', 'damaged'] as const

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  let body: any
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { asset_id, kind, occurred_on, last_seen, description, police_report_no, estimated_loss } = body
  if (!asset_id) return NextResponse.json({ error: 'asset_id is required' }, { status: 400 })
  if (!KINDS.includes(kind)) {
    return NextResponse.json({ error: `kind must be one of: ${KINDS.join(', ')}` }, { status: 422 })
  }

  const supabase = createServiceClient()

  const { data: asset } = await supabase
    .from('fixed_assets')
    .select('id, name, asset_tag, status, current_checkout_id, checked_out_to, current_value')
    .eq('id', asset_id)
    .eq('org_id', auth.orgId)
    .maybeSingle()
  if (!asset) return NextResponse.json({ error: 'Asset not found' }, { status: 404 })
  if (['disposed', 'sold', 'retired'].includes(asset.status)) {
    return NextResponse.json({ error: `This asset is ${asset.status} — nothing to report against it` }, { status: 400 })
  }

  const { data: incident, error } = await supabase
    .from('asset_incidents')
    .insert({
      org_id:           auth.orgId,
      asset_id,
      checkout_id:      asset.current_checkout_id ?? null,
      kind,
      occurred_on:      occurred_on || new Date().toISOString().slice(0, 10),
      last_seen:        last_seen?.trim() || null,
      description:      description?.trim() || null,
      police_report_no: police_report_no?.trim() || null,
      held_by:          asset.checked_out_to ?? null,
      estimated_loss:   estimated_loss != null && estimated_loss !== ''
        ? Number(estimated_loss)
        : (asset.current_value ?? null),
      reported_by:      auth.userId,
    })
    .select(SELECT)
    .single()

  if (error) {
    console.error('[POST /api/assets/incidents]', error)
    return NextResponse.json({ error: error.message ?? 'Failed to record the report' }, { status: 500 })
  }

  // A missing tool is no longer in anyone's custody; a damaged one is off the
  // road until it's looked at. Either way it stops showing as available.
  const newStatus = kind === 'damaged' ? 'maintenance' : kind
  await supabase
    .from('fixed_assets')
    .update({
      status: newStatus,
      current_checkout_id: null,
      checked_out_to: null, checked_out_job: null, checkout_due_at: null,
    })
    .eq('id', asset_id)
    .eq('org_id', auth.orgId)

  if (asset.current_checkout_id) {
    await supabase
      .from('asset_checkouts')
      .update({ status: 'returned', returned_at: new Date().toISOString(), notes: `Reported ${kind}` })
      .eq('id', asset.current_checkout_id)
      .eq('org_id', auth.orgId)
  }

  const { data: managers } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('org_id', auth.orgId)
    .in('role', ['owner', 'admin'])
    .neq('is_active', false)
  if (managers?.length) {
    await createNotification({
      userId: managers.map(m => m.id),
      orgId:  auth.orgId,
      type:   'asset.incident',
      title:  `${asset.asset_tag ? asset.asset_tag + ' — ' : ''}${asset.name} reported ${kind}`,
      body:   [asset.checked_out_to && `Was with ${asset.checked_out_to}`, description?.trim()].filter(Boolean).join(' · ') || undefined,
      data:   { asset_id, incident_id: (incident as any).id, kind },
      actionUrl: '/reports/tool-incidents',
    })
  }

  await logAudit({
    actorId: auth.userId, orgId: auth.orgId, action: 'asset.value_change',
    tableName: 'asset_incidents', recordId: (incident as any).id,
    newValue: { kind, asset_id, asset: asset.name },
  })

  return NextResponse.json({ data: incident, message: `Reported ${kind}. Owners have been notified.` }, { status: 201 })
}

/**
 * PATCH /api/assets/incidents — close one out (owner / operations).
 * Body: { id, status: 'recovered' | 'written_off', resolution_note? }
 *
 * Recovered puts the tool back in service; written off leaves it out of
 * service for the owner to dispose of through the asset's own disposal flow,
 * which is what posts the accounting entries.
 */
export async function PATCH(req: NextRequest) {
  const auth = await requireAnyRole('owner', 'operations')
  if (auth.error) return auth.error

  let body: any
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { id, status, resolution_note } = body
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  if (!['recovered', 'written_off'].includes(status)) {
    return NextResponse.json({ error: 'status must be recovered or written_off' }, { status: 422 })
  }

  const supabase = createServiceClient()
  const { data: incident } = await supabase
    .from('asset_incidents')
    .select('id, asset_id, status')
    .eq('id', id)
    .eq('org_id', auth.orgId)
    .maybeSingle()
  if (!incident) return NextResponse.json({ error: 'Report not found' }, { status: 404 })
  if (incident.status !== 'open') {
    return NextResponse.json({ error: 'This report is already closed' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('asset_incidents')
    .update({
      status,
      resolution_note: resolution_note?.trim() || null,
      resolved_by: auth.userId,
      resolved_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('org_id', auth.orgId)
    .select(SELECT)
    .single()

  if (error) {
    console.error('[PATCH /api/assets/incidents]', error)
    return NextResponse.json({ error: error.message ?? 'Failed to update the report' }, { status: 500 })
  }

  if (status === 'recovered') {
    await supabase
      .from('fixed_assets')
      .update({ status: 'active' })
      .eq('id', incident.asset_id)
      .eq('org_id', auth.orgId)
      .in('status', ['lost', 'stolen', 'maintenance'])
  }

  return NextResponse.json({
    data,
    message: status === 'recovered'
      ? 'Marked recovered — the tool is back in service.'
      : 'Written off. Dispose of the asset from its record to post the accounting entries.',
  })
}
