import { NextRequest, NextResponse } from 'next/server'
import { requireFeature } from '@/lib/entitlements-server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAuth } from '@/lib/api-auth'
import { startChain, loadTrails, loadMember, myAction } from '@/lib/approval-chain'
import { requisitionAmounts, applyRequisitionApproval } from '@/lib/requisition-fulfilment'

const REQ_SELECT = `
  id, req_number, type, status, job_reference, job_code, notes, reject_reason, required_by,
  approved_at, fulfilled_at, created_at, current_approver_id,
  location:locations(id, name, code),
  cost_center:cost_centers(id, code, name),
  requested_by:user_profiles!requested_by(id, full_name, role, job_title),
  approved_by:user_profiles!approved_by(id, full_name, job_title),
  items:requisition_items(
    id, item_type, quantity, unit_cost, notes, returned_at,
    asset:fixed_assets(id, asset_tag, name, status),
    product:products(id, name, sku, unit_of_measure)
  )
`

const CAN_SEE_ALL_ROLES = new Set(['owner', 'admin', 'operations', 'procurement', 'finance'])

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const gate = await requireFeature(auth.orgId, 'approvals')
  if (gate) return gate

  const { searchParams } = req.nextUrl
  const status = searchParams.get('status')
  const type   = searchParams.get('type')
  const mine   = searchParams.get('mine') === 'true'
  const awaitingMe = searchParams.get('awaiting') === 'me'

  const supabase = createServiceClient()
  let query = supabase
    .from('requisitions')
    .select(REQ_SELECT)
    .eq('org_id', auth.orgId)
    .order('created_at', { ascending: false })

  if (awaitingMe) {
    query = query.eq('current_approver_id', auth.userId)
  } else if (mine) {
    query = query.eq('requested_by', auth.userId)
  } else if (!CAN_SEE_ALL_ROLES.has(auth.role)) {
    // Staff see their own requests plus anything routed to them for approval.
    query = query.or(`requested_by.eq.${auth.userId},current_approver_id.eq.${auth.userId}`)
  }

  if (status) query = query.eq('status', status)
  if (type)   query = query.eq('type',   type)

  const { data, error } = await query
  if (error) {
    console.error('[GET /api/requisitions]', error)
    return NextResponse.json({ error: 'Failed to fetch requisitions' }, { status: 500 })
  }
  const rows    = (data ?? []) as any[]
  const amounts = await requisitionAmounts(supabase, auth.orgId, rows)
  const trails  = await loadTrails(supabase, auth.orgId, 'requisition', rows.map(r => r.id))
  const viewer  = await loadMember(supabase, auth.orgId, auth.userId)
  return NextResponse.json({
    data: rows.map(r => {
      const amount = amounts.get(r.id) ?? 0
      const trail  = trails.get(r.id) ?? []
      return {
        ...r, amount, approval_trail: trail,
        my_action: r.status === 'pending'
          ? myAction({ trail, viewer, viewerRole: auth.role, docType: 'requisition', amount, submitterId: r.requested_by?.id ?? null })
          : null,
      }
    }),
  })
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const gate = await requireFeature(auth.orgId, 'approvals')
  if (gate) return gate

  let body: any
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { type, job_reference, job_code, notes, required_by, location_id, cost_center_id, items } = body

  if (!type || !['checkout', 'new_asset', 'inventory'].includes(type)) {
    return NextResponse.json(
      { error: 'type must be one of: checkout, new_asset, inventory' },
      { status: 400 }
    )
  }
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: 'At least one item is required' }, { status: 400 })
  }
  if (!cost_center_id) {
    return NextResponse.json({ error: 'A cost center is required' }, { status: 400 })
  }
  if (!job_code || !String(job_code).trim()) {
    return NextResponse.json({ error: 'A job code is required' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // H-3: Atomic DB sequence prevents duplicate requisition numbers under concurrency
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const { data: seqVal, error: seqErr } = await supabase
    .rpc('next_ref_number', { p_seq: 'public.requisition_seq' })
  if (seqErr || seqVal == null) {
    console.error('[POST /api/requisitions] sequence', seqErr?.message)
    return NextResponse.json({ error: 'Failed to generate requisition number' }, { status: 500 })
  }
  const req_number = `REQ-${datePart}-${String(seqVal).padStart(4, '0')}`

  const insert: Record<string, any> = {
    org_id: auth.orgId,
    req_number,
    type,
    requested_by: auth.userId,
    status: 'pending',
  }
  if (job_reference)  insert.job_reference  = job_reference
  if (job_code)       insert.job_code       = job_code
  if (notes)          insert.notes          = notes
  if (required_by)    insert.required_by    = required_by
  if (location_id)    insert.location_id    = location_id
  if (cost_center_id) insert.cost_center_id = cost_center_id

  const { data: reqRow, error: reqErr } = await supabase
    .from('requisitions')
    .insert(insert)
    .select('id, req_number')
    .single()

  if (reqErr) {
    console.error('[POST /api/requisitions] insert', reqErr)
    return NextResponse.json({ error: 'Failed to create requisition' }, { status: 500 })
  }

  const lineItems = (items as any[]).map(item => ({
    org_id:         auth.orgId,
    requisition_id: reqRow.id,
    item_type:  item.item_type,
    asset_id:   item.asset_id   ?? null,
    product_id: item.product_id ?? null,
    quantity:   item.quantity   ?? 1,
    unit_cost:  item.unit_cost  ?? null,
    notes:      item.notes      ?? null,
  }))

  const { error: itemErr } = await supabase.from('requisition_items').insert(lineItems)
  if (itemErr) {
    console.error('[POST /api/requisitions] items', itemErr)
    await supabase.from('requisitions').delete().eq('id', reqRow.id)
    return NextResponse.json({ error: 'Failed to save requisition items' }, { status: 500 })
  }

  // Route it up the requester's reporting line. An owner's own request is
  // approved (and issued) straight away — there is no one above them.
  const { data: full } = await supabase
    .from('requisitions').select('*, items:requisition_items(*)').eq('id', reqRow.id).single()
  const amount = (await requisitionAmounts(supabase, auth.orgId, [full as any])).get(reqRow.id) ?? 0
  let approvalMessage: string = ''
  try {
    const result = await startChain(supabase, {
      orgId: auth.orgId, docType: 'requisition', docId: reqRow.id, ref: req_number,
      submitterId: auth.userId, amount,
    })
    if (result.outcome === 'approved') {
      await applyRequisitionApproval(supabase, full, { orgId: auth.orgId, actorId: auth.userId })
      approvalMessage = 'Approved.'
    } else if (result.outcome === 'pending') {
      approvalMessage = `Sent to ${result.approver.name} for approval.`
    }
  } catch (e) {
    console.error('[POST /api/requisitions] approval routing', e)
    approvalMessage = 'Saved, but it could not be routed for approval — ask the owner to review it.'
  }

  const { data, error: fetchErr } = await supabase
    .from('requisitions')
    .select(REQ_SELECT)
    .eq('id', reqRow.id)
    .single()

  if (fetchErr) {
    return NextResponse.json({ data: { id: reqRow.id, req_number: reqRow.req_number }, message: approvalMessage }, { status: 201 })
  }
  return NextResponse.json({ data, message: approvalMessage }, { status: 201 })
}
