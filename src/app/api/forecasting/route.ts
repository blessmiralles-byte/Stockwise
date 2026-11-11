import { NextRequest, NextResponse } from 'next/server'
import { requireFeature } from '@/lib/entitlements-server'
import { createServiceClient } from '@/lib/supabase/service'
import { fetchAllPaged } from '@/lib/fetch-paged'
import { requireAuth } from '@/lib/api-auth'
import { forecastItem } from '@/lib/forecast'

/**
 * GET /api/forecasting
 * Demand forecast and projected stock balance per item.
 *
 * Query params:
 *   days_back     - history to learn from (default 90)
 *   forecast_days - how far forward to project (default 30)
 *
 * The method is in lib/forecast.ts: recent weeks weigh more than old ones,
 * open purchase orders are counted when they are due, safety stock is sized
 * from how variable the item's usage is (unless set by hand), and each item
 * gets a run-out date and an order-by date.
 */

/** Used when neither the item nor its vendor has a lead time. */
const DEFAULT_LEAD_DAYS = 7

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const gate = await requireFeature(auth.orgId, 'forecasting')
  if (gate) return gate

  const { searchParams } = new URL(req.url)
  const daysBack     = Math.max(7,  Math.min(365, parseInt(searchParams.get('days_back')     ?? '90')))
  const forecastDays = Math.max(7,  Math.min(180, parseInt(searchParams.get('forecast_days') ?? '30')))

  const supabase = createServiceClient()
  const today = new Date().toISOString().slice(0, 10)
  const startDate = new Date(Date.now() - daysBack * 86_400_000)

  // ── 1. Usage in the lookback window ───────────────────────────────────────
  // Paged: a forecast built on the first N rows of the window, presented as a
  // forecast on the whole window, is worse than no forecast.
  const { rows: txns, truncated, error: txErr } = await fetchAllPaged<any>((from, to) =>
    supabase
      .from('inventory_transactions')
      .select('product_id, quantity, transaction_type, created_at')
      .eq('org_id', auth.orgId)
      .in('transaction_type', ['consumption', 'sale'])
      .gte('created_at', startDate.toISOString())
      .order('id')
      .range(from, to))

  if (txErr) {
    console.error('[GET /api/forecasting] txns', txErr)
    return NextResponse.json({ error: 'Failed to fetch transaction history' }, { status: 500 })
  }

  const usage: Record<string, { byDay: Record<string, number>; total: number }> = {}
  for (const t of txns ?? []) {
    const u = (usage[t.product_id] ??= { byDay: {}, total: 0 })
    const day = String(t.created_at).slice(0, 10)
    const qty = Math.abs(Number(t.quantity))
    u.byDay[day] = (u.byDay[day] ?? 0) + qty
    u.total += qty
  }

  const productIds = Object.keys(usage)
  if (productIds.length === 0) {
    return NextResponse.json({ data: [], count: 0, summary: {
      critical_count: 0, low_count: 0, adequate_count: 0, overstock_count: 0,
      total_projected_value: 0, total_reorder_value: 0, on_order_value: 0,
    }, meta: { days_back: daysBack, forecast_days: forecastDays } })
  }

  // ── 2. Stock on hand, item details, and what is already on order ──────────
  const [balancesRes, openPosRes] = await Promise.all([
    fetchAllPaged<any>((from, to) => supabase
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
      .order('product_id')
      .order('location_id')
      .range(from, to)),
    // Orders placed and not fully in. Their outstanding lines are stock on its way.
    fetchAllPaged<any>((from, to) => supabase
      .from('purchase_orders')
      .select('id, expected_date, lines:purchase_order_lines(product_id, quantity_ordered, quantity_received, unit_cost)')
      .eq('org_id', auth.orgId)
      .in('status', ['approved', 'sent', 'partial'])
      .order('id')
      .range(from, to)),
  ])

  if (balancesRes.error) {
    console.error('[GET /api/forecasting] balances', balancesRes.error)
    return NextResponse.json({ error: 'Failed to fetch inventory balances' }, { status: 500 })
  }

  const stockMap: Record<string, { qty: number; value: number; product: any }> = {}
  for (const b of balancesRes.rows) {
    const s = (stockMap[b.product_id] ??= { qty: 0, value: 0, product: b.product })
    s.qty   += Number(b.quantity)
    s.value += Number(b.quantity) * Number(b.avg_cost ?? 0)
  }

  const incoming: Record<string, { date: string | null; quantity: number }[]> = {}
  // A failed read of open orders degrades to "nothing on order" — the forecast
  // is still worth having, just more cautious.
  for (const po of openPosRes.error ? [] : openPosRes.rows) {
    for (const l of po.lines ?? []) {
      const outstanding = Number(l.quantity_ordered) - Number(l.quantity_received)
      if (!l.product_id || outstanding <= 0) continue
      ;(incoming[l.product_id] ??= []).push({
        date: po.expected_date ? String(po.expected_date).slice(0, 10) : null,
        quantity: outstanding,
      })
    }
  }

  // ── 3. Forecast each item ─────────────────────────────────────────────────
  const order = { critical: 0, low: 1, no_movement: 2, adequate: 3, overstock: 4 }
  const rows = productIds
    .map(pid => {
      const s = stockMap[pid] ?? { qty: 0, value: 0, product: null }
      const p = s.product
      // Lead time: item override → vendor default → a week.
      const leadTime = p?.lead_time_days ?? p?.supplier?.lead_time_days ?? DEFAULT_LEAD_DAYS
      const unitCost = s.qty > 0 ? s.value / s.qty : 0

      const f = forecastItem({
        usageByDay: usage[pid].byDay,
        daysBack,
        stock: s.qty,
        leadTimeDays: leadTime,
        safetyStockSet: p?.safety_stock,
        incoming: incoming[pid],
        horizonDays: forecastDays,
        today,
      })

      return {
        product:           p,
        total_consumed:    usage[pid].total,
        active_days:       Object.keys(usage[pid].byDay).length,
        current_stock:     s.qty,
        stock_value:       Math.round(s.value * 100) / 100,
        unit_cost:         Math.round(unitCost * 100) / 100,
        lead_time_days:    leadTime,
        avg_daily:         f.avg_daily,
        forecast_daily:    f.forecast_daily,
        trend:             f.trend,
        trend_pct:         f.trend_pct,
        safety_stock:      f.safety_stock,
        safety_stock_source: f.safety_stock_source,
        reorder_point:     f.reorder_point,
        on_order:          f.on_order,
        projected_qty:     f.projected_demand,
        projected_value:   Math.round(f.projected_demand * unitCost * 100) / 100,
        projected_balance: f.projected_balance,
        projected_shortfall: f.projected_shortfall,
        days_remaining:    f.days_remaining,
        stockout_date:     f.stockout_date,
        order_by:          f.order_by,
        suggested_reorder: f.suggested_order,
        forecast_status:   f.status,
        weekly_balance:    f.weekly_balance,
      }
    })
    .sort((a, b) =>
      (order[a.forecast_status] ?? 5) - (order[b.forecast_status] ?? 5) ||
      // Within a status, the one that runs out soonest comes first.
      (a.days_remaining ?? Infinity) - (b.days_remaining ?? Infinity))

  // ── 4. Summary ────────────────────────────────────────────────────────────
  const sum = (f: (r: typeof rows[number]) => number) => Math.round(rows.reduce((s, r) => s + f(r), 0) * 100) / 100
  const summary = {
    critical_count:  rows.filter(r => r.forecast_status === 'critical').length,
    low_count:       rows.filter(r => r.forecast_status === 'low').length,
    adequate_count:  rows.filter(r => r.forecast_status === 'adequate').length,
    overstock_count: rows.filter(r => r.forecast_status === 'overstock').length,
    total_projected_value: sum(r => r.projected_value),
    total_reorder_value:   sum(r => r.suggested_reorder * r.unit_cost),
    on_order_value:        sum(r => r.on_order * r.unit_cost),
  }

  return NextResponse.json({
    data: rows,
    count: rows.length,
    summary,
    meta: {
      days_back: daysBack, forecast_days: forecastDays,
      // A forecast on part of the window is flagged, not quietly served.
      ...(truncated || balancesRes.truncated ? { partial: true } : {}),
    },
  })
}
