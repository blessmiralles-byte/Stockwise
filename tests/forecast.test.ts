import { describe, it, expect } from 'vitest'
import { weeklyUsage, smooth, trendOf, forecastItem, type ForecastInput } from '@/lib/forecast'

const TODAY = '2026-11-10'
const dayOffset = (n: number) => new Date(Date.parse(TODAY + 'T00:00:00Z') + n * 86_400_000).toISOString().slice(0, 10)

/** Usage of `perDay` on each of the last `n` days, today included. */
function steady(n: number, perDay = 1): Record<string, number> {
  const out: Record<string, number> = {}
  for (let i = 0; i < n; i++) out[dayOffset(-i)] = perDay
  return out
}

/** Usage from a list of weekly totals, oldest first, all booked on one day of each week. */
function fromWeeks(weeks: number[]): Record<string, number> {
  const out: Record<string, number> = {}
  weeks.forEach((qty, i) => { if (qty) out[dayOffset(-((weeks.length - 1 - i) * 7))] = qty })
  return out
}

const base = (over: Partial<ForecastInput> = {}): ForecastInput => ({
  usageByDay: steady(56), daysBack: 56, stock: 30, leadTimeDays: 7,
  horizonDays: 30, today: TODAY, ...over,
})

describe('bucketing usage into weeks', () => {
  it('puts each day in its week, oldest first, and drops days before the window', () => {
    const weeks = weeklyUsage({
      [dayOffset(0)]: 1,     // today → newest week
      [dayOffset(-7)]: 1,    // a week ago → the one before
      [dayOffset(-27)]: 1,   // oldest day still inside 28 days
      [dayOffset(-28)]: 5,   // just outside
    }, 28, TODAY)
    expect(weeks).toEqual([1, 0, 1, 1])
  })

  it('ignores a date in the future', () => {
    expect(weeklyUsage({ [dayOffset(3)]: 9 }, 14, TODAY)).toEqual([0, 0])
  })

  // Issues are stored as negative quantities in places; usage is their size.
  it('counts the size of a movement, whatever its sign', () => {
    expect(weeklyUsage({ [dayOffset(0)]: -4 }, 7, TODAY)).toEqual([4])
  })
})

describe('smoothing', () => {
  it('leaves a flat series where it is', () => {
    expect(smooth([10, 10, 10])).toBe(10)
  })

  it('moves part of the way toward the newest value', () => {
    expect(smooth([0, 10], 0.3)).toBeCloseTo(3)
  })

  it('is zero for no history', () => {
    expect(smooth([])).toBe(0)
  })
})

describe('reading the trend', () => {
  it('says nothing on less than eight weeks', () => {
    expect(trendOf([5, 5, 5, 5, 9, 9, 9])).toEqual({ trend: null, pct: null })
  })

  it('calls a doubling rising', () => {
    expect(trendOf([10, 10, 10, 10, 20, 20, 20, 20])).toEqual({ trend: 'rising', pct: 100 })
  })

  it('calls a halving falling', () => {
    expect(trendOf([20, 20, 20, 20, 10, 10, 10, 10])).toEqual({ trend: 'falling', pct: -50 })
  })

  it('calls a small wobble steady', () => {
    expect(trendOf([10, 10, 10, 10, 11, 11, 11, 11]).trend).toBe('steady')
  })

  it('calls a new item with no earlier usage rising, without inventing a percentage', () => {
    expect(trendOf([0, 0, 0, 0, 5, 5, 5, 5])).toEqual({ trend: 'rising', pct: null })
  })
})

describe('forecasting a steady item', () => {
  // 1 a day, 30 on hand, a week's lead time, nothing on order.
  const r = forecastItem(base())

  it('uses the steady rate', () => {
    expect(r.avg_daily).toBe(1)
    expect(r.forecast_daily).toBe(1)
    expect(r.trend).toBe('steady')
  })

  it('needs no safety stock when usage never varies', () => {
    expect(r.safety_stock).toBe(0)
    expect(r.safety_stock_source).toBe('calculated')
    expect(r.reorder_point).toBe(7)
  })

  it('runs out in thirty days, and says the date', () => {
    expect(r.days_remaining).toBe(30)
    expect(r.stockout_date).toBe(dayOffset(30))
  })

  it('gives the last day to order as a lead time before that', () => {
    expect(r.order_by).toBe(dayOffset(23))
  })

  it('projects the balance to zero at the end of a 30-day horizon, with nothing short', () => {
    expect(r.projected_demand).toBe(30)
    expect(r.projected_balance).toBe(0)
    expect(r.projected_shortfall).toBe(0)
    expect(r.status).toBe('adequate')
  })

  it('gives a balance for each week of the horizon, and its last day', () => {
    expect(r.weekly_balance.map(w => w.balance)).toEqual([23, 16, 9, 2, 0])
    expect(r.weekly_balance.at(-1)!.date).toBe(dayOffset(30))
  })
})

describe('what is already on order', () => {
  // The old forecast told the buyer to order again for stock arriving Thursday.
  it('counts a delivery when it is due, pushing the run-out date back', () => {
    const without = forecastItem(base({ stock: 10 }))
    const withPo  = forecastItem(base({ stock: 10, incoming: [{ date: dayOffset(5), quantity: 50 }] }))

    expect(without.days_remaining).toBe(10)
    expect(withPo.days_remaining).toBe(60)
    expect(withPo.on_order).toBe(50)
    expect(withPo.projected_balance).toBe(30)
  })

  it('does not suggest ordering what is already coming', () => {
    const without = forecastItem(base({ stock: 10 }))
    const withPo  = forecastItem(base({ stock: 10, incoming: [{ date: dayOffset(5), quantity: 50 }] }))
    expect(without.suggested_order).toBe(20)
    expect(withPo.suggested_order).toBe(0)
  })

  it('still flags a gap when the delivery lands after the shelf is empty', () => {
    const r = forecastItem(base({ stock: 3, incoming: [{ date: dayOffset(7), quantity: 100 }] }))
    expect(r.status).toBe('critical')
    expect(r.stockout_date).toBe(dayOffset(3))
    expect(r.projected_shortfall).toBe(3)   // days 4, 5 and 6
  })

  // Overdue or undated: assume a lead time away, not here and not never.
  it('treats an overdue delivery as a lead time away', () => {
    const overdue = forecastItem(base({ stock: 3, incoming: [{ date: dayOffset(-10), quantity: 100 }] }))
    const undated = forecastItem(base({ stock: 3, incoming: [{ date: null, quantity: 100 }] }))
    expect(overdue.projected_shortfall).toBe(3)
    expect(undated.projected_shortfall).toBe(3)
    expect(overdue.projected_balance).toBeGreaterThan(0)
  })

  it('ignores an empty or negative line', () => {
    expect(forecastItem(base({ incoming: [{ date: dayOffset(2), quantity: 0 }, { date: null, quantity: -5 }] })).on_order).toBe(0)
  })
})

describe('safety stock', () => {
  it('uses the figure set on the item when there is one', () => {
    const r = forecastItem(base({ safetyStockSet: 12 }))
    expect(r.safety_stock).toBe(12)
    expect(r.safety_stock_source).toBe('set')
    expect(r.reorder_point).toBe(19)
  })

  it('works one out for an item used in lurches', () => {
    const lumpy = forecastItem(base({ usageByDay: fromWeeks([0, 14, 0, 14, 0, 14, 0, 14]) }))
    expect(lumpy.safety_stock).toBeGreaterThan(0)
    expect(lumpy.safety_stock_source).toBe('calculated')
  })

  it('moves the order-by date earlier to protect the margin', () => {
    const none = forecastItem(base())
    const some = forecastItem(base({ safetyStockSet: 10 }))
    expect(some.order_by! < none.order_by!).toBe(true)
  })
})

describe('recent weeks count for more', () => {
  // Six quiet weeks, then usage triples.
  const r = forecastItem(base({ usageByDay: fromWeeks([7, 7, 7, 7, 7, 7, 21, 21]), stock: 100 }))

  it('forecasts above the plain average', () => {
    expect(r.avg_daily).toBe(1.5)
    expect(r.forecast_daily).toBeGreaterThan(1.9)
  })

  it('reports the rise', () => {
    expect(r.trend).toBe('rising')
    expect(r.trend_pct).toBe(100)
  })
})

describe('a step change in usage', () => {
  // Smoothing alone blends the old rate with the new and under-orders.
  it('forecasts a stepped-up item at its current rate, not a blend with the old one', () => {
    const r = forecastItem(base({ usageByDay: fromWeeks([28, 28, 28, 28, 28, 63, 63, 63]), stock: 500 }))
    // last four weeks average (28 + 63×3) / 4 = 54.25 a week
    expect(r.forecast_daily).toBe(7.75)
  })

  it('follows a fall cautiously, staying above the newest weeks', () => {
    const r = forecastItem(base({ usageByDay: fromWeeks([63, 63, 63, 63, 63, 28, 28, 28]), stock: 500 }))
    expect(r.forecast_daily).toBeGreaterThan(28 / 7)
    expect(r.forecast_daily).toBeLessThan(63 / 7)
  })

  // Weeks before an item's first use are not evidence that demand is low.
  it('does not count the weeks before a new item was first used', () => {
    const fresh = forecastItem(base({ usageByDay: fromWeeks([0, 0, 0, 0, 0, 21, 21, 21]), stock: 100 }))
    expect(fresh.forecast_daily).toBe(3)
    // Too little history of its own to call a trend.
    expect(fresh.trend).toBe(null)
  })
})

describe('status', () => {
  it('is critical with nothing on the shelf', () => {
    const r = forecastItem(base({ stock: 0 }))
    expect(r.status).toBe('critical')
    expect(r.days_remaining).toBe(0)
    expect(r.stockout_date).toBe(TODAY)
  })

  it('is critical when it will run out before a new order could arrive', () => {
    expect(forecastItem(base({ stock: 5 })).status).toBe('critical')
  })

  it('is low when the order has to go in this week', () => {
    const r = forecastItem(base({ stock: 12 }))
    expect(r.order_by).toBe(dayOffset(5))
    expect(r.status).toBe('low')
  })

  it('is overstocked with more than three horizons on hand', () => {
    expect(forecastItem(base({ stock: 200 })).status).toBe('overstock')
  })

  it('has nothing to say about an item that is not used', () => {
    const r = forecastItem(base({ usageByDay: {} }))
    expect(r.status).toBe('no_movement')
    expect(r.stockout_date).toBe(null)
    expect(r.order_by).toBe(null)
    expect(r.suggested_order).toBe(0)
    expect(r.projected_balance).toBe(30)
  })

  it('never gives an order-by date in the past', () => {
    expect(forecastItem(base({ stock: 2 })).order_by).toBe(TODAY)
  })
})

describe('thin history', () => {
  it('falls back to the plain average with under two weeks', () => {
    const r = forecastItem(base({ usageByDay: steady(10, 2), daysBack: 10 }))
    expect(r.forecast_daily).toBe(2)
    expect(r.trend).toBe(null)
  })
})
