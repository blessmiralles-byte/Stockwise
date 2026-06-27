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
      id, po_number, status, supplier_id,
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

  // Supplier over-receipt tolerance (percentage; 0 = strict). Same supplier
  // governs any earlier PO the receiver chooses to allocate to.
  let tolerancePct = 0
  if (po.supplier_id) {
    const { data: supplier } = await supabase
      .from('suppliers')
      .select('over_receipt_tolerance_pct')
      .eq('id', po.supplier_id)
      .single()
    tolerancePct = Number(supplier?.over_receipt_tolerance_pct ?? 0)
  }
  const maxReceivable = (ordered: number, already: number) =>
    Math.floor(ordered * (1 + tolerancePct / 100)) - already

  const errors: string[] = []
  const successLines: string[] = []
  // POs whose lines changed and need a status recompute (may include earlier POs)
  const affectedPoIds = new Set<string>([id])
  const notices: string[] = []

  const received_by = auth.userId

  for (const recv of lines) {
    const { line_id, quantity_received, to_location_id, source_type, from_location_id, unit_cost, batch_no, expiration_date, condition, condition_notes, apply_to_po_id, apply_to_line_id } = recv

    const poLine = (po.lines as any[]).find((l: any) => l.id === line_id)
    if (!poLine) {
      errors.push(`line ${line_id}: not found on this PO`)
      continue
    }

    // "missing" lines: record the note but skip inventory movement (no location needed)
    if (condition === 'missing') {
      await supabase
        .from('purchase_order_lines')
        .update({ received_by, condition: 'missing', condition_notes: condition_notes?.trim() || null })
        .eq('id', line_id)
      successLines.push(line_id)
      continue
    }

    // Resolve the target PO line. Default: the line on the PO being viewed.
    // The receiver may explicitly choose to apply the receipt to an earlier
    // open PO for the SAME supplier + SAME product (apply_to_po_id/line_id).
    let targetPoId     = po.id
    let targetPoNumber = po.po_number
    let targetLine     = poLine

    if (apply_to_po_id && apply_to_po_id !== po.id) {
      const target = await resolveTarget(
        supabase, auth.orgId, po.supplier_id, apply_to_po_id, apply_to_line_id, poLine.product_id,
      )
      if (!target) {
        errors.push(`line ${line_id}: chosen PO is not a valid open order for this supplier/product`)
        continue
      }
      targetPoId     = target.po_id
      targetPoNumber = target.po_number
      targetLine     = target.line
      notices.push(`line ${line_id}: applied to ${targetPoNumber} (chosen by receiver)`)
    }

    if (!to_location_id) {
      errors.push(`line ${line_id}: to_location_id is required`)
      continue
    }
    if (source_type === 'location' && !from_location_id) {
      errors.push(`line ${line_id}: from_location_id is required for location transfers`)
      continue
    }

    const cap = maxReceivable(targetLine.quantity_ordered, targetLine.quantity_received)
    if (quantity_received <= 0 || quantity_received > cap) {
      const where = targetPoId === po.id ? '' : ` on PO ${targetPoNumber}`
      const tolNote = tolerancePct > 0 ? ` (incl. ${tolerancePct}% over-receipt)` : ''
      errors.push(`line ${line_id}: quantity must be 1–${cap}${where}${tolNote}`)
      continue
    }

    const effectiveCost = unit_cost ?? targetLine.unit_cost

    const txType = source_type === 'location' ? 'transfer' : 'purchase'

    const { error: txErr } = await supabase.rpc('record_inventory_movement', {
      p_transaction_type: txType,
      p_product_id: targetLine.product_id,
      p_quantity: quantity_received,
      p_unit_cost: effectiveCost,
      p_from_location_id: from_location_id || null,
      p_to_location_id: to_location_id,
      p_reference_no: targetPoNumber,
      p_notes: `GRN against ${targetPoNumber}`,
      p_customer_id: null,
      p_created_by: auth.userId,
      p_batch_no: batch_no || null,
      p_expiration_date: expiration_date || null,
      p_job_order_id: null,
      p_cost_center_id: null,
      p_job_code: null,
      p_org_id: auth.orgId,
    })

    if (txErr) {
      console.error('[receive] rpc error', txErr)
      errors.push(`line ${line_id}: inventory update failed — ${txErr.message}`)
      continue
    }

    const { error: lineErr } = await supabase
      .from('purchase_order_lines')
      .update({
        quantity_received: targetLine.quantity_received + quantity_received,
        received_by:       received_by,
        condition:         condition || 'good',
        condition_notes:   condition_notes?.trim() || null,
      })
      .eq('id', targetLine.id)

    if (lineErr) {
      errors.push(`line ${line_id}: failed to update received qty`)
      continue
    }

    affectedPoIds.add(targetPoId)
    successLines.push(line_id)
  }

  // Recompute status for every PO whose lines changed (current + any redirected)
  let newStatus = po.status
  for (const poId of affectedPoIds) {
    const { data: updatedLines } = await supabase
      .from('purchase_order_lines')
      .select('quantity_ordered, quantity_received')
      .eq('purchase_order_id', poId)

    if (!updatedLines || updatedLines.length === 0) continue

    const totalOrdered  = updatedLines.reduce((s: number, l: any) => s + l.quantity_ordered, 0)
    const totalReceived = updatedLines.reduce((s: number, l: any) => s + l.quantity_received, 0)

    // Nothing received against this PO — leave its status untouched
    if (totalReceived <= 0) continue

    const status = totalReceived >= totalOrdered ? 'received' : 'partial'
    await supabase.from('purchase_orders').update({ status }).eq('id', poId)
    if (poId === id) newStatus = status
  }

  if (errors.length > 0 && successLines.length === 0) {
    return NextResponse.json({ error: errors.join('; ') }, { status: 400 })
  }

  return NextResponse.json({
    data: { received: successLines.length, new_status: newStatus },
    warnings: [...notices, ...errors].length > 0 ? [...notices, ...errors] : undefined,
  })
}

/**
 * Validate and load a receiver-chosen target PO line. Confirms the PO belongs
 * to the same org + supplier, is still open, and carries an open line for the
 * same product. Returns null if any check fails.
 */
async function resolveTarget(
  supabase: ReturnType<typeof createServiceClient>,
  orgId: string,
  supplierId: string | null,
  applyPoId: string,
  applyLineId: string | undefined,
  productId: string,
) {
  if (!supplierId) return null

  const { data: cand } = await supabase
    .from('purchase_orders')
    .select(`
      id, po_number, status, supplier_id,
      lines:purchase_order_lines(id, product_id, quantity_ordered, quantity_received, unit_cost)
    `)
    .eq('id', applyPoId)
    .eq('org_id', orgId)
    .single()

  if (!cand) return null
  if (cand.supplier_id !== supplierId) return null
  if (cand.status === 'received' || cand.status === 'cancelled') return null

  const lines = (cand.lines as any[]) ?? []
  // Prefer the explicitly chosen line; fall back to any open line for the product
  const line =
    (applyLineId && lines.find((l: any) => l.id === applyLineId && l.product_id === productId)) ||
    lines.find((l: any) => l.product_id === productId && l.quantity_received < l.quantity_ordered)

  if (!line) return null
  return { po_id: cand.id, po_number: cand.po_number, line }
}
