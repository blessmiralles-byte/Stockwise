import { describe, it, expect } from 'vitest'
import {
  SAMPLE, SAMPLE_PREFIX, SAMPLE_DELETE_ORDER, sampleStockValue, sampleLowStock,
} from '@/lib/sample-data'
import { belowReorderPoint } from '@/lib/reorder'

describe('the sample dataset holds together', () => {
  const locationKeys = new Set(SAMPLE.locations.map(l => l.key))
  const categoryKeys = new Set(SAMPLE.categories.map(c => c.key))
  const vendorKeys   = new Set(SAMPLE.vendors.map(v => v.key))
  const productKeys  = new Set(SAMPLE.products.map(p => p.key))

  it('has unique keys per entity', () => {
    expect(locationKeys.size).toBe(SAMPLE.locations.length)
    expect(categoryKeys.size).toBe(SAMPLE.categories.length)
    expect(vendorKeys.size).toBe(SAMPLE.vendors.length)
    expect(productKeys.size).toBe(SAMPLE.products.length)
  })

  it('points every product at a real category, vendor and location', () => {
    for (const p of SAMPLE.products) {
      expect(categoryKeys.has(p.category), `${p.key} category`).toBe(true)
      expect(vendorKeys.has(p.vendor), `${p.key} vendor`).toBe(true)
      for (const line of p.stock) expect(locationKeys.has(line.location), `${p.key} location`).toBe(true)
    }
  })

  it('points every asset at a real category and location', () => {
    for (const a of SAMPLE.assets) {
      expect(categoryKeys.has(a.category)).toBe(true)
      expect(locationKeys.has(a.location)).toBe(true)
    }
  })

  it('builds the draft purchase order from real products and its vendor', () => {
    expect(vendorKeys.has(SAMPLE.purchaseOrder.vendor)).toBe(true)
    for (const l of SAMPLE.purchaseOrder.lines) {
      expect(productKeys.has(l.product)).toBe(true)
      expect(l.qty).toBeGreaterThan(0)
    }
  })

  it('uses unique SKUs and asset tags', () => {
    const skus = SAMPLE.products.map(p => p.sku)
    const tags = SAMPLE.assets.map(a => a.tag)
    expect(new Set(skus).size).toBe(skus.length)
    expect(new Set(tags).size).toBe(tags.length)
  })

  // Every row must be recognisable on screen as not-their-data.
  it('labels everything as sample', () => {
    const names = [
      ...SAMPLE.locations.map(l => l.name), ...SAMPLE.categories.map(c => c.name),
      ...SAMPLE.vendors.map(v => v.name), ...SAMPLE.products.map(p => p.name),
      ...SAMPLE.assets.map(a => a.name),
    ]
    for (const n of names) expect(n.startsWith(SAMPLE_PREFIX), n).toBe(true)
  })

  it('prices every stock line and keeps quantities sensible', () => {
    for (const p of SAMPLE.products) {
      for (const line of p.stock) {
        expect(line.qty).toBeGreaterThan(0)
        expect(line.unit_cost).toBeGreaterThan(0)
      }
    }
    expect(sampleStockValue()).toBeGreaterThan(0)
  })
})

describe('the sample shows the features working', () => {
  // The point of loading it is to see the app doing something, so the data
  // must trip the reorder logic rather than sit uniformly healthy.
  it('leaves some items below their reorder point, including one at zero', () => {
    const low = sampleLowStock()
    expect(low.length).toBeGreaterThan(0)
    expect(low).toContain('sealant')   // nothing on hand
    expect(low).toContain('cable')     // below its line
  })

  it('agrees with the real reorder check', () => {
    const lines = SAMPLE.products.flatMap(p =>
      (p.stock.length ? p.stock : [{ location: 'none', qty: 0, unit_cost: 0 }]).map(s => ({
        product_id: p.key,
        quantity: s.qty,
        product: { name: p.name, reorder_point: p.reorder_point, keep_in_stock: p.keep_in_stock },
      })),
    )
    const flagged = belowReorderPoint(lines).map(c => c.product_id).sort()
    expect(flagged).toEqual(sampleLowStock().sort())
  })

  it('leaves healthy items alone', () => {
    expect(sampleLowStock()).not.toContain('pipe')
    expect(sampleLowStock()).not.toContain('elbow')
  })
})

describe('removal order', () => {
  it('deletes children before parents', () => {
    const order = SAMPLE_DELETE_ORDER as readonly string[]
    const before = (child: string, parent: string) =>
      expect(order.indexOf(child), `${child} before ${parent}`).toBeLessThan(order.indexOf(parent))

    before('purchase_order_lines', 'purchase_orders')
    before('purchase_orders', 'suppliers')
    before('inventory_transactions', 'products')
    before('inventory_balances', 'products')
    before('reorder_alerts', 'products')
    before('fixed_assets', 'categories')
    before('products', 'categories')
    before('products', 'suppliers')
    before('inventory_balances', 'locations')
  })
})
