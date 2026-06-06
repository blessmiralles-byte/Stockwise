import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireRole } from '@/lib/api-auth'

/**
 * POST /api/analytics/abc-xyz
 * Computes and persists ABC + XYZ classification for all active products.
 */
export async function POST(req: NextRequest) {
  const auth = await requireRole('manager')
  if (auth.error) return auth.error

  const supabase = createServiceClient()
  const since = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString()

  const { data: txs, error: txErr } = await supabase
    .from('inventory_transactions')
    .select('product_id, quantity, total_cost, created_at')
    .eq('org_id', auth.orgId)
    .in('transaction_type', ['consumption', 'sale'])
    .gte('created_at', since)

  if (txErr) {
    return NextResponse.json({ error: 'Failed to fetch transactions' }, { status: 500 })
  }

  if (!txs || txs.length === 0) {
    return NextResponse.json({ data: { classified: 0, message: 'No consumption data in the last 365 days' } })
  }

  type ProductStats = {
    totalValue: number
    monthlyQty: Record<string, number>
  }
  const stats: Record<string, ProductStats> = {}

  for (const tx of txs) {
    if (!stats[tx.product_id]) {
      stats[tx.product_id] = { totalValue: 0, monthlyQty: {} }
    }
    stats[tx.product_id].totalValue += Number(tx.total_cost)
    const month = tx.created_at.slice(0, 7)
    stats[tx.product_id].monthlyQty[month] =
      (stats[tx.product_id].monthlyQty[month] ?? 0) + Number(tx.quantity)
  }

  // ABC classification
  const products = Object.entries(stats)
  const totalValue = products.reduce((s, [, v]) => s + v.totalValue, 0)
  const sorted = [...products].sort((a, b) => b[1].totalValue - a[1].totalValue)

  let cumulative = 0
  const abcMap: Record<string, 'A' | 'B' | 'C'> = {}
  for (const [pid, s] of sorted) {
    cumulative += s.totalValue
    const pct = totalValue > 0 ? cumulative / totalValue : 0
    abcMap[pid] = pct <= 0.7 ? 'A' : pct <= 0.9 ? 'B' : 'C'
  }

  // XYZ: coefficient of variation
  function cv(monthlyQty: Record<string, number>): number {
    const values = Object.values(monthlyQty)
    if (values.length < 2) return 0
    const mean = values.reduce((s, v) => s + v, 0) / values.length
    if (mean === 0) return 0
    const variance = values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length
    return Math.sqrt(variance) / mean
  }

  const xyzMap: Record<string, 'X' | 'Y' | 'Z'> = {}
  for (const [pid, s] of products) {
    const c = cv(s.monthlyQty)
    xyzMap[pid] = c < 0.5 ? 'X' : c <= 1.0 ? 'Y' : 'Z'
  }

  // Persist to products table
  const now = new Date().toISOString()
  const updates = products.map(([pid]) => ({
    id: pid,
    abc_class: abcMap[pid],
    xyz_class: xyzMap[pid],
    abc_xyz_updated_at: now,
  }))

  const BATCH = 200
  for (let i = 0; i < updates.length; i += BATCH) {
    const batch = updates.slice(i, i + BATCH)
    const { error } = await supabase
      .from('products')
      .upsert(batch, { onConflict: 'id' })
    if (error) {
      console.error('[POST /api/analytics/abc-xyz] upsert', error)
      return NextResponse.json({ error: 'Failed to persist classifications' }, { status: 500 })
    }
  }

  const summary = {
    A: updates.filter(u => u.abc_class === 'A').length,
    B: updates.filter(u => u.abc_class === 'B').length,
    C: updates.filter(u => u.abc_class === 'C').length,
    X: updates.filter(u => u.xyz_class === 'X').length,
    Y: updates.filter(u => u.xyz_class === 'Y').length,
    Z: updates.filter(u => u.xyz_class === 'Z').length,
  }

  return NextResponse.json({ data: { classified: updates.length, summary } })
}
