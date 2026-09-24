import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAuth, requireAnyRole } from '@/lib/api-auth'
import { createNotification } from '@/lib/notify'

// GET /api/purchase-orders?status=draft&supplier_id=xxx
export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const { searchParams } = new URL(req.url)
  const status     = searchParams.get('status')
  const supplierId = searchParams.get('supplier_id')

  const supabase = createServiceClient()
  let query = supabase
    .from('purchase_orders')
    .select(`
      *,
      supplier:suppliers(id, name, lead_time_days),
      lines:purchase_order_lines(
        id, product_id, quantity_ordered, quantity_received, unit_cost, notes,
        product:products(id, sku, name, unit_of_measure)
      )
    `)
    .eq('org_id', auth.orgId)
    .order('created_at', { ascending: false })

  if (status) query = query.eq('status', status)
  if (supplierId) query = query.eq('supplier_id', supplierId)

  const { data, error } = await query
  if (error) {
    console.error('[GET /api/purchase-orders]', error)
    return NextResponse.json({ error: 'Failed to fetch purchase orders' }, { status: 500 })
  }

  return NextResponse.json({ data })
}

// POST /api/purchase-orders
export async function POST(req: NextRequest) {
  // SOD: only procurement managers (and owner) can create POs
  const auth = await requireAnyRole('owner', 'procurement')
  if (auth.error) return auth.error

  const body = await req.json()
  const { supplier_id, order_date, expected_date, notes, lines, requisition_id } = body

  if (!Array.isArray(lines) || lines.length === 0) {
    return NextResponse.json({ error: 'At least one line item is required' }, { status: 400 })
  }

  for (const line of lines) {
    if (!line.product_id || !line.quantity_ordered || line.quantity_ordered < 1) {
      return NextResponse.json({ error: 'Each line needs a product and quantity ≥ 1' }, { status: 400 })
    }
  }

  const supabase = createServiceClient()

  // Requisition link: only an approved request from this org, and it must not
  // already have a PO (procurement would otherwise order it twice).
  let requisition: any = null
  if (requisition_id) {
    const { data: r } = await supabase
      .from('requisitions')
      .select('id, req_number, status, requested_by')
      .eq('id', requisition_id)
      .eq('org_id', auth.orgId)
      .maybeSingle()
    if (!r) return NextResponse.json({ error: 'Requisition not found' }, { status: 404 })
    if (r.status !== 'approved') {
      return NextResponse.json({ error: 'Only an approved requisition can be turned into a purchase order' }, { status: 400 })
    }
    const { count } = await supabase.from('purchase_orders').select('id', { count: 'exact', head: true })
      .eq('org_id', auth.orgId).eq('requisition_id', requisition_id).neq('status', 'cancelled')
    if (count) {
      return NextResponse.json({ error: 'A purchase order already exists for this requisition' }, { status: 409 })
    }
    requisition = r
  }

  // H-3: Use atomic DB sequence to prevent duplicate PO numbers under concurrency
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const { data: seqVal, error: seqErr } = await supabase
    .rpc('next_ref_number', { p_seq: 'public.po_seq' })
  if (seqErr || seqVal == null) {
    console.error('[POST /api/purchase-orders] sequence', seqErr?.message)
    return NextResponse.json({ error: 'Failed to generate PO number' }, { status: 500 })
  }
  const po_number = `PO-${datePart}-${String(seqVal).padStart(4, '0')}`

  // Insert PO
  const { data: po, error: poErr } = await supabase
    .from('purchase_orders')
    .insert({
      org_id: auth.orgId,
      po_number,
      supplier_id: supplier_id || null,
      order_date: order_date || null,
      expected_date: expected_date || null,
      notes: notes?.trim() || null,
      created_by: auth.userId,
      requisition_id: requisition?.id ?? null,
    })
    .select()
    .single()

  if (poErr) {
    console.error('[POST /api/purchase-orders] insert PO', poErr)
    return NextResponse.json({ error: poErr.message ?? 'Failed to create purchase order' }, { status: 500 })
  }

  // Insert lines
  const lineRows = lines.map((l: any) => ({
    org_id: auth.orgId,
    purchase_order_id: po.id,
    product_id: l.product_id,
    quantity_ordered: l.quantity_ordered,
    unit_cost: l.unit_cost ?? 0,
    notes: l.notes?.trim() || null,
    requisition_item_id: l.requisition_item_id ?? null,
  }))

  const { error: lineErr } = await supabase
    .from('purchase_order_lines')
    .insert(lineRows)

  if (lineErr) {
    console.error('[POST /api/purchase-orders] insert lines', lineErr)
    await supabase.from('purchase_orders').delete().eq('id', po.id)
    return NextResponse.json({ error: lineErr.message ?? 'Failed to create PO lines' }, { status: 500 })
  }

  // The request has been acted on: mark it fulfilled and tell the requester.
  if (requisition) {
    await supabase.from('requisitions')
      .update({ status: 'fulfilled', fulfilled_at: new Date().toISOString() })
      .eq('id', requisition.id).eq('org_id', auth.orgId)
    await createNotification({
      userId: requisition.requested_by,
      orgId:  auth.orgId,
      type:   'requisition.fulfill',
      title:  `${po_number} raised for requisition ${requisition.req_number}`,
      body:   'Procurement has turned your request into a purchase order.',
      data:   { po_id: po.id, req_id: requisition.id },
      actionUrl: `/purchase-orders/${po.id}`,
    })
  }

  return NextResponse.json({ data: po }, { status: 201 })
}
