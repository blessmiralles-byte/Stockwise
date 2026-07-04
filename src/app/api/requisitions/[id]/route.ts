import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAuth } from '@/lib/api-auth'
import { logAudit } from '@/lib/audit'
import { createNotification } from '@/lib/notify'

const REQ_SELECT = `
  id, req_number, type, status, job_reference, job_code, notes, reject_reason, required_by,
  approved_at, fulfilled_at, created_at,
  location:locations(id, name, code),
  cost_center:cost_centers(id, code, name),
  requested_by:user_profiles!requested_by(id, full_name, role),
  approved_by:user_profiles!approved_by(id, full_name),
  items:requisition_items(
    id, item_type, quantity, unit_cost, notes, returned_at,
    asset:fixed_assets(id, asset_tag, name, status),
    product:products(id, name, sku, unit_of_measure)
  )
`

function canApprove(role: string, reqType: string): boolean {
  if (role === 'owner' || role === 'admin') return true
  if (reqType === 'new_asset') return role === 'procurement'
  // checkout + inventory → operations
  return role === 'operations' || role === 'manager'
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const { id } = await params
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('requisitions')
    .select(REQ_SELECT)
    .eq('id', id)
    .eq('org_id', auth.orgId)
    .single()

  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Non-managers can only view their own
  const canSeeAll = ['owner', 'admin', 'operations', 'procurement', 'finance', 'manager'].includes(auth.role)
  if (!canSeeAll && (data as any).requested_by?.id !== auth.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  return NextResponse.json({ data })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

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
  const approvalWarnings: string[] = []

  switch (action) {

    // ── Approve ────────────────────────────────────────────────────────────────
    case 'approve': {
      if (!canApprove(auth.role, r.type)) {
        return NextResponse.json({ error: 'Access denied. Insufficient role to approve this requisition.' }, { status: 403 })
      }
      if (r.status !== 'pending') {
        return NextResponse.json({ error: 'Only pending requisitions can be approved' }, { status: 400 })
      }

      // checkout → checked_out immediately (no separate approval step needed)
      const newStatus = r.type === 'checkout' ? 'checked_out' : 'approved'

      await supabase
        .from('requisitions')
        .update({ status: newStatus, approved_by: auth.userId, approved_at: now })
        .eq('id', id)

      // Inventory: auto-deduct stock on approval
      if (r.type === 'inventory') {
        for (const item of (r.items as any[])) {
          if (item.item_type !== 'product' || !item.product_id) continue

          const qty = Math.abs(Number(item.quantity))

          // Resolve location: use the requisition's location, or auto-detect
          // from the product's inventory balance (pick the location with stock).
          // The auto-detect query already returns avg_cost, so only the explicit
          // -location path needs a separate cost lookup.
          let fromLocationId: string | null = r.location_id ?? null
          let balanceCost = 0
          if (!fromLocationId) {
            const { data: balRow } = await supabase
              .from('inventory_balances')
              .select('location_id, quantity, avg_cost')
              .eq('product_id', item.product_id)
              .gt('quantity', 0)
              .order('quantity', { ascending: false })
              .limit(1)
              .single()
            if (balRow) {
              fromLocationId = balRow.location_id
              balanceCost    = Number(balRow.avg_cost ?? 0)
            }
          } else {
            const { data: costRow } = await supabase
              .from('inventory_balances')
              .select('avg_cost')
              .eq('product_id', item.product_id)
              .eq('location_id', fromLocationId)
              .single()
            balanceCost = Number(costRow?.avg_cost ?? 0)
          }

          // Try atomic RPC first
          const { error: rpcErr } = await supabase.rpc('record_inventory_movement', {
            p_transaction_type: 'consumption',
            p_product_id:       item.product_id,
            p_quantity:         qty,
            p_unit_cost:        balanceCost,
            p_from_location_id: fromLocationId,
            p_to_location_id:   null,
            p_reference_no:     r.req_number,
            p_notes:            `Requisition ${r.req_number}${r.job_reference ? ' — Job: ' + r.job_reference : ''}`,
            p_customer_id:      null,
            p_created_by:       auth.userId,
            p_batch_no:         null,
            p_expiration_date:  null,
            p_job_order_id:     r.job_reference ?? null,
            p_cost_center_id:   r.cost_center_id ?? null,
            p_job_code:         r.job_code ?? null,
            p_org_id:           auth.orgId,
          })

          if (rpcErr) {
            // Only fall back to manual posting when the RPC isn't deployed yet.
            // A real RPC rejection (insufficient stock, closed period) must NOT
            // be force-posted — that would drive the balance negative or write
            // into a closed period. Skip the item and surface a warning.
            const isRpcMissing =
              rpcErr.message?.toLowerCase().includes('function') ||
              (rpcErr as any).code === 'PGRST202'
            if (!isRpcMissing) {
              console.error(`[requisition ${r.req_number}] consumption rejected:`, rpcErr.message)
              approvalWarnings.push(rpcErr.message)
              continue
            }

            await supabase.from('inventory_transactions').insert({
              org_id:           auth.orgId,
              transaction_type: 'consumption',
              product_id:       item.product_id,
              quantity:         qty,
              unit_cost:        balanceCost,
              // total_cost is a generated column (quantity * unit_cost) — never set it
              from_location_id: fromLocationId,
              reference_no:     r.req_number,
              notes:            `Requisition ${r.req_number}`,
              created_by:       auth.userId,
              job_order_id:     r.job_reference ?? null,
              cost_center_id:   r.cost_center_id ?? null,
              job_code:         r.job_code ?? null,
            })

            // Deduct from balance
            if (fromLocationId) {
              const { data: bal } = await supabase
                .from('inventory_balances')
                .select('id, quantity')
                .eq('product_id', item.product_id)
                .eq('location_id', fromLocationId)
                .single()
              if (bal) {
                await supabase
                  .from('inventory_balances')
                  .update({ quantity: bal.quantity - qty, last_updated: new Date().toISOString() })
                  .eq('id', bal.id)
              }
            }
          }
        }

        // Mark fulfilled only if every item was consumed cleanly; otherwise
        // leave it 'approved' so an operator can resolve the shortfall.
        if (approvalWarnings.length === 0) {
          await supabase
            .from('requisitions')
            .update({ status: 'fulfilled', fulfilled_at: now })
            .eq('id', id)
        }
      }

      break
    }

    // ── Reject ─────────────────────────────────────────────────────────────────
    case 'reject': {
      if (!canApprove(auth.role, r.type)) {
        return NextResponse.json({ error: 'Access denied. Insufficient role to reject this requisition.' }, { status: 403 })
      }
      if (r.status !== 'pending') {
        return NextResponse.json({ error: 'Only pending requisitions can be rejected' }, { status: 400 })
      }
      await supabase
        .from('requisitions')
        .update({ status: 'rejected', reject_reason: reject_reason ?? null })
        .eq('id', id)
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
      break
    }

    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
  }

  // In-app notifications for the requester
  if (action === 'approve' || action === 'reject') {
    const notifTitle = action === 'approve'
      ? `✅ Requisition ${r.req_number} approved`
      : `❌ Requisition ${r.req_number} rejected`
    const notifBody = action === 'reject' && reject_reason
      ? `Reason: ${reject_reason}`
      : action === 'approve'
        ? 'Your request has been approved and is being processed.'
        : 'Your request was not approved.'
    await createNotification({
      userId:    r.requested_by,
      orgId:     auth.orgId,
      type:      `requisition.${action}`,
      title:     notifTitle,
      body:      notifBody,
      data:      { req_id: id, req_number: r.req_number, type: r.type },
      actionUrl: '/requisitions',
    })
  }

  // M-4: Audit log for approve/reject actions
  if (action === 'approve' || action === 'reject') {
    await logAudit({
      actorId:   auth.userId,
      orgId:     auth.orgId,
      action:    action === 'approve' ? 'requisition.approve' : 'requisition.reject',
      tableName: 'requisitions',
      recordId:  id,
      oldValue:  { status: 'pending', req_number: r.req_number },
      newValue:  { status: action === 'approve' ? 'approved' : 'rejected', reject_reason: reject_reason ?? null },
    })
  }

  const { data: updated } = await supabase
    .from('requisitions')
    .select(REQ_SELECT)
    .eq('id', id)
    .single()

  return NextResponse.json({
    data: updated,
    warnings: approvalWarnings.length ? approvalWarnings : undefined,
  })
}
