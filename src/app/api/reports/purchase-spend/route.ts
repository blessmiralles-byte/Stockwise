import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAnyRole } from '@/lib/api-auth'
import { fetchAllPaged } from '@/lib/fetch-paged'
import { parseRange } from '@/lib/report-data'
import { purchaseSpend, type ReceiptLine } from '@/lib/procurement-reports'

/**
 * GET /api/reports/purchase-spend?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * What was actually received in the period, at the cost it came in at: by
 * vendor, by category, and by item with the first and last price paid. Built
 * from goods receipts, not orders, so it is spend that happened. Defaults to
 * the last 90 days. Scoped to the caller's org_id.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAnyRole('owner', 'procurement', 'finance', 'operations', 'manager')
  if (auth.error) return auth.error

  const range = parseRange(req, 90)
  const supabase = createServiceClient()

  const { rows, truncated, error } = await fetchAllPaged<any>((from, to) =>
    supabase
      .from('inventory_transactions')
      .select(`
        created_at, product_id, quantity, unit_cost, related_po_id,
        product:products(sku, name, category:categories(name), supplier:suppliers(name))
      `)
      .eq('org_id', auth.orgId)
      .eq('transaction_type', 'purchase')
      .eq('status', 'posted')
      .gte('created_at', range.fromTs)
      .lte('created_at', range.toTs)
      .order('created_at')
      .order('id')
      .range(from, to))

  if (error) {
    console.error('[GET /api/reports/purchase-spend]', error)
    return NextResponse.json({ error: 'Failed to load goods receipts' }, { status: 500 })
  }

  // The vendor is whoever the purchase order was placed with; a receipt with
  // no order falls back to the item's usual vendor.
  const poIds = [...new Set(rows.map(r => r.related_po_id).filter(Boolean))] as string[]
  const vendorByPo = new Map<string, string>()
  for (let i = 0; i < poIds.length; i += 200) {
    const { data } = await supabase
      .from('purchase_orders')
      .select('id, supplier:suppliers(name)')
      .eq('org_id', auth.orgId)
      .in('id', poIds.slice(i, i + 200))
    for (const p of (data ?? []) as any[]) if (p.supplier?.name) vendorByPo.set(p.id, p.supplier.name)
  }

  const lines: ReceiptLine[] = rows.map(r => ({
    created_at: r.created_at,
    product_id: r.product_id,
    sku:        r.product?.sku ?? '',
    name:       r.product?.name ?? 'Unknown item',
    category:   r.product?.category?.name ?? null,
    vendor:     (r.related_po_id && vendorByPo.get(r.related_po_id)) || r.product?.supplier?.name || null,
    quantity:   Number(r.quantity),
    unit_cost:  Number(r.unit_cost ?? 0),
  }))

  return NextResponse.json({
    data: purchaseSpend(lines),
    meta: { from: range.from, to: range.to },
    truncated: truncated || undefined,
  })
}
