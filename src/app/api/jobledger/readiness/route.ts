import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * POST /api/jobledger/readiness
 *
 * Job material readiness check — given a bill of materials, returns for each
 * line: on-hand stock, shortfall, preferred supplier, lead time, reliability,
 * and any open POs already covering the gap.
 *
 * Called by JobLedger when a planner opens the Job Readiness panel.
 *
 * Body:
 * {
 *   org_id:    string,
 *   job_id:    string,          // for context only, not filtered
 *   materials: [
 *     { sku: string, quantity_needed: number }
 *   ]
 * }
 *
 * Response: { materials: ReadinessLine[] }
 *
 * Auth: Authorization: Bearer {JOBLEDGER_API_KEY}
 */
export async function POST(req: NextRequest) {
  const apiKey = process.env.JOBLEDGER_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'JOBLEDGER_API_KEY is not configured' }, { status: 503 })
  }
  if (req.headers.get('authorization') !== `Bearer ${apiKey}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: any
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { org_id, job_id, materials } = body
  if (!org_id)                       return NextResponse.json({ error: 'org_id is required' },    { status: 400 })
  if (!Array.isArray(materials) || materials.length === 0) {
    return NextResponse.json({ error: 'materials array is required' }, { status: 400 })
  }

  const skus: string[] = materials.map((m: any) => String(m.sku).trim())

  const supabase = createServiceClient()

  // ── 1. Resolve SKUs → product IDs ────────────────────────────────────────────
  const { data: products } = await supabase
    .from('products')
    .select('id, sku, name, unit_of_measure, reorder_point, supplier_id, lead_time_days')
    .eq('org_id', org_id)
    .in('sku', skus)

  const productBySku = new Map((products ?? []).map((p: any) => [p.sku, p]))
  const productIds   = (products ?? []).map((p: any) => p.id as string)

  // ── 2. On-hand stock totals ───────────────────────────────────────────────────
  const { data: balances } = await supabase
    .from('inventory_balances')
    .select('product_id, quantity, avg_cost')
    .eq('org_id', org_id)
    .in('product_id', productIds)

  const stockByProduct = new Map<string, { qty: number; avgCost: number }>()
  for (const b of (balances ?? []) as any[]) {
    const existing = stockByProduct.get(b.product_id)
    if (existing) {
      existing.qty     += Number(b.quantity)
    } else {
      stockByProduct.set(b.product_id, { qty: Number(b.quantity), avgCost: Number(b.avg_cost) })
    }
  }

  // ── 3. Supplier reliability (from GRN history) ───────────────────────────────
  //    on_time_pct   = % of POs where actual receipt ≤ expected_date
  //    fill_rate_pct = avg(qty_received / qty_ordered) across all lines
  const supplierIds = [...new Set((products ?? [])
    .map((p: any) => p.supplier_id)
    .filter(Boolean))] as string[]

  const reliabilityMap = new Map<string, { onTimePct: number; fillRatePct: number; avgLeadDays: number | null }>()

  if (supplierIds.length > 0) {
    const { data: poData } = await supabase
      .from('purchase_orders')
      .select(`
        id, supplier_id, expected_date,
        lines:purchase_order_lines(quantity_ordered, quantity_received)
      `)
      .eq('org_id', org_id)
      .in('supplier_id', supplierIds)
      .in('status', ['received', 'partial'])

    // Group by supplier
    const bySupplier = new Map<string, any[]>()
    for (const po of (poData ?? []) as any[]) {
      const sid = po.supplier_id as string
      if (!bySupplier.has(sid)) bySupplier.set(sid, [])
      bySupplier.get(sid)!.push(po)
    }

    // Also get GRN dates from inventory_transactions
    const { data: grnTxs } = await supabase
      .from('inventory_transactions')
      .select('reference_no, created_at')
      .eq('org_id', org_id)
      .eq('transaction_type', 'purchase')
      .order('created_at', { ascending: false })

    const grnByRef = new Map<string, string>()
    for (const tx of (grnTxs ?? []) as any[]) {
      if (tx.reference_no && !grnByRef.has(tx.reference_no)) {
        grnByRef.set(tx.reference_no, tx.created_at)
      }
    }

    for (const [sid, pos] of bySupplier) {
      let onTimeCount = 0, totalPos = 0
      let totalFill = 0, fillCount = 0

      for (const po of pos) {
        totalPos++
        const grnDate    = grnByRef.get(po.po_number)
        const isOnTime   = po.expected_date && grnDate
          ? new Date(grnDate) <= new Date(po.expected_date)
          : null
        if (isOnTime !== null) onTimeCount += isOnTime ? 1 : 0

        const lines = (po.lines ?? []) as any[]
        if (lines.length > 0) {
          const ordered  = lines.reduce((s: number, l: any) => s + l.quantity_ordered,  0)
          const received = lines.reduce((s: number, l: any) => s + l.quantity_received, 0)
          if (ordered > 0) { totalFill += received / ordered; fillCount++ }
        }
      }

      reliabilityMap.set(sid, {
        onTimePct:   totalPos > 0 ? Math.round((onTimeCount / totalPos) * 100) : null as any,
        fillRatePct: fillCount  > 0 ? Math.round((totalFill / fillCount) * 100)  : null as any,
        avgLeadDays: null,   // could be calculated from GRN dates vs PO dates
      })
    }
  }

  // ── 4. Supplier names ─────────────────────────────────────────────────────────
  const { data: suppliers } = await supabase
    .from('suppliers')
    .select('id, name, lead_time_days, payment_terms')
    .eq('org_id', org_id)
    .in('id', supplierIds)

  const supplierById = new Map((suppliers ?? []).map((s: any) => [s.id, s]))

  // ── 5. Open POs covering each product ─────────────────────────────────────────
  const { data: openPoLines } = await supabase
    .from('purchase_order_lines')
    .select(`
      product_id,
      quantity_ordered, quantity_received, unit_cost,
      purchase_order:purchase_orders(id, po_number, status, expected_date, supplier:suppliers(name))
    `)
    .eq('org_id', org_id)
    .in('product_id', productIds)
    .in('purchase_orders.status', ['draft', 'sent', 'partial'])

  const openPosByProduct = new Map<string, any[]>()
  for (const line of (openPoLines ?? []) as any[]) {
    const pid = line.product_id as string
    const po  = Array.isArray(line.purchase_order) ? line.purchase_order[0] : line.purchase_order
    if (!po || !['draft', 'sent', 'partial'].includes(po.status)) continue
    if (!openPosByProduct.has(pid)) openPosByProduct.set(pid, [])
    openPosByProduct.get(pid)!.push({
      poId:         po.id,
      poNumber:     po.po_number,
      status:       po.status,
      expectedDate: po.expected_date ?? null,
      supplierName: (Array.isArray(po.supplier) ? po.supplier[0] : po.supplier)?.name ?? null,
      qtyOnOrder:   line.quantity_ordered - line.quantity_received,
      unitCost:     line.unit_cost,
    })
  }

  // ── 6. Build response ─────────────────────────────────────────────────────────
  const result = materials.map((req: any) => {
    const sku          = String(req.sku).trim()
    const qtyNeeded    = Number(req.quantity_needed)
    const product      = productBySku.get(sku)

    if (!product) {
      return {
        sku,
        product_name:    null,
        unit:            null,
        quantity_needed: qtyNeeded,
        on_hand:         0,
        shortfall:       qtyNeeded,
        shortfall_value: null,
        status:          'product_not_found',
        supplier:        null,
        lead_time_days:  null,
        reliability:     null,
        open_pos:        [],
        po_coverage:     0,
        procurement_gap: qtyNeeded,
      }
    }

    const stock        = stockByProduct.get(product.id)
    const onHand       = stock?.qty ?? 0
    const avgCost      = stock?.avgCost ?? 0
    const shortfall    = Math.max(0, qtyNeeded - onHand)

    // Supplier info
    const supplierId   = product.supplier_id ?? null
    const supplier     = supplierId ? supplierById.get(supplierId) : null
    const reliability  = supplierId ? (reliabilityMap.get(supplierId) ?? null) : null
    const leadTime     = product.lead_time_days ?? supplier?.lead_time_days ?? null

    // Open PO coverage
    const openPos       = openPosByProduct.get(product.id) ?? []
    const poCoverage    = openPos.reduce((s: number, p: any) => s + p.qtyOnOrder, 0)
    const procurementGap = Math.max(0, shortfall - poCoverage)

    // Status
    let status: string
    if (shortfall === 0)           status = 'ready'
    else if (poCoverage >= shortfall) status = 'po_covers_shortfall'
    else if (poCoverage > 0)       status = 'po_partial'
    else                           status = 'action_required'

    return {
      sku,
      product_id:      product.id,
      product_name:    product.name,
      unit:            product.unit_of_measure,
      quantity_needed: qtyNeeded,
      on_hand:         onHand,
      shortfall,
      shortfall_value: shortfall > 0 ? shortfall * avgCost : 0,
      status,
      supplier: supplier ? {
        id:            supplier.id,
        name:          supplier.name,
        payment_terms: supplier.payment_terms ?? null,
      } : null,
      lead_time_days:  leadTime,
      reliability: reliability ? {
        on_time_pct:   reliability.onTimePct,
        fill_rate_pct: reliability.fillRatePct,
      } : null,
      open_pos:        openPos,
      po_coverage:     poCoverage,
      procurement_gap: procurementGap,
    }
  })

  // Summary
  const summary = {
    job_id,
    total_lines:      result.length,
    ready:            result.filter((r: any) => r.status === 'ready').length,
    po_covers:        result.filter((r: any) => r.status === 'po_covers_shortfall').length,
    action_required:  result.filter((r: any) => ['po_partial', 'action_required'].includes(r.status)).length,
    critical_path:    result
      .filter((r: any) => r.shortfall > 0 && r.lead_time_days)
      .sort((a: any, b: any) => (b.lead_time_days ?? 0) - (a.lead_time_days ?? 0))[0]?.product_name ?? null,
  }

  return NextResponse.json({ materials: result, summary }, { headers: { 'Cache-Control': 'no-store' } })
}
