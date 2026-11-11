/**
 * Demand forecast and projected stock balance, per item.
 *
 * The first version divided total usage by the number of days and stopped
 * there. That has four blind spots, each of which produces a confident wrong
 * answer:
 *
 *   1. It weighs last quarter the same as last week, so an item whose usage
 *      has doubled looks fine until it runs out.
 *   2. It ignores what is already on order, so it tells the buyer to order
 *      again for a delivery arriving on Thursday.
 *   3. Safety stock was whatever someone typed (usually nothing), whether the
 *      item is used steadily or in lurches.
 *   4. It gave "days remaining" but not a date, and not the date that matters
 *      to a buyer: the last day an order can be placed and still arrive in time.
 *
 * So this one:
 *   - smooths weekly usage so recent weeks count for more, and reports the trend;
 *   - nets open purchase orders into a day-by-day projected balance;
 *   - sizes safety stock from how variable the item's usage actually is, unless
 *     one has been set by hand;
 *   - gives the run-out date and the order-by date.
 *
 * Pure. Dates are 'YYYY-MM-DD'; `today` is passed in.
 */

const DAY_MS = 86_400_000
const toDay  = (d: string) => Date.parse(d.slice(0, 10) + 'T00:00:00Z')
const iso    = (ms: number) => new Date(ms).toISOString().slice(0, 10)

/** Weight given to the newest week when smoothing. Higher reacts faster, and to noise. */
export const SMOOTHING_ALPHA = 0.3
/** z-score for a ~95% chance of not running out during the lead time. */
export const SERVICE_Z = 1.65
/** Trend is called only beyond this change, recent weeks against earlier ones. */
export const TREND_THRESHOLD = 0.2

export interface ForecastInput {
  /** Usage by day ('YYYY-MM-DD' → quantity) inside the lookback window. */
  usageByDay: Record<string, number>
  /** Days of history the window covers. */
  daysBack: number
  stock: number
  leadTimeDays: number
  /** Set by hand on the item; 0 or null means "work it out". */
  safetyStockSet?: number | null
  /** Open purchase order quantities still to arrive. */
  incoming?: { date: string | null; quantity: number }[]
  /** How far forward to project. */
  horizonDays: number
  today: string
}

export type ForecastStatus = 'critical' | 'low' | 'adequate' | 'overstock' | 'no_movement'
export type Trend = 'rising' | 'falling' | 'steady' | null

export interface ForecastResult {
  /** Plain average over the whole window. */
  avg_daily: number
  /** Smoothed rate the projection uses. */
  forecast_daily: number
  trend: Trend
  /** Recent weeks against earlier ones, as a percentage. Null without enough history. */
  trend_pct: number | null
  safety_stock: number
  safety_stock_source: 'set' | 'calculated'
  reorder_point: number
  on_order: number
  projected_demand: number
  /** Stock at the end of the horizon, after usage and deliveries. Never below zero. */
  projected_balance: number
  /** Demand in the horizon that the projection could not supply. */
  projected_shortfall: number
  /** First day the projection runs dry. Null if it doesn't within a year. */
  stockout_date: string | null
  days_remaining: number | null
  /** Last day to order and still have it arrive before stock dips into the safety margin. */
  order_by: string | null
  suggested_order: number
  status: ForecastStatus
  /** Projected balance at the end of each week of the horizon. */
  weekly_balance: { date: string; balance: number }[]
}

/** Usage summed into whole weeks, oldest first, ending today. Partial leading days are dropped. */
export function weeklyUsage(usageByDay: Record<string, number>, daysBack: number, today: string): number[] {
  const weeks = Math.floor(daysBack / 7)
  const end = toDay(today)
  const out = new Array(weeks).fill(0)
  for (const [day, qty] of Object.entries(usageByDay)) {
    const age = Math.floor((end - toDay(day)) / DAY_MS)        // 0 = today
    if (age < 0) continue
    const weekFromEnd = Math.floor(age / 7)
    if (weekFromEnd >= weeks) continue
    out[weeks - 1 - weekFromEnd] += Math.abs(Number(qty) || 0)
  }
  return out
}

/** Simple exponential smoothing; the result is the expected next value. */
export function smooth(series: number[], alpha = SMOOTHING_ALPHA): number {
  if (series.length === 0) return 0
  let level = series[0]
  for (let i = 1; i < series.length; i++) level = alpha * series[i] + (1 - alpha) * level
  return level
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0)
function stdDev(xs: number[]): number {
  if (xs.length < 2) return 0
  const m = mean(xs)
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1))
}

/** Recent four weeks against everything earlier. Needs eight weeks to say anything. */
export function trendOf(weeks: number[]): { trend: Trend; pct: number | null } {
  if (weeks.length < 8) return { trend: null, pct: null }
  const recent  = mean(weeks.slice(-4))
  const earlier = mean(weeks.slice(0, -4))
  if (earlier === 0) return recent > 0 ? { trend: 'rising', pct: null } : { trend: 'steady', pct: 0 }
  const change = (recent - earlier) / earlier
  return {
    trend: change > TREND_THRESHOLD ? 'rising' : change < -TREND_THRESHOLD ? 'falling' : 'steady',
    pct: Math.round(change * 100),
  }
}

export function forecastItem(input: ForecastInput): ForecastResult {
  const { daysBack, horizonDays, today } = input
  const stock    = Math.max(0, Number(input.stock) || 0)
  const leadTime = Math.max(0, Math.round(Number(input.leadTimeDays) || 0))
  const start    = toDay(today)

  const total    = Object.values(input.usageByDay).reduce((s, q) => s + Math.abs(Number(q) || 0), 0)
  const avgDaily = daysBack > 0 ? total / daysBack : 0

  // Weekly buckets absorb the day-to-day lumpiness of issuing to jobs.
  // Weeks before the item was first used aren't evidence of low demand — it
  // didn't exist yet, or wasn't stocked — so history starts at its first use.
  const allWeeks = weeklyUsage(input.usageByDay, daysBack, today)
  const firstUse = allWeeks.findIndex(w => w > 0)
  const weeks = firstUse === -1 ? [] : allWeeks.slice(firstUse)

  // Smoothing lags a change. Lagging a fall only means holding a little too
  // much; lagging a rise means running out. So the rate is never set below
  // the last four weeks' average — an item that has stepped up is forecast at
  // where it is now, not at a blend with where it was. With under two whole
  // weeks there is nothing to smooth: fall back to the plain average.
  const recent = mean(weeks.slice(-4))
  const daily = weeks.length >= 2 ? Math.max(smooth(weeks), recent) / 7 : avgDaily
  const { trend, pct } = trendOf(weeks)

  // Safety stock covers usage running hot during the wait for a delivery.
  const set = Number(input.safetyStockSet) || 0
  const sigmaDaily = stdDev(weeks) / Math.sqrt(7)
  const safety = set > 0 ? set : Math.ceil(SERVICE_Z * sigmaDaily * Math.sqrt(Math.max(1, leadTime)))

  // A delivery with no date, or one already overdue, is assumed a lead time
  // away: better than counting it as here, or pretending it isn't coming.
  const arrivals = new Map<number, number>()
  let onOrder = 0
  for (const inc of input.incoming ?? []) {
    const qty = Number(inc.quantity) || 0
    if (qty <= 0) continue
    onOrder += qty
    let offset = inc.date ? Math.round((toDay(inc.date) - start) / DAY_MS) : leadTime
    if (offset < 1) offset = Math.max(1, leadTime)
    arrivals.set(offset, (arrivals.get(offset) ?? 0) + qty)
  }

  // Walk forward a day at a time. Past the horizon only to find the dates.
  const SEARCH_DAYS = Math.max(horizonDays, 365)
  let balance = stock
  let shortfall = 0
  let stockoutOffset: number | null = stock <= 0 && daily > 0 ? 0 : null
  let safetyOffset:   number | null = daily > 0 && stock <= safety ? 0 : null
  let balanceAtHorizon = stock
  const weekly: { date: string; balance: number }[] = []

  for (let d = 1; d <= SEARCH_DAYS; d++) {
    balance += arrivals.get(d) ?? 0
    const supplied = Math.min(balance, daily)
    if (d <= horizonDays) shortfall += daily - supplied
    balance -= supplied

    if (daily > 0) {
      if (stockoutOffset == null && balance <= 0) stockoutOffset = d
      if (safetyOffset   == null && balance <= safety) safetyOffset = d
    }
    if (d <= horizonDays && (d % 7 === 0 || d === horizonDays)) {
      weekly.push({ date: iso(start + d * DAY_MS), balance: Math.round(balance * 100) / 100 })
    }
    if (d === horizonDays) balanceAtHorizon = balance
    if (d >= horizonDays && stockoutOffset != null && safetyOffset != null) break
  }

  const projectedDemand = Math.ceil(daily * horizonDays)
  // Order early enough that it lands before stock reaches the safety margin.
  const orderByOffset = safetyOffset == null ? null : safetyOffset - leadTime
  const reorderPoint = Math.ceil(daily * leadTime + safety)

  // Enough to cover the horizon and still hold the safety margin, less what
  // is on hand and already coming.
  const suggested = Math.max(0, Math.ceil(daily * horizonDays + safety - stock - onOrder))

  let status: ForecastStatus
  if (daily <= 0) status = 'no_movement'
  else if (stock <= 0 || (stockoutOffset != null && stockoutOffset <= leadTime)) status = 'critical'
  else if (orderByOffset != null && orderByOffset <= 7) status = 'low'            // order this week
  else if (stock / daily > horizonDays * 3) status = 'overstock'
  else status = 'adequate'

  return {
    avg_daily:      Math.round(avgDaily * 100) / 100,
    forecast_daily: Math.round(daily * 100) / 100,
    trend, trend_pct: pct,
    safety_stock: safety,
    safety_stock_source: set > 0 ? 'set' : 'calculated',
    reorder_point: reorderPoint,
    on_order: onOrder,
    projected_demand: projectedDemand,
    projected_balance: Math.max(0, Math.round(balanceAtHorizon * 100) / 100),
    // The small epsilon absorbs floating-point crumbs; max() keeps it from being -0.
    projected_shortfall: Math.max(0, Math.ceil(shortfall - 1e-9)),
    stockout_date:  stockoutOffset == null ? null : iso(start + stockoutOffset * DAY_MS),
    days_remaining: daily > 0 ? stockoutOffset : null,
    order_by:       orderByOffset == null ? null : iso(start + Math.max(0, orderByOffset) * DAY_MS),
    suggested_order: suggested,
    status,
    weekly_balance: weekly,
  }
}
