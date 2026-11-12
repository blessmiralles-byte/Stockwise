import { NextRequest, NextResponse } from 'next/server'
import { isReadOnly } from '@/lib/permissions'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAuth } from '@/lib/api-auth'
import { createNotification } from '@/lib/notify'
import { normaliseCondition } from '@/lib/tool-returns'

/**
 * POST /api/assets/:id/checkin
 * Body: { returned_to_location_id?, notes?, return_condition?: 'good' | 'damaged', return_note? }
 *
 * Return a checked-out tool: closes the active checkout and frees the tool.
 * Optionally records which location (e.g. a van or the warehouse) it came back to.
 *
 * The return is the one moment somebody is holding the tool and knows what
 * state it's in. A damaged return goes into the incident register and the tool
 * goes to maintenance instead of back on the shelf, so the next person isn't
 * handed a broken grinder.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  if (isReadOnly(auth.role)) return NextResponse.json({ error: 'Your role is view-only.' }, { status: 403 })

  const { id } = await params
  let body: any
  try { body = await req.json() } catch { body = {} }

  const supabase = createServiceClient()

  const { data: asset } = await supabase
    .from('fixed_assets')
    .select('id, name, asset_tag, current_checkout_id, checked_out_to, current_value')
    .eq('id', id)
    .eq('org_id', auth.orgId)
    .single()

  if (!asset) return NextResponse.json({ error: 'Asset not found' }, { status: 404 })
  if (!asset.current_checkout_id) {
    return NextResponse.json({ error: 'This tool is not currently checked out' }, { status: 400 })
  }

  const now = new Date().toISOString()
  const returnedTo = body.returned_to_location_id || null
  const condition  = normaliseCondition(body.return_condition)
  const returnNote = String(body.return_note ?? '').trim() || null

  if (condition === 'damaged' && !returnNote) {
    return NextResponse.json({ error: 'Say briefly what is wrong with it, so whoever fixes it knows.' }, { status: 422 })
  }

  // Close the active checkout (whether it was 'out' or a still-'pending' request)
  const { error: closeErr } = await supabase
    .from('asset_checkouts')
    .update({
      status:      'returned',
      returned_at: now,
      returned_by: auth.userId,
      returned_to_location_id: returnedTo,
      return_condition: condition,
      return_note:      returnNote,
      notes:       body.notes?.trim() || undefined,
    })
    .eq('id', asset.current_checkout_id)
    .eq('org_id', auth.orgId)

  if (closeErr) {
    console.error('[assets checkin]', closeErr)
    return NextResponse.json({ error: 'Failed to check the tool in' }, { status: 500 })
  }

  // Free the tool; optionally move it to the location it was returned to
  const assetUpdate: Record<string, any> = {
    current_checkout_id: null,
    checked_out_to:  null,
    checked_out_job: null,
    checkout_due_at: null,
  }
  if (returnedTo) assetUpdate.location_id = returnedTo
  // Damaged: off the road until someone has looked at it.
  if (condition === 'damaged') assetUpdate.status = 'maintenance'

  await supabase.from('fixed_assets').update(assetUpdate).eq('id', id).eq('org_id', auth.orgId)

  if (condition === 'damaged') {
    const { data: incident } = await supabase
      .from('asset_incidents')
      .insert({
        org_id:         auth.orgId,
        asset_id:       id,
        checkout_id:    asset.current_checkout_id,
        kind:           'damaged',
        occurred_on:    now.slice(0, 10),
        description:    returnNote,
        held_by:        asset.checked_out_to ?? null,
        estimated_loss: null,   // repair cost isn't known at the tool room door
        reported_by:    auth.userId,
      })
      .select('id')
      .maybeSingle()

    const { data: managers } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('org_id', auth.orgId)
      .in('role', ['owner', 'admin', 'operations', 'manager'])
      .neq('is_active', false)
    const ids = (managers ?? []).map((m: any) => m.id).filter((uid: string) => uid !== auth.userId)
    if (ids.length) {
      await createNotification({
        userId: ids,
        orgId:  auth.orgId,
        type:   'asset.incident',
        title:  `${asset.asset_tag ? asset.asset_tag + ' — ' : ''}${asset.name} came back damaged`,
        body:   [asset.checked_out_to && `Was with ${asset.checked_out_to}`, returnNote].filter(Boolean).join(' · '),
        data:   { asset_id: id, incident_id: (incident as any)?.id, kind: 'damaged' },
        actionUrl: '/reports/tool-compliance',
      })
    }
  }

  return NextResponse.json({ data: { checked_in: true, condition } })
}
