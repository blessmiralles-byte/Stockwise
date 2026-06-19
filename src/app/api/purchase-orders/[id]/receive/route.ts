import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAnyRole } from '@/lib/api-auth'

/**
 * POST /api/purchase-orders/:id/receive
 * Body: { lines: [{ line_id, quantity_received, unit_cost?, batch_no?, expiration_date?, to_location_id }] }
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // SOD: procurement cannot receive their own orders — only receiver or owner
  const auth = await requireAnyRole('owner', 'receiver')
  if (auth.error) return auth.error

  const { id } = await params
  const body = await req.json()
  const { lines } = body

  if (!Array.isArray(lines) || lines.length === 0) {
    return NextResponse.json({ error: 'lines array is required' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Fetch PO with lines
  const { data: po, error: poErr } = await supabase
    .from('purchase_orders')
    .select(`
      id, po_number, status,
      lines:purchase_order_lines(id, product_id, quantity_ordered, quantity_received, unit_cost)
    `)
    .eq('id', id)
    .eq('org_id', auth.orgId)
    .single()

  if (poErr || !po) {
    return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 })
  }

  if (po.status === 'cancelled' || po.status === 'received') {
    return NextResponse.json({ error: `Cannot receive against a ${po.status} PO` }, { status: 400 })
  }

  const errors: string[] = []
  const successLines: string[] = []

  for (const recv of lines) {
    const { line_id, quantity_received, to_location_id, source_type, from_location_id, unit_cost, batch_no, expiration_date } = recv

    if (!to_location_id) {
      errors.push(`line ${line_id}: to_location_id is required`)
      continue
    }
    if (source_type === 'location' && !from_location_id) {
      errors.push(`line ${line_id}: from_location_id is required for location transfers`)
      continue
    }

    const poLine = (po.lines as any[]).find((l: any) => l.id === line_id)
    if (!poLine) {
      errors.push(`line ${line_id}: not found on this PO`)
      continue
    }

    const remaining = poLine.quantity_ordered - poLine.quantity_received
    if (quantity_received <= 0 || quantity_received > remaining) {
      errors.push(`line ${line_id}: quantity must be 1–${remaining}`)
      continue
    }

    const effectiveCost = unit_cost ?? poLine.unit_cost

    const txType = source_type === 'location' ? 'transfer' : 'purchase'

    const { error: txErr } = await supabase.rpc('record_inventory_movement', {
      p_transaction_type: txType,
      p_product_id: poLine.product_id,
      p_from_location_id: from_location_id || null,
      p_to_location_id: to_location_id,
      p_quantity: quantity_received,
      p_unit_cost: effectiveCost,
      p_reference_no: po.po_number,
      p_batch_no: batch_no || null,
      p_expiration_date: expiration_date || null,
      p_notes: `GRN against ${po.po_number}`,
      p_created_by: auth.userId,
      p_job_order_id: null,
      p_org_id: auth.orgId,
    })

    if (txErr) {
      console.error('[receive] rpc error', txErr)
      errors.push(`line ${line_id}: inventory update failed — ${txErr.message}`)
      continue
    }

    const { error: lineErr } = await supabase
      .from('purchase_order_lines')
      .update({ quantity_received: poLine.quantity_received + quantity_received })
      .eq('id', line_id)

    if (lineErr) {
      errors.push(`line ${line_id}: failed to update received qty`)
      continue
    }

    successLines.push(line_id)
  }

  // Re-fetch all lines to compute new PO status
  const { data: updatedLines } = await supabase
    .from('purchase_order_lines')
    .select('quantity_ordered, quantity_received')
    .eq('purchase_order_id', id)

  let newStatus = po.status
  if (updatedLines && updatedLines.length > 0) {
    const totalOrdered  = updatedLines.reduce((s: number, l: any) => s + l.quantity_ordered, 0)
    const totalReceived = updatedLines.reduce((s: number, l: any) => s + l.quantity_received, 0)
    if (totalReceived >= totalOrdered) newStatus = 'received'
    else if (totalReceived > 0)        newStatus = 'partial'
  }

  if (newStatus !== po.status) {
    await supabase.from('purchase_orders').update({ status: newStatus }).eq('id', id)
  }

  if (errors.length > 0 && successLines.length === 0) {
    return NextResponse.json({ error: errors.join('; ') }, { status: 400 })
  }

  return NextResponse.json({
    data: { received: successLines.length, new_status: newStatus },
    warnings: errors.length > 0 ? errors : undefined,
  })
}
