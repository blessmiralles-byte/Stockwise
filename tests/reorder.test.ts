import { describe, it, expect } from 'vitest'
import {
  stockByProduct, suggestedQty, belowReorderPoint, planReorderAlerts, groupByVendor, summarise,
} from '@/lib/reorder'

const line = (product_id: string, quantity: number, product: any = {}) => ({
  product_id, quantity,
  product: { name: product_id, reorder_point: 10, ...product },
})

describe('stock on hand', () => {
  it('sums a product across locations', () => {
    const map = stockByProduct([line('p1', 4), line('p1', 6), line('p2', 2)])
    expect(map.get('p1')!.qty).toBe(10)
    expect(map.get('p2')!.qty).toBe(2)
  })

  it('ignores lines with no product', () => {
    expect(stockByProduct([{ product_id: '', quantity: 5 } as any]).size).toBe(0)
  })
})

describe('what counts as low', () => {
  it('flags stock at or below the reorder point', () => {
    const low = belowReorderPoint([line('at', 10), line('below', 3), line('above', 11)])
    expect(low.map(l => l.product_id)).toEqual(['below', 'at'])
  })

  // A reorder point of zero means "not managed this way" — flagging those would
  // bury the real ones.
  it('ignores products with no reorder point', () => {
    const low = belowReorderPoint([
      line('unmanaged', 0, { reorder_point: 0 }),
      line('nulled', 0, { reorder_point: null }),
    ])
    expect(low).toHaveLength(0)
  })

  it('puts out-of-stock first, then the furthest below', () => {
    const low = belowReorderPoint([line('low', 8), line('empty', 0), line('lower', 2)])
    expect(low.map(l => l.product_id)).toEqual(['empty', 'lower', 'low'])
  })

  it('carries the vendor and lead time for the draft PO', () => {
    const [item] = belowReorderPoint([line('p', 1, {
      supplier_id: 'v1', supplier: { id: 'v1', name: 'Acme', lead_time_days: 5 },
    })])
    expect(item).toMatchObject({ vendor_id: 'v1', vendor_name: 'Acme', lead_time_days: 5 })
  })

  it('falls back to the vendor’s lead time when the product has none', () => {
    const [item] = belowReorderPoint([line('p', 1, { supplier: { id: 'v', lead_time_days: 9 } })])
    expect(item.lead_time_days).toBe(9)
  })
})

describe('how much to order', () => {
  it('uses the product’s own reorder quantity when set', () => {
    expect(suggestedQty(2, 10, 50)).toBe(50)
  })

  it('otherwise tops up to twice the reorder point', () => {
    expect(suggestedQty(4, 10)).toBe(16)   // 20 - 4
    expect(suggestedQty(0, 25)).toBe(50)
  })

  it('never suggests zero or a negative quantity', () => {
    expect(suggestedQty(100, 10)).toBeGreaterThan(0)
    expect(suggestedQty(0, 0)).toBeGreaterThan(0)
  })

  it('rounds part-units up — you cannot order half a box', () => {
    expect(Number.isInteger(suggestedQty(1.5, 7.5))).toBe(true)
  })
})

describe('deciding what to alert on', () => {
  const low = belowReorderPoint([line('a', 1), line('b', 2), line('c', 3)])

  it('opens alerts for newly crossed items', () => {
    const plan = planReorderAlerts(low, [])
    expect(plan.toOpen.map(c => c.product_id).sort()).toEqual(['a', 'b', 'c'])
    expect(plan.stillOpen).toHaveLength(0)
  })

  // The point of the table: procurement hears about an item once.
  it('does not re-alert an item that is already open', () => {
    const plan = planReorderAlerts(low, [{ product_id: 'a', status: 'open' }])
    expect(plan.toOpen.map(c => c.product_id).sort()).toEqual(['b', 'c'])
    expect(plan.stillOpen.map(c => c.product_id)).toEqual(['a'])
  })

  it('stays quiet while a PO covers it', () => {
    const plan = planReorderAlerts(low, [{ product_id: 'b', status: 'ordered' }])
    expect(plan.toOpen.map(c => c.product_id)).not.toContain('b')
  })

  it('closes the alert when stock recovers', () => {
    const plan = planReorderAlerts(low, [{ product_id: 'gone', status: 'open' }])
    expect(plan.toResolve).toEqual(['gone'])
  })

  it('re-alerts after a resolved alert, when it dips again', () => {
    const plan = planReorderAlerts(low, [{ product_id: 'a', status: 'resolved' }])
    expect(plan.toOpen.map(c => c.product_id)).toContain('a')
  })

  it('does nothing when nothing is low', () => {
    expect(planReorderAlerts([], [])).toEqual({ toOpen: [], stillOpen: [], toResolve: [] })
  })
})

describe('grouping into draft purchase orders', () => {
  const items = belowReorderPoint([
    line('p1', 1, { supplier_id: 'v1', supplier: { id: 'v1', name: 'Acme' } }),
    line('p2', 1, { supplier_id: 'v1', supplier: { id: 'v1', name: 'Acme' } }),
    line('p3', 1, { supplier_id: 'v2', supplier: { id: 'v2', name: 'Bolt Co' } }),
    line('p4', 1),
  ])

  it('makes one order per vendor', () => {
    const { vendors } = groupByVendor(items)
    expect(vendors).toHaveLength(2)
    expect(vendors.find(v => v.vendor_id === 'v1')!.items).toHaveLength(2)
  })

  it('leaves items with no vendor for procurement to assign', () => {
    const { unassigned } = groupByVendor(items)
    expect(unassigned.map(i => i.product_id)).toEqual(['p4'])
  })

  it('handles an empty list', () => {
    expect(groupByVendor([])).toEqual({ vendors: [], unassigned: [] })
  })
})

describe('digest wording', () => {
  it('counts items, and calls out anything at zero', () => {
    expect(summarise(belowReorderPoint([line('a', 3)]))).toBe('1 item below reorder point')
    expect(summarise(belowReorderPoint([line('a', 0), line('b', 3)])))
      .toBe('2 items below reorder point, 1 out of stock')
  })
})
