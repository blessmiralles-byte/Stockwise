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
  /**
   * Goods-Receipt / Invoice-Receipt clearing. Credited when goods are received
   * and debited when the vendor invoice is recorded, so the two sides net to
   * zero. A residual balance is genuinely "received but not yet invoiced" —
   * this is what keeps Stocked's receipts from double-counting payables that
   * are also entered from vendor bills in the accounting system.
   */
  grIrClearing:             'GR/IR Clearing',
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
      // Goods receipt accrues to GR/IR, not straight to AP — the invoice
      // receipt (below) is what moves it to Accounts Payable.
      return { type: 'Purchase', debit_account: ACCOUNTS.inventory, credit_account: ACCOUNTS.grIrClearing }
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

/**
 * Vendor invoice recorded against a PO — relieves the GR/IR accrual raised at
 * goods receipt and books the real payable. Posted at the GOODS-RECEIPT value;
 * any difference to the invoice amount is carried separately by ppvPosting().
 */
export function invoiceReceiptPosting(): Posting {
  return { type: 'Invoice Receipt', debit_account: ACCOUNTS.grIrClearing, credit_account: ACCOUNTS.accountsPayable }
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

// ── Human-facing reference (generated from the postings above) ────────────────
// Rendered in-app and referenced in docs so the explanation can never fall out
// of sync with the code.

export interface PostingRef {
  event:   string
  trigger: string
  debit:   string
  credit:  string
}

/** Every posting kind, derived from the same functions the feeds use. */
export function postingReference(): PostingRef[] {
  const inv = (transaction_type: string, quantity = 1) =>
    inventoryPosting({ transaction_type, quantity })
  const purchase = inv('purchase')
  const sale     = inv('sale')
  const consume  = inv('consumption')
  const adjUp    = inv('adjustment', 1)
  const adjDown  = inv('adjustment', -1)
  const transfer = inv('transfer')
  const dep      = depreciationPosting()
  const assetBuy = assetPurchasePosting()
  const invRec   = invoiceReceiptPosting()
  const ppvOver  = ppvPosting(true)
  const ppvUnder = ppvPosting(false)
  // Sample amounts so every disposal leg is present in the reference.
  const legs     = disposalLegs({ cost: 1, book: 1, accum: 1, proceeds: 1 })

  return [
    { event: purchase.type, trigger: 'Goods received against a purchase (or blind receipt) — accrues to GR/IR, not AP', debit: purchase.debit_account, credit: purchase.credit_account },
    { event: invRec.type,   trigger: 'Vendor invoice recorded against a PO — clears the GR/IR accrual into Accounts Payable', debit: invRec.debit_account, credit: invRec.credit_account },
    { event: sale.type,     trigger: 'Item sold — records the cost side (COGS) only',        debit: sale.debit_account,     credit: sale.credit_account },
    { event: consume.type,  trigger: 'Materials issued / consumed',                          debit: consume.debit_account,  credit: consume.credit_account },
    { event: adjUp.type,    trigger: 'Positive stock adjustment (overage / found stock)',    debit: adjUp.debit_account,    credit: adjUp.credit_account },
    { event: adjDown.type,  trigger: 'Negative stock adjustment (shrinkage / loss)',         debit: adjDown.debit_account,  credit: adjDown.credit_account },
    { event: transfer.type, trigger: 'Stock moved between locations',                        debit: transfer.debit_account, credit: transfer.credit_account },
    { event: dep.type,      trigger: 'Depreciation run',                                     debit: dep.debit_account,      credit: dep.credit_account },
    { event: assetBuy.type, trigger: 'Fixed asset acquired',                                 debit: assetBuy.debit_account, credit: assetBuy.credit_account },
    ...legs.map(l => ({ event: 'Asset Disposal', trigger: `Asset disposed / retired / sold — ${l.description_suffix}`, debit: l.debit_account, credit: l.credit_account })),
    { event: ppvOver.type,  trigger: 'Vendor invoice higher than goods received (over-invoiced)',  debit: ppvOver.debit_account,  credit: ppvOver.credit_account },
    { event: 'Purchase Price Variance', trigger: 'Vendor invoice lower than goods received (under-invoiced)', debit: ppvUnder.debit_account, credit: ppvUnder.credit_account },
  ]
}

/** What this journal does and does not cover — read before importing. */
export const JOURNAL_SCOPE: string[] = [
  'Covers inventory and fixed-asset activity only.',
  'No sales revenue — revenue is invoiced and journaled in JobLedger. The Sale entry here records the cost side (COGS) only, so land JobLedger revenue and this COGS in the same period.',
  'No sales tax / VAT is calculated or accrued anywhere in these entries.',
  'Purchases use a GR/IR clearing account: receiving goods credits GR/IR Clearing, and recording the vendor invoice debits GR/IR Clearing and credits Accounts Payable. The two net to zero, so a residual GR/IR balance is stock received but not yet invoiced.',
  'Because payables are only raised when an invoice is recorded, this feed will not double-count vendor bills you also enter directly in your accounting system.',
  'Every line is a single balanced entry (debit = credit). Amounts are always positive; direction is carried by the accounts.',
]

/** How to get the entries into an accounting system. */
export const JOURNAL_IMPORT_STEPS: string[] = [
  'Pick a date range (and optionally specific transaction types).',
  'Run the report to preview the double-entry lines.',
  'Download the CSV — its column headers match QuickBooks / Xero journal import templates. It begins with a few "#" note lines; most importers skip them, otherwise delete those rows before importing.',
  'Map the account names in the reference below to your own chart of accounts, then import.',
]

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
