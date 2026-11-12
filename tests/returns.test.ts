import { describe, it, expect } from 'vitest'
import { jobBalances, planJobReturn, planVendorReturn, poStatusAfterReturn, type JobMovement } from '@/lib/returns'
import { movementEffect, jobCostOf, jobQtyOf } from '@/lib/stock-direction'
import { inventoryPosting, ACCOUNTS } from '@/lib/journal-mapping'

const mv = (type: string, quantity: number, unit_cost: number, job_code: string | null = 'J-1', cost_center_id: string | null = null): JobMovement =>
  ({ transaction_type: type, quantity, unit_cost, job_code, cost_center_id })

describe('what is still out on a job', () => {
  it('nets returns off issues, per job and cost center', () => {
    const b = jobBalances([
      mv('consumption', 10, 2), mv('consumption', 5, 2), mv('return', 4, 2),
      mv('consumption', 3, 5, 'J-2'),
      mv('purchase', 100, 2), mv('adjustment', -1, 2),   // not job movements
    ])
    expect(b).toHaveLength(2)
    expect(b[0]).toMatchObject({ job_code: 'J-1', issued_qty: 15, returned_qty: 4, net_qty: 11, unit_cost: 2 })
    expect(b[1]).toMatchObject({ job_code: 'J-2', net_qty: 3, unit_cost: 5 })
  })

  it('keeps the same job under two cost centers apart', () => {
    const b = jobBalances([mv('consumption', 4, 2, 'J-1', 'cc-a'), mv('consumption', 6, 2, 'J-1', 'cc-b')])
    expect(b.map(x => [x.cost_center_id, x.net_qty])).toEqual([['cc-b', 6], ['cc-a', 4]])
  })

  it('prices what is left at what the job was charged for it', () => {
    // 10 at 2.00 and 10 at 4.00 went out: 60 charged, 3.00 each.
    const b = jobBalances([mv('consumption', 10, 2), mv('consumption', 10, 4)])
    expect(b[0].unit_cost).toBe(3)
  })
})

describe('returning from a job', () => {
  const rows = [mv('consumption', 10, 2), mv('return', 4, 2)]

  it('credits the job at the cost it was issued at', () => {
    expect(planJobReturn(rows, { job_code: 'J-1', cost_center_id: null }, 6)).toEqual({ ok: true, unit_cost: 2 })
  })

  it('refuses more than is still out', () => {
    const r = planJobReturn(rows, { job_code: 'J-1', cost_center_id: null }, 7)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/Only 6 can be returned.*10 issued, 4 already returned/)
  })

  it('refuses a job the item never went to', () => {
    const r = planJobReturn(rows, { job_code: 'J-9', cost_center_id: null }, 1)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/never issued to job J-9/)
  })

  it('refuses once everything has come back', () => {
    const r = planJobReturn([mv('consumption', 5, 2), mv('return', 5, 2)], { job_code: 'J-1', cost_center_id: null }, 1)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/already been returned/)
  })

  it('handles stock issued with no job at all', () => {
    const r = planJobReturn([mv('consumption', 5, 2, null)], { job_code: null, cost_center_id: null }, 2)
    expect(r).toEqual({ ok: true, unit_cost: 2 })
  })
})

describe('returning to a vendor', () => {
  const line = { quantity_ordered: 100, quantity_received: 100, unit_cost: 1.5 }

  it('reopens the order when a replacement is coming', () => {
    expect(planVendorReturn(line, 10, 'replacement')).toEqual({
      ok: true, unit_cost: 1.5, line: { quantity_ordered: 100, quantity_received: 90 },
    })
  })

  it('shrinks the order when the vendor is giving a credit', () => {
    expect(planVendorReturn(line, 10, 'credit')).toEqual({
      ok: true, unit_cost: 1.5, line: { quantity_ordered: 90, quantity_received: 90 },
    })
  })

  it('refuses more than was received', () => {
    const r = planVendorReturn({ ...line, quantity_received: 40 }, 41, 'credit')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/Only 40 were received/)
  })

  it('refuses when nothing was received', () => {
    expect(planVendorReturn({ ...line, quantity_received: 0 }, 1, 'credit').ok).toBe(false)
  })

  it('works out where the order stands afterwards', () => {
    expect(poStatusAfterReturn([{ quantity_ordered: 100, quantity_received: 90 }])).toBe('partial')
    expect(poStatusAfterReturn([{ quantity_ordered: 90, quantity_received: 90 }])).toBe('received')
    expect(poStatusAfterReturn([{ quantity_ordered: 100, quantity_received: 0 }])).toBe('sent')
    expect(poStatusAfterReturn([{ quantity_ordered: 0, quantity_received: 0 }])).toBe('received')
  })
})

describe('which way each movement goes', () => {
  it('brings a job return in and takes it off issues', () => {
    expect(movementEffect('return', 5)).toEqual({ stock: 1, bucket: 'issues', sign: -1 })
  })
  it('sends a vendor return out and takes it off purchases', () => {
    expect(movementEffect('vendor_return', 5)).toEqual({ stock: -1, bucket: 'purchases', sign: -1 })
  })
  it('leaves the existing types as they were', () => {
    expect(movementEffect('purchase', 5)).toEqual({ stock: 1, bucket: 'purchases', sign: 1 })
    expect(movementEffect('consumption', 5)).toEqual({ stock: -1, bucket: 'issues', sign: 1 })
    expect(movementEffect('sale', 5).stock).toBe(-1)
    expect(movementEffect('adjustment', -3)).toEqual({ stock: -1, bucket: 'adjustments', sign: -1 })
    expect(movementEffect('adjustment', 3).stock).toBe(1)
    expect(movementEffect('transfer', 5).stock).toBe(0)
  })
  it('makes a return a negative cost and quantity on the job', () => {
    expect(jobCostOf({ transaction_type: 'return', quantity: 4, unit_cost: 2, total_cost: 8 })).toBe(-8)
    expect(jobQtyOf({ transaction_type: 'return', quantity: 4 })).toBe(-4)
    expect(jobCostOf({ transaction_type: 'consumption', quantity: 4, unit_cost: 2 })).toBe(8)
  })
})

describe('accounting entries for returns', () => {
  it('reverses the issue for a job return', () => {
    expect(inventoryPosting({ transaction_type: 'return', quantity: 1 }))
      .toMatchObject({ debit_account: ACCOUNTS.inventory, credit_account: ACCOUNTS.operatingExpense })
  })
  it('reverses the receipt for a vendor return', () => {
    expect(inventoryPosting({ transaction_type: 'vendor_return', quantity: 1 }))
      .toMatchObject({ debit_account: ACCOUNTS.grIrClearing, credit_account: ACCOUNTS.inventory })
  })
})
