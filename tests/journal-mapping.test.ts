import { describe, it, expect } from 'vitest'
import {
  ACCOUNTS, inventoryPosting, depreciationPosting, assetPurchasePosting,
  invoiceReceiptPosting, ppvPosting, computeDisposal, disposalLegs, postingReference,
} from '@/lib/journal-mapping'

const post = (type: string, extra: any = {}) =>
  inventoryPosting({ transaction_type: type, quantity: 1, ...extra })

describe('journal mapping', () => {
  it('never debits and credits the same account', () => {
    for (const type of ['purchase', 'sale', 'consumption', 'adjustment', 'transfer', 'mystery']) {
      const p = post(type, { from_location: { name: 'A' }, to_location: { name: 'B' } })
      expect(p.debit_account).not.toBe(p.credit_account)
    }
    for (const p of [depreciationPosting(), assetPurchasePosting(), invoiceReceiptPosting(), ppvPosting(true), ppvPosting(false)]) {
      expect(p.debit_account).not.toBe(p.credit_account)
    }
  })

  // The GR/IR split is what stops a vendor bill being counted twice when the
  // customer also enters it in their own accounting system.
  it('accrues a goods receipt to GR/IR, not Accounts Payable', () => {
    const p = post('purchase')
    expect(p.debit_account).toBe(ACCOUNTS.inventory)
    expect(p.credit_account).toBe(ACCOUNTS.grIrClearing)
    expect(p.credit_account).not.toBe(ACCOUNTS.accountsPayable)
  })

  it('clears GR/IR into Accounts Payable when the invoice is recorded', () => {
    const p = invoiceReceiptPosting()
    expect(p.debit_account).toBe(ACCOUNTS.grIrClearing)
    expect(p.credit_account).toBe(ACCOUNTS.accountsPayable)
  })

  it('leaves GR/IR net zero once goods and invoice both land', () => {
    const receipt = post('purchase')
    const invoice = invoiceReceiptPosting()
    expect(receipt.credit_account).toBe(invoice.debit_account)
  })

  it('books a sale as cost only (revenue is invoiced elsewhere)', () => {
    const p = post('sale')
    expect(p.debit_account).toBe(ACCOUNTS.cogs)
    expect(p.credit_account).toBe(ACCOUNTS.inventory)
  })

  it('expenses consumption against inventory', () => {
    expect(post('consumption')).toMatchObject({
      debit_account: ACCOUNTS.operatingExpense, credit_account: ACCOUNTS.inventory,
    })
  })

  it('reverses the adjustment posting for a negative quantity', () => {
    const up   = post('adjustment', { quantity: 5 })
    const down = post('adjustment', { quantity: -5 })
    expect(up.debit_account).toBe(down.credit_account)
    expect(up.credit_account).toBe(down.debit_account)
  })

  it('moves stock between per-location accounts on a transfer', () => {
    const p = post('transfer', { from_location: { name: 'Warehouse' }, to_location: { name: 'Van 3' } })
    expect(p.debit_account).toBe('Inventory (Van 3)')
    expect(p.credit_account).toBe('Inventory (Warehouse)')
  })

  it('sends an unknown movement to Suspense rather than guessing', () => {
    expect(post('teleport').credit_account).toBe(ACCOUNTS.suspense)
  })

  it('flips the price-variance posting with the direction of the difference', () => {
    const over  = ppvPosting(true)
    const under = ppvPosting(false)
    expect(over.debit_account).toBe(under.credit_account)
    expect(over.credit_account).toBe(under.debit_account)
  })
})

describe('asset disposal', () => {
  it('splits cost into accumulated depreciation and remaining book value', () => {
    const d = computeDisposal({ purchase_cost: 1000, current_value: 300 })
    expect(d).toMatchObject({ cost: 1000, book: 300, accum: 700 })
    expect(d.accum + d.book).toBe(d.cost)
  })

  it('clamps a book value outside 0…cost (bad data must not invert the entry)', () => {
    expect(computeDisposal({ purchase_cost: 1000, current_value: 5000 })).toMatchObject({ book: 1000, accum: 0 })
    expect(computeDisposal({ purchase_cost: 1000, current_value: -50 })).toMatchObject({ book: 0, accum: 1000 })
  })

  it('counts proceeds only on a sale', () => {
    expect(computeDisposal({ purchase_cost: 100, current_value: 50, status: 'sold', sale_price: 40 }).proceeds).toBe(40)
    expect(computeDisposal({ purchase_cost: 100, current_value: 50, status: 'retired', sale_price: 40 }).proceeds).toBe(null)
  })

  it('relieves the asset’s full cost across its legs', () => {
    const d = computeDisposal({ purchase_cost: 1000, current_value: 300 })
    const legs = disposalLegs(d)
    const credited = legs.filter(l => l.credit_account === ACCOUNTS.fixedAssets)
      .reduce((sum, l) => sum + l.amount, 0)
    expect(credited).toBe(1000)
  })

  it('adds a proceeds leg when sold, and skips empty legs', () => {
    const sold = disposalLegs(computeDisposal({ purchase_cost: 100, current_value: 0, status: 'sold', sale_price: 60 }))
    expect(sold.map(l => l.leg)).toEqual(['accum', 'proceeds'])

    const fullyDepreciatedScrap = disposalLegs(computeDisposal({ purchase_cost: 100, current_value: 0 }))
    expect(fullyDepreciatedScrap.map(l => l.leg)).toEqual(['accum'])
  })

  it('has every leg carry a positive amount', () => {
    for (const l of disposalLegs(computeDisposal({ purchase_cost: 900, current_value: 400, status: 'sold', sale_price: 100 }))) {
      expect(l.amount).toBeGreaterThan(0)
    }
  })
})

describe('the in-app accounting reference', () => {
  // The reference shown to customers is generated from the same functions, so
  // it can't drift from what the export actually posts.
  it('lists every posting with both sides filled in', () => {
    const ref = postingReference()
    expect(ref.length).toBeGreaterThan(5)
    for (const r of ref) {
      expect(r.debit.length).toBeGreaterThan(0)
      expect(r.credit.length).toBeGreaterThan(0)
      expect(r.debit).not.toBe(r.credit)
      expect(r.event.length).toBeGreaterThan(0)
      expect(r.trigger.length).toBeGreaterThan(0)
    }
  })

  it('includes the GR/IR clearing account', () => {
    expect(JSON.stringify(postingReference())).toContain(ACCOUNTS.grIrClearing)
  })
})
