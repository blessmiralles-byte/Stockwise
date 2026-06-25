import { NextRequest, NextResponse } from 'next/server'
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
      id, transaction_type, reference_no, quantity, unit_cost, notes, created_at, created_by,
      product:products(id, name, sku, unit_of_measure),
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

  const OUTBOUND = new Set(['consumption', 'sale'])
  const runningBalance: Record<string, number> = {}
  const rows = (data ?? []).map((t: any) => {
    const pid: string = t.product?.id ?? 'unknown'
    const isOut = OUTBOUND.has(t.transaction_type) || t.quantity < 0
    const absQty = Math.abs(t.quantity)
    const delta = isOut ? -absQty : absQty
    runningBalance[pid] = (runningBalance[pid] ?? 0) + delta
    return {
      ...t,
      qty_in:          isOut ? 0 : absQty,
      qty_out:         isOut ? absQty : 0,
      running_balance: runningBalance[pid],
    }
  })

  return NextResponse.json({ data: rows.reverse(), count: rows.length })
}
