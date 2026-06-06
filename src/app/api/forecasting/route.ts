import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAuth } from '@/lib/api-auth'

/**
 * GET /api/forecasting
 * Demand forecast based on historical consumption and sales.
 *
 * Query params:
 *   days_back     - lookback window for averaging (default 90)
 *   forecast_days - how many days forward to project (default 30)
 *
 * Reorder point formula (v2):
 *   reorder_point = avg_daily × (lead_time_days + review_period) + safety_stock
 *   where review_period = forecast_days / 4  (weekly review assumption)
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const { searchParams } = new URL(req.url)
  const daysBack     = Math.max(7,  Math.min(365, parseInt(searchParams.get('days_back')     ?? '90')))
  const forecastDays = Math.max(7,  Math.min(180, parseInt(searchParams.get('forecast_days') ?? '30')))
  const reviewPeriod = Math.ceil(forecastDays / 4)  // days between reviews

  const supabase = createServiceClient()

  const startDate = new Date()
  startDate.setDate(startDate.getDate() - daysBack)

  // ── 1. Get consumption + sale transactions in the lookback window ──────────
  const { data: txns, error: txErr } = await supabase
    .from('inventory_transactions')
    .select('product_id, quantity, transaction_type, created_at')
    .eq('org_id', auth.orgId)
    .in('transaction_type', ['consumption', 'sale'])
    .gte('created_at', startDate.toISOString())

  if (txErr) {
    console.error('[GET /api/forecasting] txns', txErr)
    return NextResponse.json({ error: 'Failed to fetch transaction history' }, { status: 500 })
  }

  // ── 2. Aggregate consumption per product ──────────────────────────────────
  const consumptionMap: Record<string, { total: number; activeDays: Set<string> }> = {}

  for (const t of txns ?? []) {
    const pid = t.product_id
    if (!consumptionMap[pid]) consumptionMap[pid] = { total: 0, activeDays: new Set() }
    consumptionMap[pid].total += Math.abs(t.quantity)
    consumptionMap[pid].activeDays.add(t.created_at.slice(0, 10))
  }

  const productIds = Object.keys(consumptionMap)
  if (productIds.length === 0) {
    return NextResponse.json({ data: [], count: 0, summary: {
      critical_count: 0, low_count: 0, adequate_count: 0, overstock_count: 0,
      total_projected_value: 0, total_reorder_value: 0,
    }, meta: { days_back: daysBack, forecast_days: forecastDays } })
  }

  // ── 3. Get current stock + product details (including lead time / safety stock) ──
  const { data: balances, error: balErr } = await supabase
    .from('inventory_balances')
    .select(`
      product_id, quantity, avg_cost,
      product:products(
        id, name, sku, unit_of_measure, reorder_point,
        lead_time_days, safety_stock, abc_class, xyz_class,
        supplier:suppliers(id, name, lead_time_days),
        category:categories(name)
      )
    `)
    .eq('org_id', auth.orgId)
    .in('product_id', productIds)

  if (balErr) {
    console.error('[GET /api/forecasting] balances', balErr)
    return NextResponse.json({ error: 'Failed to fetch inventory balances' }, { status: 500 })
  }

  // Aggregate balances per product
  const stockMap: Record<string, { qty: number; value: number; product: any }> = {}
  for (const b of balances ?? []) {
    const pid = b.product_id
    if (!stockMap[pid]) stockMap[pid] = { qty: 0, value: 0, product: b.product }
    stockMap[pid].qty   += Number(b.quantity)
    stockMap[pid].value += Number(b.quantity) * (Number(b.avg_cost) ?? 0)
  }

  // ── 4. Build forecast rows ────────────────────────────────────────────────
  const rows = productIds
    .map(pid => {
      const c = consumptionMap[pid]
      const s = stockMap[pid] ?? { qty: 0, value: 0, product: null }
      const p = s.product

      // Average daily consumption over the window
      const avgDaily = c.total / daysBack

      // Lead time: product override → supplier default → 7 days fallback
      const leadTime = p?.lead_time_days ?? p?.supplier?.lead_time_days ?? 7

      // Safety stock: product field or 0
      const safetyStock = p?.safety_stock ?? 0

      // Reorder point: avg_daily × (lead_time + review_period) + safety_stock
      const reorderPoint = Math.ceil(avgDaily * (leadTime + reviewPeriod) + safetyStock)

      // Projected demand
      const projectedQty   = Math.ceil(avgDaily * forecastDays)
      const unitCost       = s.qty > 0 ? s.value / s.qty : 0
      const projectedValue = projectedQty * unitCost

      // Days of stock remaining at current burn rate
      const daysRemaining = avgDaily > 0 ? Math.floor(s.qty / avgDaily) : null

      // How much to order to cover forecast window beyond reorder point
      const suggestedReorder = Math.max(0, projectedQty + safetyStock - s.qty)

      // Status now based on reorder point rather than just days
      let forecastStatus: 'critical' | 'low' | 'adequate' | 'overstock' | 'no_movement'
      if (daysRemaining === null) {
        forecastStatus = 'no_movement'
      } else if (s.qty <= 0 || (daysRemaining !== null && daysRemaining <= leadTime)) {
        // Out of stock or will run out before supplier can deliver
        forecastStatus = 'critical'
      } else if (s.qty <= reorderPoint) {
        // At or below the lead-time-aware reorder point
        forecastStatus = 'low'
      } else if (daysRemaining !== null && daysRemaining > forecastDays * 3) {
        forecastStatus = 'overstock'
      } else {
        forecastStatus = 'adequate'
      }

      return {
        product:           p,
        avg_daily:         Math.round(avgDaily * 100) / 100,
        total_consumed:    c.total,
        active_days:       c.activeDays.size,
        current_stock:     s.qty,
        stock_value:       Math.round(s.value * 100) / 100,
        projected_qty:     projectedQty,
        projected_value:   Math.round(projectedValue * 100) / 100,
        days_remaining:    daysRemaining,
        lead_time_days:    leadTime,
        safety_stock:      safetyStock,
        reorder_point:     reorderPoint,
        suggested_reorder: suggestedReorder,
        forecast_status:   forecastStatus,
      }
    })
    .sort((a, b) => {
      const order = { critical: 0, low: 1, no_movement: 2, adequate: 3, overstock: 4 }
      return (order[a.forecast_status] ?? 5) - (order[b.forecast_status] ?? 5)
    })

  // ── 5. Summary stats ─────────────────────────────────────────────────────
  const summary = {
    critical_count:  rows.filter(r => r.forecast_status === 'critical').length,
    low_count:       rows.filter(r => r.forecast_status === 'low').length,
    adequate_count:  rows.filter(r => r.forecast_status === 'adequate').length,
    overstock_count: rows.filter(r => r.forecast_status === 'overstock').length,
    total_projected_value: Math.round(rows.reduce((s, r) => s + r.projected_value, 0) * 100) / 100,
    total_reorder_value:   Math.round(
      rows.filter(r => r.suggested_reorder > 0)
          .reduce((s, r) => s + r.suggested_reorder * (r.stock_value / Math.max(1, r.current_stock) || 0), 0) * 100
    ) / 100,
  }

  return NextResponse.json({
    data: rows,
    count: rows.length,
    summary,
    meta: { days_back: daysBack, forecast_days: forecastDays, review_period: reviewPeriod },
  })
}
