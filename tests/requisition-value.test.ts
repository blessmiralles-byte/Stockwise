import { describe, it, expect } from 'vitest'
import { fakeSupabase } from './helpers/fake-supabase'
import { requisitionAmounts } from '@/lib/requisition-fulfilment'

/**
 * A requisition's value decides how far up the reporting line it travels, so
 * it has to be right: priced lines use their price, stock lines fall back to
 * the highest average cost on hand (conservative — routes to a higher
 * approver rather than a lower one).
 */
const sb = () => fakeSupabase({
  inventory_balances: [
    { org_id: 'o1', product_id: 'p1', avg_cost: 10 },
    { org_id: 'o1', product_id: 'p1', avg_cost: 14 },   // dearer location
    { org_id: 'o1', product_id: 'p2', avg_cost: 2.5 },
    { org_id: 'o2', product_id: 'p1', avg_cost: 999 },  // another tenant
  ],
})

describe('requisition value', () => {
  it('uses the priced lines when the requester gave a price', async () => {
    const amounts = await requisitionAmounts(sb(), 'o1', [
      { id: 'r1', items: [{ quantity: 3, unit_cost: 100 }, { quantity: 1, unit_cost: 50 }] },
    ])
    expect(amounts.get('r1')).toBe(350)
  })

  it('values stock lines at the highest average cost on hand', async () => {
    const amounts = await requisitionAmounts(sb(), 'o1', [
      { id: 'r1', items: [{ quantity: 2, product_id: 'p1' }] },
    ])
    expect(amounts.get('r1')).toBe(28)
  })

  it('never reads another organization’s costs', async () => {
    const amounts = await requisitionAmounts(sb(), 'o1', [
      { id: 'r1', items: [{ quantity: 1, product_id: 'p1' }] },
    ])
    expect(amounts.get('r1')).toBe(14)
  })

  it('mixes priced and stock lines', async () => {
    const amounts = await requisitionAmounts(sb(), 'o1', [
      { id: 'r1', items: [{ quantity: 1, unit_cost: 100 }, { quantity: 4, product_id: 'p2' }] },
    ])
    expect(amounts.get('r1')).toBe(110)
  })

  it('values a tool borrow at zero (nothing is bought)', async () => {
    const amounts = await requisitionAmounts(sb(), 'o1', [
      { id: 'r1', items: [{ quantity: 1, item_type: 'asset' }] },
    ])
    expect(amounts.get('r1')).toBe(0)
  })

  it('treats a negative quantity as its absolute value', async () => {
    const amounts = await requisitionAmounts(sb(), 'o1', [
      { id: 'r1', items: [{ quantity: -3, unit_cost: 10 }] },
    ])
    expect(amounts.get('r1')).toBe(30)
  })

  it('rounds to cents', async () => {
    const amounts = await requisitionAmounts(sb(), 'o1', [
      { id: 'r1', items: [{ quantity: 3, unit_cost: 0.335 }] },
    ])
    expect(amounts.get('r1')).toBe(1.01)
  })

  it('values several requisitions in one pass', async () => {
    const amounts = await requisitionAmounts(sb(), 'o1', [
      { id: 'r1', items: [{ quantity: 1, unit_cost: 5 }] },
      { id: 'r2', items: [{ quantity: 2, product_id: 'p2' }] },
      { id: 'r3', items: [] },
    ])
    expect([...amounts.entries()]).toEqual([['r1', 5], ['r2', 5], ['r3', 0]])
  })
})
