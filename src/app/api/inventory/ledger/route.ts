import { NextRequest, NextResponse } from 'next/server'
import { movementEffect } from '@/lib/stock-direction'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAnyRole } from '@/lib/api-auth'

export async function GET(req: NextRequest) {
  // H-4: Ledger is sensitive financial data — restrict to finance/operations and above
  const auth = await requireAnyRole('owner', 'finance', 'operations', 'procurement')
  if (auth.error) return auth.error

  const { searchParams } = req.nextUrl
  const productId = searchParams.get('product_id')

  const supabase = createServiceClient()

  let query = supabase
    .from('inventory_transactions')
    .select(`
      id, transaction_type, reference_no, quantity, unit_cost, total_cost, notes, created_at, created_by,
      product:products(id, name, sku, unit_of_measure, cost_method),
      from_location:locations!inventory_transactions_from_location_id_fkey(id, name),
      to_location:locations!inventory_transactions_to_location_id_fkey(id, name)
    `)
    .eq('org_id', auth.orgId)
    .order('created_at', { ascending: true })
    .limit(500)

  if (productId) query = query.eq('product_id', productId)

  const { data, error } = await query
  if (error) {
    console.error('[GET /api/inventory/ledger]', error)
    return NextResponse.json({ error: 'Failed to fetch ledger' }, { status: 500 })
  }

  const runningBalance: Record<string, number> = {}
  const runningValue: Record<string, number> = {}
  const rows = (data ?? []).map((t: any) => {
    const pid: string = t.product?.id ?? 'unknown'
    // In, out or neither comes from one place (lib/stock-direction). A transfer
    // moves stock between locations and leaves the item's total where it was.
    const eff = movementEffect(t.transaction_type, t.quantity)
    const isOut = eff.stock < 0
    const isIn  = eff.stock > 0
    const absQty = Math.abs(t.quantity)
    const delta = eff.stock * absQty
    // total_cost is signed (quantity * unit_cost) and quantity can be negative
    // for adjustments — take the magnitude so an outbound never *adds* value.
    const txValue = Math.abs(Number(t.total_cost ?? (t.quantity * (t.unit_cost ?? 0))))
    const valueDelta = eff.stock * txValue
    runningBalance[pid] = (runningBalance[pid] ?? 0) + delta
    runningValue[pid] = Math.max(0, (runningValue[pid] ?? 0) + valueDelta)
    return {
      ...t,
      qty_in:          isIn ? absQty : 0,
      qty_out:         isOut ? absQty : 0,
      value_in:        isIn ? txValue : 0,
      value_out:       isOut ? txValue : 0,
      running_balance: runningBalance[pid],
      running_value:   runningValue[pid],
    }
  })

  return NextResponse.json({ data: rows.reverse(), count: rows.length })
}
