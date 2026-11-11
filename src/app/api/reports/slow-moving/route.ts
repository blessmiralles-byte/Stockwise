import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAnyRole } from '@/lib/api-auth'
import { fetchAllPaged } from '@/lib/fetch-paged'
import { slowMovingStock, type StockItem } from '@/lib/inventory-reports'

/**
 * How far back to look for an item's last movement. Anything idle longer than
 * a year is in the oldest bucket already, so two years is plenty to place
 * every item and keeps the read bounded.
 */
const LOOKBACK_DAYS = 730

/**
 * GET /api/reports/slow-moving
 *
 * Everything on the shelf, by how long since it was last used, with the money
 * tied up in each age band. Scoped to the caller's org_id.
 */
export async function GET() {
  const auth = await requireAnyRole('owner', 'operations', 'manager', 'procurement', 'finance')
  if (auth.error) return auth.error

  const supabase = createServiceClient()
  const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString()

  const [balances, moves] = await Promise.all([
    fetchAllPaged<any>((from, to) => supabase
      .from('inventory_balances')
      .select('product_id, quantity, avg_cost, product:products(sku, name, unit_of_measure, category:categories(name))')
      .eq('org_id', auth.orgId)
      .gt('quantity', 0)
      .order('product_id')
      .order('location_id')
      .range(from, to)),
    fetchAllPaged<{ product_id: string; transaction_type: string; created_at: string }>((from, to) => supabase
      .from('inventory_transactions')
      .select('product_id, transaction_type, created_at')
      .eq('org_id', auth.orgId)
      .eq('status', 'posted')
      .in('transaction_type', ['purchase', 'consumption', 'sale'])
      .gte('created_at', since)
      .order('created_at')
      .order('id')
      .range(from, to)),
  ])

  if (balances.error || moves.error) {
    console.error('[GET /api/reports/slow-moving]', balances.error ?? moves.error)
    return NextResponse.json({ error: 'Failed to load stock' }, { status: 500 })
  }

  // Oldest first, so the last write for each product is its most recent movement.
  const lastUsed = new Map<string, string>(), lastReceived = new Map<string, string>()
  for (const m of moves.rows) {
    (m.transaction_type === 'purchase' ? lastReceived : lastUsed).set(m.product_id, m.created_at)
  }

  // One line per item, across every location it sits in.
  const items = new Map<string, StockItem>()
  for (const b of balances.rows) {
    const qty = Number(b.quantity), value = qty * Number(b.avg_cost ?? 0)
    const it = items.get(b.product_id)
    if (it) { it.quantity += qty; it.value += value; continue }
    items.set(b.product_id, {
      product_id: b.product_id,
      sku:        b.product?.sku ?? '',
      name:       b.product?.name ?? 'Unknown item',
      category:   b.product?.category?.name ?? null,
      unit:       b.product?.unit_of_measure ?? null,
      quantity:   qty,
      value,
      last_used:     lastUsed.get(b.product_id) ?? null,
      last_received: lastReceived.get(b.product_id) ?? null,
    })
  }

  const result = slowMovingStock([...items.values()], new Date())
  return NextResponse.json({
    data: result.rows,
    summary: result.summary,
    total_value: result.total_value,
    truncated: balances.truncated || moves.truncated || undefined,
  })
}
