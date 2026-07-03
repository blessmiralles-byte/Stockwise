import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAnyRole } from '@/lib/api-auth'
import { fetchOpenSupplierPOs } from '@/lib/purchase-orders'

/**
 * GET /api/purchase-orders/:id/alternates
 *
 * For the supplier on this PO, returns the OTHER still-open POs that have an
 * open line for each product, so the receiver can choose to apply a receipt
 * to an earlier order. Also returns the supplier's over-receipt tolerance.
 *
 * Response:
 * {
 *   tolerance_pct: number,
 *   by_product: {
 *     [product_id]: Array<{
 *       po_id, po_number, order_date, line_id,
 *       ordered, already, remaining, unit_cost
 *     }>   // earliest order_date first
 *   }
 * }
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAnyRole('owner', 'receiver')
  if (auth.error) return auth.error

  const { id } = await params
  const supabase = createServiceClient()

  const { data: po, error: poErr } = await supabase
    .from('purchase_orders')
    .select('id, supplier_id')
    .eq('id', id)
    .eq('org_id', auth.orgId)
    .single()

  if (poErr || !po) {
    return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 })
  }

  const empty = { tolerance_pct: 0, by_product: {} as Record<string, any[]> }
  if (!po.supplier_id) return NextResponse.json(empty)

  // Supplier tolerance
  const { data: supplier } = await supabase
    .from('suppliers')
    .select('over_receipt_tolerance_pct')
    .eq('id', po.supplier_id)
    .single()
  const tolerance_pct = Number(supplier?.over_receipt_tolerance_pct ?? 0)

  // Other open POs for the same supplier (excludes the one being received)
  const others = (await fetchOpenSupplierPOs(supabase, auth.orgId, po.supplier_id))
    .filter((p: any) => p.id !== id)

  const by_product: Record<string, any[]> = {}
  for (const cand of others as any[]) {
    for (const line of (cand.lines as any[])) {
      const remaining = line.quantity_ordered - line.quantity_received
      if (remaining <= 0) continue
      ;(by_product[line.product_id] ??= []).push({
        po_id:      cand.id,
        po_number:  cand.po_number,
        order_date: cand.order_date ?? cand.created_at,
        line_id:    line.id,
        ordered:    line.quantity_ordered,
        already:    line.quantity_received,
        remaining,
        unit_cost:  line.unit_cost,
      })
    }
  }

  return NextResponse.json({ tolerance_pct, by_product })
}
