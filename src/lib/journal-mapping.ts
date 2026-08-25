/**
 * Single source of truth for how Stocked activity maps to double-entry
 * accounting postings (which account is debited vs credited for each event).
 *
 * Both journal feeds — /api/accounting/journal (integration feed) and
 * /api/reports/journal (downloadable export) — MUST derive their debit/credit
 * accounts and entry-type labels from here. Each route still owns its own
 * output shape (ids, timestamps, descriptions, CSV); only the accounting policy
 * lives here, so a change to the chart of accounts happens in exactly one place.
 *
 * SCOPE: inventory + fixed assets only. No revenue (sales revenue is journaled
 * in JobLedger) and no sales tax / VAT. Purchases credit Accounts Payable at
 * goods receipt (a GRNI simplification).
 */

/** The chart-of-accounts names used across every posting. */
export const ACCOUNTS = {
  inventory:                'Inventory Asset',
  accountsPayable:          'Accounts Payable',
  cogs:                     'Cost of Goods Sold',
  operatingExpense:         'Operating Expense',
  inventoryShrinkage:       'Inventory Shrinkage',
  depreciationExpense:      'Depreciation Expense',
  accumulatedDepreciation:  'Accumulated Depreciation',
  fixedAssets:              'Fixed Assets',
  gainLossOnDisposal:       'Gain/Loss on Asset Disposal',
  undepositedFunds:         'Undeposited Funds',
  purchasePriceVariance:    'Purchase Price Variance',
  suspense:                 'Suspense',
} as const

/** A single balanced posting: one debit account, one credit account. */
export interface Posting {
  type:           string
  debit_account:  string
  credit_account: string
}

/** Per-location inventory sub-account label (used on transfers). */
export function inventoryLocationAccount(locationName: string | null | undefined, fallback: string): string {
  return `Inventory (${locationName ?? fallback})`
}

/** Posting for an inventory_transactions row. */
export function inventoryPosting(tx: {
  transaction_type: string
  quantity:         number
  from_location?:   { name?: string | null } | null
  to_location?:     { name?: string | null } | null
}): Posting {
  switch (tx.transaction_type) {
    case 'purchase':
      return { type: 'Purchase', debit_account: ACCOUNTS.inventory, credit_account: ACCOUNTS.accountsPayable }
    case 'sale':
      return { type: 'Sale', debit_account: ACCOUNTS.cogs, credit_account: ACCOUNTS.inventory }
    case 'consumption':
      return { type: 'Consumption', debit_account: ACCOUNTS.operatingExpense, credit_account: ACCOUNTS.inventory }
    case 'adjustment':
      return tx.quantity >= 0
        ? { type: 'Adjustment (+)', debit_account: ACCOUNTS.inventory,          credit_account: ACCOUNTS.inventoryShrinkage }
        : { type: 'Adjustment (−)', debit_account: ACCOUNTS.inventoryShrinkage, credit_account: ACCOUNTS.inventory }
    case 'transfer':
      return {
        type:           'Transfer',
        debit_account:  inventoryLocationAccount(tx.to_location?.name,   'Destination'),
        credit_account: inventoryLocationAccount(tx.from_location?.name, 'Source'),
      }
    default:
      return { type: tx.transaction_type, debit_account: ACCOUNTS.inventory, credit_account: ACCOUNTS.suspense }
  }
}

/** Monthly/periodic depreciation charge. */
export function depreciationPosting(): Posting {
  return { type: 'Depreciation', debit_account: ACCOUNTS.depreciationExpense, credit_account: ACCOUNTS.accumulatedDepreciation }
}

/** Capitalising a fixed-asset acquisition. */
export function assetPurchasePosting(): Posting {
  return { type: 'Asset Purchase', debit_account: ACCOUNTS.fixedAssets, credit_account: ACCOUNTS.accountsPayable }
}

/** Purchase price variance from three-way match (invoice vs GRN). */
export function ppvPosting(overInvoiced: boolean): Posting {
  return overInvoiced
    ? { type: 'Purchase Price Variance', debit_account: ACCOUNTS.purchasePriceVariance, credit_account: ACCOUNTS.accountsPayable }
    : { type: 'Purchase Price Variance', debit_account: ACCOUNTS.accountsPayable,        credit_account: ACCOUNTS.purchasePriceVariance }
}

// ── Fixed-asset disposal ──────────────────────────────────────────────────────
// A disposal removes the asset at cost, relieves accumulated depreciation,
// writes the remaining book value to Gain/Loss, and books any sale proceeds
// against that same Gain/Loss account (whose net balance is the gain or loss).

export interface DisposalAmounts {
  cost:     number
  book:     number
  accum:    number
  proceeds: number | null
}

/** Derive the disposal amounts from an asset row (book value clamped to [0, cost]). */
export function computeDisposal(a: {
  purchase_cost?: any
  current_value?: any
  status?:        string
  sale_price?:    any
}): DisposalAmounts {
  const cost     = Number(a.purchase_cost ?? 0)
  const book     = Math.max(0, Math.min(cost, Number(a.current_value ?? 0)))
  const accum    = Math.max(0, cost - book)
  const proceeds = a.status === 'sold' && a.sale_price != null ? Number(a.sale_price) : null
  return { cost, book, accum, proceeds }
}

export interface DisposalLeg {
  leg:               'accum' | 'loss' | 'proceeds'
  description_suffix: string
  debit_account:     string
  credit_account:    string
  amount:            number
}

/** The (up to three) postings that make up a disposal, in order. */
export function disposalLegs(d: DisposalAmounts): DisposalLeg[] {
  const legs: DisposalLeg[] = []
  if (d.accum > 0) {
    legs.push({
      leg: 'accum',
      description_suffix: 'relieve accumulated depreciation',
      debit_account:  ACCOUNTS.accumulatedDepreciation,
      credit_account: ACCOUNTS.fixedAssets,
      amount: d.accum,
    })
  }
  if (d.book > 0) {
    legs.push({
      leg: 'loss',
      description_suffix: 'write off remaining book value',
      debit_account:  ACCOUNTS.gainLossOnDisposal,
      credit_account: ACCOUNTS.fixedAssets,
      amount: d.book,
    })
  }
  if (d.proceeds != null && d.proceeds > 0) {
    legs.push({
      leg: 'proceeds',
      description_suffix: 'sale proceeds',
      debit_account:  ACCOUNTS.undepositedFunds,
      credit_account: ACCOUNTS.gainLossOnDisposal,
      amount: d.proceeds,
    })
  }
  return legs
}
