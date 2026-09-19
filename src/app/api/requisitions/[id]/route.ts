import { NextRequest, NextResponse } from 'next/server'
import { requireFeature } from '@/lib/entitlements-server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAuth } from '@/lib/api-auth'
import { createNotification } from '@/lib/notify'
import {
  startChain, actOnChain, ChainError, loadTrails, loadMember, myAction,
} from '@/lib/approval-chain'
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

const SEE_ALL = ['owner', 'admin', 'operations', 'procurement', 'finance', 'manager']

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const gate = await requireFeature(auth.orgId, 'approvals')
  if (gate) return gate

  const { id } = await params
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('requisitions')
    .select(REQ_SELECT)
    .eq('id', id)
    .eq('org_id', auth.orgId)
    .single()

  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const trails = await loadTrails(supabase, auth.orgId, 'requisition', [id])
  const trail  = trails.get(id) ?? []

  // Visible to the requester, anyone in its approval chain, and managers.
  const inChain = trail.some(s => s.approver?.id === auth.userId || s.acted_by?.id === auth.userId)
  if (!SEE_ALL.includes(auth.role) && (data as any).requested_by?.id !== auth.userId && !inChain) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const amount = (await requisitionAmounts(supabase, auth.orgId, [data as any])).get(id) ?? 0
  const viewer = await loadMember(supabase, auth.orgId, auth.userId)
  return NextResponse.json({
    data: {
      ...data, amount, approval_trail: trail,
      my_action: myAction({
        trail, viewer, viewerRole: auth.role, docType: 'requisition', amount,
        submitterId: (data as any).requested_by?.id ?? null,
      }),
    },
  })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const gate = await requireFeature(auth.orgId, 'approvals')
  if (gate) return gate

  const { id } = await params
  let body: any
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { action, reject_reason } = body
  const supabase = createServiceClient()

  const { data: r, error: fetchErr } = await supabase
    .from('requisitions')
    .select('*, items:requisition_items(*)')
    .eq('id', id)
    .eq('org_id', auth.orgId)
    .single()

  if (fetchErr || !r) {
    return NextResponse.json({ error: 'Requisition not found' }, { status: 404 })
  }

  const now = new Date().toISOString()
  let warnings: string[] = []
  let message: string | undefined

  switch (action) {

    // ── Approve / endorse, or reject — routed through the reporting line ─────
    case 'approve':
    case 'reject': {
      if (r.status !== 'pending') {
        return NextResponse.json({ error: 'Only pending requisitions can be approved or rejected' }, { status: 400 })
      }
      const amount = (await requisitionAmounts(supabase, auth.orgId, [r])).get(id) ?? 0

      // Requisitions raised before the approval chain existed have no steps
      // yet — route them now so they follow the same rules.
      const { count } = await supabase.from('approval_steps').select('id', { count: 'exact', head: true })
        .eq('doc_type', 'requisition').eq('doc_id', id)
      if (!count) {
        await startChain(supabase, {
          orgId: auth.orgId, docType: 'requisition', docId: id, ref: r.req_number,
          submitterId: r.requested_by, amount,
        })
      }

      try {
        const result = await actOnChain(supabase, {
          orgId: auth.orgId, docType: 'requisition', docId: id, ref: r.req_number,
          submitterId: r.requested_by, amount,
          actorId: auth.userId, actorRole: auth.role,
          action, note: action === 'reject' ? (reject_reason ?? null) : (body.note ?? null),
        })
        if (result.outcome === 'approved') {
          warnings = await applyRequisitionApproval(supabase, r, { orgId: auth.orgId, actorId: auth.userId })
          message = 'Approved.'
        } else if (result.outcome === 'rejected') {
          await supabase.from('requisitions')
            .update({ status: 'rejected', reject_reason: reject_reason ?? null })
            .eq('id', id)
          message = 'Rejected.'
        } else {
          message = `Endorsed — sent to ${result.approver.name} for approval.`
        }
      } catch (e) {
        if (e instanceof ChainError) return NextResponse.json({ error: e.message }, { status: e.status })
        throw e
      }
      break
    }

    // ── Return checked-out items ───────────────────────────────────────────────
    case 'return': {
      if (r.status !== 'checked_out') {
        return NextResponse.json({ error: 'Only checked-out requisitions can be returned' }, { status: 400 })
      }
      const isRequester = r.requested_by === auth.userId
      const isOps       = ['owner', 'admin', 'operations', 'manager'].includes(auth.role)
      if (!isRequester && !isOps) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 })
      }
      await supabase
        .from('requisitions')
        .update({ status: 'returned', fulfilled_at: now })
        .eq('id', id)
      break
    }

    // ── Fulfill (procurement marks new_asset request as acted on) ─────────────
    case 'fulfill': {
      const isProc = ['owner', 'admin', 'procurement'].includes(auth.role)
      if (!isProc) {
        return NextResponse.json({ error: 'Access denied. Procurement role required.' }, { status: 403 })
      }
      if (r.type !== 'new_asset' || r.status !== 'approved') {
        return NextResponse.json({ error: 'Only approved new_asset requisitions can be fulfilled' }, { status: 400 })
      }
      await supabase
        .from('requisitions')
        .update({ status: 'fulfilled', fulfilled_at: now })
        .eq('id', id)
      await createNotification({
        userId: r.requested_by, orgId: auth.orgId, type: 'requisition.fulfill',
        title: `Requisition ${r.req_number} fulfilled`, body: 'Procurement has acted on your request.',
        data: { req_id: id }, actionUrl: '/requisitions',
      })
      break
    }

    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
  }

  const { data: updated } = await supabase
    .from('requisitions')
    .select(REQ_SELECT)
    .eq('id', id)
    .single()

  return NextResponse.json({
    data: updated,
    message,
    warnings: warnings.length ? warnings : undefined,
  })
}
