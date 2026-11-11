import { describe, it, expect } from 'vitest'
import {
  openPurchaseOrders, vendorPerformance, purchaseSpend, receivedNotInvoiced, daysBetween,
  type Po, type Receipt, type ReceiptLine,
} from '@/lib/procurement-reports'
import { slowMovingStock, stockAdjustments, bucketFor, type StockItem, type AdjustmentTx } from '@/lib/inventory-reports'

const TODAY = '2026-11-10'
const ACME = { id: 'v-acme', name: 'Acme Supply', lead_time_days: 5 }
const BOLT = { id: 'v-bolt', name: 'Bolt & Co', lead_time_days: 10 }

const line = (ordered: number, received: number, cost = 10, sku = 'A') => ({
  product_id: 'p-' + sku, quantity_ordered: ordered, quantity_received: received, unit_cost: cost,
  product: { sku, name: 'Item ' + sku, unit_of_measure: 'pcs' },
})

const po = (o: Partial<Po> & { id: string }): Po => ({
  po_number: 'PO-' + o.id, status: 'sent', created_at: '2026-10-01T08:00:00Z',
  order_date: '2026-10-01', expected_date: '2026-10-15', supplier: ACME, lines: [line(10, 0)], ...o,
})

describe('counting days', () => {
  it('counts whole days, ignoring the time of day', () => {
    expect(daysBetween('2026-11-01T23:59:00Z', '2026-11-10T00:01:00Z')).toBe(9)
    expect(daysBetween('2026-11-10', '2026-11-01')).toBe(-9)
  })
})

describe('open purchase orders', () => {
  it('lists what is still to arrive, with its value', () => {
    const [r] = openPurchaseOrders([po({ id: '1', lines: [line(10, 4, 25)] })], TODAY)
    expect(r).toMatchObject({ outstanding_qty: 6, outstanding_value: 150, ordered_value: 250, received_pct: 40 })
  })

  it('says how late an order is against its expected date', () => {
    const [r] = openPurchaseOrders([po({ id: '1', expected_date: '2026-11-03' })], TODAY)
    expect(r.days_late).toBe(7)
  })

  it('is not late before its date, or without one', () => {
    const rows = openPurchaseOrders([
      po({ id: '1', expected_date: '2026-11-20' }),
      po({ id: '2', expected_date: null }),
    ], TODAY)
    expect(rows.map(r => r.days_late)).toEqual([0, 0])
  })

  it('leaves out drafts, cancelled and finished orders', () => {
    const rows = openPurchaseOrders(
      ['draft', 'pending_approval', 'cancelled', 'received'].map((status, i) => po({ id: String(i), status })), TODAY)
    expect(rows).toEqual([])
  })

  it('includes approved, sent and part-received orders', () => {
    const rows = openPurchaseOrders(['approved', 'sent', 'partial'].map((status, i) => po({ id: String(i), status })), TODAY)
    expect(rows).toHaveLength(3)
  })

  it('drops an order where everything has arrived but nobody closed it', () => {
    expect(openPurchaseOrders([po({ id: '1', status: 'partial', lines: [line(10, 10)] })], TODAY)).toEqual([])
  })

  it('does not let an over-delivery on one line hide a short one', () => {
    const [r] = openPurchaseOrders([po({ id: '1', lines: [line(10, 15, 10, 'A'), line(10, 2, 10, 'B')] })], TODAY)
    expect(r.outstanding_qty).toBe(8)
    expect(r.lines.map(l => l.sku)).toEqual(['B'])
  })

  it('puts the latest order first', () => {
    const rows = openPurchaseOrders([
      po({ id: 'ontime', expected_date: '2026-12-01' }),
      po({ id: 'late', expected_date: '2026-10-20' }),
    ], TODAY)
    expect(rows[0].id).toBe('late')
  })

  it('falls back to the created date when no order date was entered', () => {
    const [r] = openPurchaseOrders([po({ id: '1', order_date: null, created_at: '2026-11-05T10:00:00Z' })], TODAY)
    expect(r.ordered_on).toBe('2026-11-05')
    expect(r.days_open).toBe(5)
  })
})

describe('vendor performance', () => {
  const receipts = new Map<string, Receipt>([
    ['ontime', { first: '2026-10-10', last: '2026-10-14' }],
    ['late',   { first: '2026-10-20', last: '2026-10-25' }],
  ])
  const pos = [
    po({ id: 'ontime',  status: 'received', lines: [line(10, 10)] }),
    po({ id: 'late',    status: 'received', lines: [line(10, 10)] }),
    po({ id: 'overdue', status: 'sent',     lines: [line(10, 0)], expected_date: '2026-11-01' }),
    po({ id: 'notdue',  status: 'sent',     lines: [line(10, 0)], expected_date: '2026-12-01' }),
  ]
  const [acme] = vendorPerformance(pos, receipts, TODAY)

  it('counts on-time against orders that are in or overdue', () => {
    // on time: 1 · late: delivered late + still outstanding past its date
    expect(acme).toMatchObject({ on_time: 1, late: 2, on_time_pct: 33, overdue_open: 1 })
  })

  it('does not judge an order that is not due yet', () => {
    expect(acme.orders).toBe(4)
    expect(acme.on_time + acme.late).toBe(3)
  })

  // 30 units due (two delivered, one overdue), 20 arrived. The not-yet-due order is left out.
  it('measures fill rate only on what should have arrived', () => {
    expect(acme.fill_rate_pct).toBe(67)
  })

  it('averages the days from order to first delivery', () => {
    // ordered 1 Oct: first deliveries on the 10th and the 20th
    expect(acme.avg_lead_days).toBe(14)
    expect(acme.quoted_lead_days).toBe(5)
  })

  it('keeps vendors apart and ranks them by what was ordered', () => {
    const rows = vendorPerformance([
      po({ id: 'a', lines: [line(1, 0, 100)] }),
      po({ id: 'b', supplier: BOLT, lines: [line(1, 0, 900)] }),
    ], new Map(), TODAY)
    expect(rows.map(r => r.vendor)).toEqual(['Bolt & Co', 'Acme Supply'])
  })

  it('has no percentages for a vendor with nothing due and no dates', () => {
    const [r] = vendorPerformance([po({ id: 'a', expected_date: null })], new Map(), TODAY)
    expect(r.on_time_pct).toBe(null)
    expect(r.fill_rate_pct).toBe(null)
    expect(r.avg_lead_days).toBe(null)
  })

  it('ignores drafts and cancelled orders — they were never placed', () => {
    expect(vendorPerformance([po({ id: 'a', status: 'draft' }), po({ id: 'b', status: 'cancelled' })], new Map(), TODAY)).toEqual([])
  })

  // No receipt date on record: we can't prove it was late, so we don't say so.
  it('gives a delivered order the benefit of the doubt without a receipt date', () => {
    const [r] = vendorPerformance([po({ id: 'x', status: 'received', lines: [line(5, 5)] })], new Map(), TODAY)
    expect(r).toMatchObject({ on_time: 1, late: 0 })
  })
})

describe('purchase spend', () => {
  const rl = (o: Partial<ReceiptLine>): ReceiptLine => ({
    created_at: '2026-10-05T00:00:00Z', product_id: 'p1', sku: 'A', name: 'Item A',
    category: 'Plumbing', vendor: 'Acme Supply', quantity: 10, unit_cost: 5, ...o,
  })
  const s = purchaseSpend([
    rl({}),                                                                       // 50
    rl({ created_at: '2026-10-20T00:00:00Z', unit_cost: 6 }),                     // 60 — price went up
    rl({ product_id: 'p2', sku: 'B', name: 'Item B', category: 'Electrical', vendor: 'Bolt & Co', quantity: 2, unit_cost: 45 }), // 90
    rl({ product_id: 'p3', sku: 'C', name: 'Item C', category: null, vendor: null, quantity: 1, unit_cost: 20 }),              // 20
  ])

  it('totals what was received', () => {
    expect(s.total).toBe(220)
    expect(s.receipts).toBe(4)
  })

  it('splits it by vendor, largest first, with shares', () => {
    expect(s.by_vendor).toEqual([
      { name: 'Acme Supply', value: 110, receipts: 2, share_pct: 50 },
      { name: 'Bolt & Co', value: 90, receipts: 1, share_pct: 40.9 },
      { name: 'No vendor recorded', value: 20, receipts: 1, share_pct: 9.1 },
    ])
  })

  it('splits it by category, naming the uncategorized', () => {
    expect(s.by_category.map(c => [c.name, c.value])).toEqual([['Plumbing', 110], ['Electrical', 90], ['Uncategorized', 20]])
  })

  it('shows whose price moved between the first and last receipt', () => {
    const a = s.items.find(i => i.sku === 'A')!
    expect(a).toMatchObject({ quantity: 20, value: 110, avg_cost: 5.5, first_cost: 5, last_cost: 6, price_change_pct: 20 })
  })

  it('claims no price change from a single receipt', () => {
    expect(s.items.find(i => i.sku === 'B')!.price_change_pct).toBe(null)
  })

  it('is empty, not broken, with no receipts', () => {
    expect(purchaseSpend([])).toEqual({ total: 0, receipts: 0, by_vendor: [], by_category: [], items: [] })
  })
})

describe('received, not invoiced', () => {
  const receipts = new Map<string, Receipt>([['old', { first: '2026-09-01', last: '2026-09-01' }]])
  const { rows, summary } = receivedNotInvoiced([
    po({ id: 'old',     status: 'received', lines: [line(10, 10, 30)] }),                                             // 300, no invoice
    po({ id: 'matched', status: 'received', lines: [line(10, 10, 20)], supplier_invoice_no: 'INV-1', supplier_invoice_amount: 200 }),
    po({ id: 'over',    status: 'received', lines: [line(10, 10, 20)], supplier_invoice_no: 'INV-2', supplier_invoice_amount: 230 }),
    po({ id: 'under',   status: 'partial',  lines: [line(10, 5, 20)],  supplier_invoice_no: 'INV-3', supplier_invoice_amount: 90 }),
    po({ id: 'nothing', status: 'sent',     lines: [line(10, 0, 20)] }),
    po({ id: 'gone',    status: 'cancelled', lines: [line(10, 10, 20)] }),
  ], receipts, TODAY)
  const state = (id: string) => rows.find(r => r.id === id)?.state

  it('accrues goods that have arrived with no bill yet', () => {
    expect(state('old')).toBe('not_invoiced')
    expect(summary.accrual).toBe(300)
    expect(summary.not_invoiced).toBe(1)
  })

  it('classifies each invoice against what actually arrived', () => {
    expect(state('matched')).toBe('matched')
    expect(state('over')).toBe('over_invoiced')
    expect(state('under')).toBe('under_invoiced')
    expect(rows.find(r => r.id === 'over')!.variance).toBe(30)
    expect(rows.find(r => r.id === 'under')!.variance).toBe(-10)
  })

  it('nets the variances', () => {
    expect(summary.variance).toBe(20)
  })

  it('leaves out orders with nothing received, and cancelled ones', () => {
    expect(state('nothing')).toBeUndefined()
    expect(state('gone')).toBeUndefined()
  })

  it('ages a receipt from the day the goods arrived, oldest first', () => {
    expect(rows[0].id).toBe('old')
    expect(rows[0].age_days).toBe(70)
  })

  it('treats a one-cent difference as matched', () => {
    const r = receivedNotInvoiced([po({ id: 'x', status: 'received', lines: [line(1, 1, 99.99)], supplier_invoice_amount: 100 })], new Map(), TODAY)
    expect(r.rows[0].state).toBe('matched')
  })
})

describe('slow-moving stock', () => {
  const item = (o: Partial<StockItem>): StockItem => ({
    product_id: 'p', sku: 'A', name: 'Item', category: null, unit: 'pcs',
    quantity: 10, value: 100, last_used: null, last_received: null, ...o,
  })

  it('buckets by days since last use', () => {
    expect([0, 30, 31, 90, 91, 180, 181, 365, 366].map(bucketFor))
      .toEqual(['moving', 'moving', 'slowing', 'slowing', 'slow', 'slow', 'stale', 'stale', 'dead'])
    expect(bucketFor(null)).toBe('dead')
  })

  it('ages an item from when it was last used', () => {
    const { rows } = slowMovingStock([item({ last_used: '2026-08-02', last_received: '2026-11-01' })], TODAY)
    expect(rows[0]).toMatchObject({ idle_days: 100, bucket: 'slow', never_used: false })
  })

  // Never issued: age from the delivery, so last week's stock isn't called dead.
  it('ages a never-used item from when it arrived', () => {
    const { rows } = slowMovingStock([item({ last_received: '2026-11-03' })], TODAY)
    expect(rows[0]).toMatchObject({ idle_days: 7, bucket: 'moving', never_used: true })
  })

  it('calls stock with no history at all dead', () => {
    expect(slowMovingStock([item({})], TODAY).rows[0]).toMatchObject({ idle_days: null, bucket: 'dead' })
  })

  it('leaves out items with nothing on the shelf', () => {
    expect(slowMovingStock([item({ quantity: 0 })], TODAY).rows).toEqual([])
  })

  it('totals the money tied up in each bucket', () => {
    const { summary, total_value } = slowMovingStock([
      item({ product_id: 'a', value: 300, last_used: '2026-11-08' }),
      item({ product_id: 'b', value: 100, last_used: '2025-01-01' }),
    ], TODAY)
    expect(total_value).toBe(400)
    expect(summary.find(s => s.bucket === 'moving')).toMatchObject({ items: 1, value: 300, share_pct: 75 })
    expect(summary.find(s => s.bucket === 'dead')).toMatchObject({ items: 1, value: 100, share_pct: 25 })
  })

  it('lists the longest idle first, unknown age ahead of all', () => {
    const { rows } = slowMovingStock([
      item({ product_id: 'recent', last_used: '2026-11-01' }),
      item({ product_id: 'unknown' }),
      item({ product_id: 'old', last_used: '2026-01-01' }),
    ], TODAY)
    expect(rows.map(r => r.product_id)).toEqual(['unknown', 'old', 'recent'])
  })
})

describe('stock adjustments', () => {
  const tx = (o: Partial<AdjustmentTx>): AdjustmentTx => ({
    id: 't', created_at: '2026-10-10T00:00:00Z', quantity: -2, unit_cost: 10,
    reference_no: null, notes: null, sku: 'A', name: 'Item', unit: 'pcs', location: 'Main', by: 'Dana', ...o,
  })
  const { rows, summary } = stockAdjustments([
    tx({ id: 'down', quantity: -5, unit_cost: 10 }),                                  // -50
    tx({ id: 'up', quantity: 3, unit_cost: 20, created_at: '2026-10-12T00:00:00Z' }),  // +60
    tx({ id: 'count', quantity: -1, unit_cost: 40, reference_no: 'SC-20261001-0003' }), // -40
    tx({ id: 'zero', quantity: 0 }),
  ])

  it('values each adjustment with its sign', () => {
    expect(rows.find(r => r.id === 'down')!.value).toBe(-50)
    expect(rows.find(r => r.id === 'up')!.value).toBe(60)
  })

  it('totals write-ups and write-downs separately, and nets them', () => {
    expect(summary).toMatchObject({ write_ups: 60, write_downs: -90, net: -30, count: 3 })
  })

  it('tells a stock-count adjustment from a manual one', () => {
    expect(rows.find(r => r.id === 'count')!.source).toBe('Stock count')
    expect(rows.find(r => r.id === 'down')!.source).toBe('Manual')
    expect(summary).toMatchObject({ from_counts: 1, manual: 2 })
  })

  it('drops an adjustment of nothing, and lists the newest first', () => {
    expect(rows.map(r => r.id)).toEqual(['up', 'down', 'count'])
  })
})
