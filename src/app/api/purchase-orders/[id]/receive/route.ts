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
    Math.max(0, Math.floor(ordered * (1 + tolerancePct / 100)) - already)

  // ── Build the cascade pool: every still-open PO line for this supplier,
  // grouped by product, ordered earliest-first (order_date, then created_at).
  // A delivery fills the earliest order first, then spills into the next.
  type Target = {
    po_id: string; po_number: string; line_id: string
    ordered: number; already: number; unit_cost: number
  }
  const openByProduct: Record<string, Target[]> = {}
  if (po.supplier_id) {
    const { data: openPos } = await supabase
      .from('purchase_orders')
      .select(`
        id, po_number, order_date, created_at,
        lines:purchase_order_lines(id, product_id, quantity_ordered, quantity_received, unit_cost)
      `)
      .eq('org_id', auth.orgId)
      .eq('supplier_id', po.supplier_id)
      .not('status', 'in', '(received,cancelled)')
      .order('order_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true })

    for (const cand of (openPos ?? []) as any[]) {
      for (const ln of (cand.lines as any[])) {
        if (ln.quantity_received >= ln.quantity_ordered) continue
        ;(openByProduct[ln.product_id] ??= []).push({
          po_id:     cand.id,
          po_number: cand.po_number,
          line_id:   ln.id,
          ordered:   ln.quantity_ordered,
          already:   ln.quantity_received,
          unit_cost: ln.unit_cost,
        })
      }
    }
  }

  const errors: string[] = []
  const successLines: string[] = []
  // POs whose lines changed and need a status recompute (may include earlier POs)
  const affectedPoIds = new Set<string>([id])
  const notices: string[] = []
  // Track qty added to each PO line during THIS request so multiple payload
  // entries for the same product don't double-allocate a shared pool.
  const addedByLine: Record<string, number> = {}

  const received_by = auth.userId

  for (const recv of lines) {
    const { line_id, quantity_received, to_location_id, source_type, from_location_id, batch_no, expiration_date, condition, condition_notes } = recv

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

    if (!to_location_id) {
      errors.push(`line ${line_id}: to_location_id is required`)
      continue
    }
    if (source_type === 'location' && !from_location_id) {
      errors.push(`line ${line_id}: from_location_id is required for location transfers`)
      continue
    }
    if (quantity_received <= 0) {
      errors.push(`line ${line_id}: quantity must be at least 1`)
      continue
    }

    // Cascade pool for this product (earliest PO first). Falls back to just
    // the current PO line when the supplier has no other open orders.
    const pool = openByProduct[poLine.product_id] ?? [{
      po_id: po.id, po_number: po.po_number, line_id: poLine.id,
      ordered: poLine.quantity_ordered, already: poLine.quantity_received, unit_cost: poLine.unit_cost,
    }]

    const txType = source_type === 'location' ? 'transfer' : 'purchase'
    let toAllocate = quantity_received
    const splits: string[] = []

    for (const t of pool) {
      if (toAllocate <= 0) break
      const alreadyNow = t.already + (addedByLine[t.line_id] ?? 0)
      const cap = maxReceivable(t.ordered, alreadyNow)
      if (cap <= 0) continue
      const take = Math.min(toAllocate, cap)

      const { error: txErr } = await supabase.rpc('record_inventory_movement', {
        p_transaction_type: txType,
        p_product_id: poLine.product_id,
        p_quantity: take,
        p_unit_cost: t.unit_cost,            // each PO line costed at its own price
        p_from_location_id: from_location_id || null,
        p_to_location_id: to_location_id,
        p_reference_no: t.po_number,
        p_notes: `GRN against ${t.po_number}`,
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
        break
      }

      const { error: lineErr } = await supabase
        .from('purchase_order_lines')
        .update({
          quantity_received: alreadyNow + take,
          received_by,
          condition:       condition || 'good',
          condition_notes: condition_notes?.trim() || null,
        })
        .eq('id', t.line_id)
      if (lineErr) {
        errors.push(`line ${line_id}: failed to update received qty on ${t.po_number}`)
        break
      }

      addedByLine[t.line_id] = (addedByLine[t.line_id] ?? 0) + take
      affectedPoIds.add(t.po_id)
      splits.push(`${take} → ${t.po_number}`)
      toAllocate -= take
    }

    if (splits.length > 0) {
      successLines.push(line_id)
      if (splits.length > 1) {
        notices.push(`line ${line_id}: split across ${splits.length} open POs — ${splits.join(', ')}`)
      }
    }
    if (toAllocate > 0) {
      const poCount = pool.length
      const tolNote = tolerancePct > 0 ? ` (incl. ${tolerancePct}% over-receipt)` : ''
      errors.push(`line ${line_id}: ${toAllocate} more than the total open quantity across ${poCount} PO${poCount !== 1 ? 's' : ''} for this supplier${tolNote}`)
    }
  }

  // Recompute status for every PO whose lines changed (current + any cascaded)
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
