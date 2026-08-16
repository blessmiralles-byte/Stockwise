import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAuth, requireRole } from '@/lib/api-auth'
import { sumLineValue, checkApprovalLimit } from '@/lib/approvals'

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

  return NextResponse.json({ data })
}

// PATCH /api/purchase-orders/:id
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole('manager')
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

  // Approval gate: issuing a PO (moving to 'approved' or 'sent') requires the
  // actor's PO approval limit to cover its value — otherwise it must be
  // escalated up the reporting line. A PO already 'approved' can be sent freely.
  if (updates.status === 'approved' || updates.status === 'sent') {
    const { data: po } = await supabase
      .from('purchase_orders')
      .select('status, lines:purchase_order_lines(quantity_ordered, unit_cost)')
      .eq('id', id)
      .eq('org_id', auth.orgId)
      .single()

    if (po && po.status !== 'approved') {
      const total = sumLineValue(po.lines as any[], 'quantity_ordered', 'unit_cost')
      const limitError = await checkApprovalLimit(supabase, {
        orgId: auth.orgId, approverId: auth.userId, approverRole: auth.role,
        kind: 'po', amount: total,
      })
      if (limitError) {
        return NextResponse.json({ error: limitError }, { status: 403 })
      }
      updates.approved_by = auth.userId
      updates.approved_at = new Date().toISOString()
    }
  }

  const { data, error } = await supabase
    .from('purchase_orders')
    .update(updates)
    .eq('id', id)
    .eq('org_id', auth.orgId)
    .select()
    .single()

  if (error) {
    console.error('[PATCH /api/purchase-orders/:id]', error)
    return NextResponse.json({ error: 'Failed to update purchase order' }, { status: 500 })
  }

  return NextResponse.json({ data })
}
