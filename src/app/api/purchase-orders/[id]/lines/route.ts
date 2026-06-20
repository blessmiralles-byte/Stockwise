import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAnyRole } from '@/lib/api-auth'

/** POST /api/purchase-orders/:id/lines — add a line to an existing PO (draft only) */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAnyRole('owner', 'operations', 'procurement')
  if (auth.error) return auth.error

  const { id } = await params
  let body: any
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { product_id, quantity_ordered, unit_cost, notes } = body
  if (!product_id) return NextResponse.json({ error: 'product_id is required' }, { status: 400 })
  if (!quantity_ordered || quantity_ordered < 1) return NextResponse.json({ error: 'quantity must be ≥ 1' }, { status: 400 })

  const supabase = createServiceClient()

  // Verify PO belongs to org and is in a state that allows adding lines
  const { data: po, error: poErr } = await supabase
    .from('purchase_orders')
    .select('id, status')
    .eq('id', id)
    .eq('org_id', auth.orgId)
    .single()

  if (poErr || !po) return NextResponse.json({ error: 'PO not found' }, { status: 404 })
  if (po.status === 'received' || po.status === 'cancelled') {
    return NextResponse.json({ error: `Cannot add lines to a ${po.status} PO` }, { status: 409 })
  }

  const { data, error } = await supabase
    .from('purchase_order_lines')
    .insert({
      org_id: auth.orgId,
      purchase_order_id: id,
      product_id,
      quantity_ordered,
      quantity_received: 0,
      unit_cost: unit_cost ?? 0,
      notes: notes?.trim() || null,
    })
    .select('id, product_id, quantity_ordered, quantity_received, unit_cost, notes, product:products(id, sku, name, unit_of_measure)')
    .single()

  if (error) {
    console.error('[POST /api/purchase-orders/lines]', error)
    return NextResponse.json({ error: 'Failed to add line' }, { status: 500 })
  }

  return NextResponse.json({ data }, { status: 201 })
}

/** DELETE /api/purchase-orders/:id/lines?line_id=xxx — remove a line (draft only) */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAnyRole('owner', 'operations', 'procurement')
  if (auth.error) return auth.error

  const { id } = await params
  const lineId = req.nextUrl.searchParams.get('line_id')
  if (!lineId) return NextResponse.json({ error: 'line_id query param required' }, { status: 400 })

  const supabase = createServiceClient()

  const { data: po } = await supabase
    .from('purchase_orders')
    .select('status')
    .eq('id', id)
    .eq('org_id', auth.orgId)
    .single()

  if (!po) return NextResponse.json({ error: 'PO not found' }, { status: 404 })
  if (po.status !== 'draft') return NextResponse.json({ error: 'Can only remove lines from draft POs' }, { status: 409 })

  const { error } = await supabase
    .from('purchase_order_lines')
    .delete()
    .eq('id', lineId)
    .eq('purchase_order_id', id)

  if (error) return NextResponse.json({ error: 'Failed to remove line' }, { status: 500 })
  return NextResponse.json({ success: true })
}
