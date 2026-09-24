import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAuth, requireRole } from '@/lib/api-auth'
import { sumLineValue } from '@/lib/approvals'
import { orgHasFeature } from '@/lib/entitlements-server'
import {
  startChain, actOnChain, cancelChain, ChainError, loadTrails, loadMember, myAction,
} from '@/lib/approval-chain'

// GET /api/purchase-orders/:id
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const { id } = await params
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('purchase_orders')
    .select(`
      *,
      supplier:suppliers(*),
      submitter:user_profiles!submitted_by(id, full_name, email, job_title),
      requisition:requisitions!requisition_id(
        id, req_number, created_at,
        requested_by:user_profiles!requested_by(id, full_name, job_title),
        items:requisition_items(id, item_type, quantity, unit_cost, notes)
      ),
      lines:purchase_order_lines(
        *,
        product:products(id, sku, name, unit_of_measure, category:categories(name))
      )
    `)
    .eq('id', id)
    .eq('org_id', auth.orgId)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 })
  }

  const trail  = (await loadTrails(supabase, auth.orgId, 'purchase_order', [id])).get(id) ?? []
  const amount = sumLineValue((data as any).lines, 'quantity_ordered', 'unit_cost')
  const viewer = await loadMember(supabase, auth.orgId, auth.userId)
  const pending     = (data as any).status === 'pending_approval'
  const submitterId = (data as any).submitted_by ?? (data as any).created_by ?? null
  const my_action   = pending
    ? myAction({ trail, viewer, viewerRole: auth.role, docType: 'purchase_order', amount, submitterId })
    : null
  const can_withdraw = pending && submitterId === auth.userId

  return NextResponse.json({ data: { ...data, approval_trail: trail, my_action, can_withdraw } })
}

const CAN_SUBMIT = ['owner', 'admin', 'procurement']

// PATCH /api/purchase-orders/:id
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const { id } = await params
  const body = await req.json()

  const allowed = [
    'status', 'expected_date', 'notes', 'supplier_id',
    // AP invoice fields for three-way match
    'supplier_invoice_no', 'supplier_invoice_date', 'supplier_invoice_amount',
  ]
  const updates: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const supabase = createServiceClient()

  const { data: po } = await supabase
    .from('purchase_orders')
    .select('id, po_number, status, created_by, submitted_by, lines:purchase_order_lines(quantity_ordered, unit_cost)')
    .eq('id', id)
    .eq('org_id', auth.orgId)
    .single()
  if (!po) return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 })

  // ── Approval workflow (Pro): submit → reporting-line approvals → send ───────
  // Approvers can be any role (a finance director, say), so these moves are
  // authorised by the approval chain rather than by role level.
  const approvalsOn = await orgHasFeature(auth.orgId, 'approvals')
  const to = updates.status as string | undefined
  const from = po.status as string

  if (approvalsOn && to && Object.keys(updates).length === 1) {
    const amount = sumLineValue(po.lines as any[], 'quantity_ordered', 'unit_cost')
    const submitterId: string | null = (po as any).submitted_by ?? (po as any).created_by ?? null
    const chainArgs = { orgId: auth.orgId, docType: 'purchase_order' as const, docId: id, ref: po.po_number, amount }

    try {
      // Submit for approval
      if (from === 'draft' && to === 'pending_approval') {
        if (!CAN_SUBMIT.includes(auth.role)) {
          return NextResponse.json({ error: 'Only procurement can submit purchase orders for approval' }, { status: 403 })
        }
        const now = new Date().toISOString()
        const result = await startChain(supabase, { ...chainArgs, submitterId: auth.userId })
        const patch: Record<string, unknown> = { submitted_at: now, submitted_by: auth.userId }
        if (result.outcome === 'approved') {
          Object.assign(patch, { status: 'approved', approved_by: auth.userId, approved_at: now })
        } else {
          patch.status = 'pending_approval'
        }
        return respond(supabase, id, auth.orgId, patch,
          result.outcome === 'pending' ? `Sent to ${result.approver.name} for approval.` : 'Approved.')
      }

      if (from === 'pending_approval' && (to === 'approved' || to === 'draft')) {
        // The submitter pulling it back is a withdrawal, not a rejection.
        if (to === 'draft' && auth.userId === submitterId) {
          await cancelChain(supabase, 'purchase_order', id)
          return respond(supabase, id, auth.orgId, { status: 'draft' }, 'Withdrawn — back in draft.')
        }

        // POs submitted before the approval chain existed have no steps yet.
        const { count } = await supabase.from('approval_steps').select('id', { count: 'exact', head: true })
          .eq('doc_type', 'purchase_order').eq('doc_id', id)
        if (!count && submitterId) await startChain(supabase, { ...chainArgs, submitterId })

        const result = await actOnChain(supabase, {
          ...chainArgs, submitterId, actorId: auth.userId, actorRole: auth.role,
          action: to === 'approved' ? 'approve' : 'reject',
          note: body.note ?? body.reject_reason ?? null,
        })
        if (result.outcome === 'approved') {
          return respond(supabase, id, auth.orgId,
            { status: 'approved', approved_by: auth.userId, approved_at: new Date().toISOString() }, 'Approved.')
        }
        if (result.outcome === 'rejected') {
          return respond(supabase, id, auth.orgId, { status: 'draft' }, 'Rejected — returned to draft.')
        }
        return respond(supabase, id, auth.orgId, {}, `Endorsed — sent to ${result.approver.name} for approval.`)
      }

      if (to === 'sent' && from !== 'approved') {
        return NextResponse.json(
          { error: 'This purchase order must be approved before it can be sent to the vendor.' },
          { status: 409 },
        )
      }
    } catch (e) {
      if (e instanceof ChainError) return NextResponse.json({ error: e.message }, { status: e.status })
      throw e
    }
  }

  // ── Everything else: edits, sending an approved PO, cancelling ─────────────
  const roleCheck = await requireRole('manager')
  if (roleCheck.error) return roleCheck.error

  // Cancelling a PO mid-approval clears its pending step.
  if (to === 'cancelled' && from === 'pending_approval') {
    await cancelChain(supabase, 'purchase_order', id)
  }

  // Starter (no approval workflow): a PO can go straight from draft to sent.
  if (!approvalsOn && (to === 'approved' || to === 'sent') && from !== 'approved') {
    updates.approved_by = auth.userId
    updates.approved_at = new Date().toISOString()
  }

  return respond(supabase, id, auth.orgId, updates)
}

async function respond(
  supabase: ReturnType<typeof createServiceClient>,
  id: string, orgId: string, patch: Record<string, unknown>, message?: string,
) {
  const q = Object.keys(patch).length
    ? supabase.from('purchase_orders').update(patch).eq('id', id).eq('org_id', orgId).select().single()
    : supabase.from('purchase_orders').select().eq('id', id).eq('org_id', orgId).single()
  const { data, error } = await q
  if (error) {
    console.error('[PATCH /api/purchase-orders/:id]', error)
    return NextResponse.json({ error: error.message ?? 'Failed to update purchase order' }, { status: 500 })
  }
  return NextResponse.json({ data, message })
}
