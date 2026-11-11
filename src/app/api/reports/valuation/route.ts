import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAnyRole } from '@/lib/api-auth'
import { fetchAllPaged } from '@/lib/fetch-paged'

/**
 * GET /api/reports/valuation?from=YYYY-MM-DD&to=YYYY-MM-DD
 */
export async function GET(req: NextRequest) {
  // SOD: only finance, owner can see full valuation report
  const auth = await requireAnyRole('owner', 'finance')
  if (auth.error) return auth.error

  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from')
  const to   = searchParams.get('to')

  if (!from || !to) {
    return NextResponse.json({ error: 'from and to date params are required (YYYY-MM-DD)' }, { status: 400 })
  }

  const fromDate = new Date(from)
  const toDate   = new Date(to)
  toDate.setHours(23, 59, 59, 999)

  if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
    return NextResponse.json({ error: 'Invalid date format' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // The SIZE of a transaction's value (handles legacy NULL total_cost).
  // total_cost is a generated column, quantity × unit_cost, so it is negative
  // on a write-down. Returning it raw meant the adjustment branches below —
  // which apply the sign themselves — flipped a write-down into a gain: a
  // shrinkage of 6 was added to closing stock as +6. Direction is decided from
  // the quantity, in one place; this only ever returns a magnitude.
  const txCost = (tx: any) =>
    Math.abs(Number(tx.total_cost ?? (Number(tx.quantity) * Number(tx.unit_cost ?? 0))))

  // Both reads are paged. Left as single selects they were capped by the
  // database API's own row ceiling, and the opening balance — rebuilt from
  // every transaction before the period — is the first figure to go quietly
  // wrong as a customer's history grows.

  // Transactions in the period
  const { rows: txs, error: txErr, truncated: txTruncated } = await fetchAllPaged<any>((pageFrom, pageTo) => supabase
    .from('inventory_transactions')
    .select(`
      transaction_type, product_id, quantity, unit_cost, total_cost,
      product:products(id, sku, name, unit_of_measure, category:categories(name))
    `)
    .eq('org_id', auth.orgId)
    .gte('created_at', fromDate.toISOString())
    .lte('created_at', toDate.toISOString())
    .in('transaction_type', ['purchase', 'consumption', 'sale', 'adjustment'])
    .order('id')
    .range(pageFrom, pageTo))

  if (txErr) {
    return NextResponse.json({ error: 'Failed to fetch transactions' }, { status: 500 })
  }

  // All transactions BEFORE the period — to reconstruct opening balance per product
  const { rows: openingTxs, error: openErr, truncated: openTruncated } = await fetchAllPaged<any>((pageFrom, pageTo) => supabase
    .from('inventory_transactions')
    .select('product_id, quantity, unit_cost, total_cost, transaction_type')
    .eq('org_id', auth.orgId)
    .lt('created_at', fromDate.toISOString())
    .order('id')
    .range(pageFrom, pageTo))

  if (openErr) {
    return NextResponse.json({ error: 'Failed to compute opening stock' }, { status: 500 })
  }

  // ── Compute per-product opening balance (qty + value) ────────────────────────
  type ProductBalance = { qty: number; value: number }
  const openingMap: Record<string, ProductBalance> = {}

  for (const tx of openingTxs ?? []) {
    const pid  = tx.product_id
    const cost = txCost(tx)
    const qty  = Number(tx.quantity)
    if (!openingMap[pid]) openingMap[pid] = { qty: 0, value: 0 }

    if (tx.transaction_type === 'purchase') {
      openingMap[pid].qty   += Math.abs(qty)
      openingMap[pid].value += cost
    } else if (tx.transaction_type === 'consumption' || tx.transaction_type === 'sale') {
      openingMap[pid].qty   -= Math.abs(qty)
      openingMap[pid].value -= cost
    } else if (tx.transaction_type === 'adjustment') {
      openingMap[pid].qty   += qty   // signed qty
      openingMap[pid].value += qty >= 0 ? cost : -cost
    } else if (tx.transaction_type === 'transfer') {
      // transfers don't change total inventory value — no-op for valuation
    }
  }

  const openingValue = Math.max(0,
    Object.values(openingMap).reduce((s, b) => s + b.value, 0)
  )

  // ── Compute period movements ──────────────────────────────────────────────────
  let purchasesValue   = 0
  let issuesValue      = 0
  let adjustmentsValue = 0   // signed: positive = stock increase, negative = decrease

  for (const tx of txs ?? []) {
    const cost = txCost(tx)
    const qty  = Number(tx.quantity)
    if (tx.transaction_type === 'purchase') {
      purchasesValue += cost
    } else if (tx.transaction_type === 'consumption' || tx.transaction_type === 'sale') {
      issuesValue += cost
    } else if (tx.transaction_type === 'adjustment') {
      adjustmentsValue += qty >= 0 ? cost : -cost
    }
  }

  // Closing = Opening + Purchases - Issues ± Adjustments
  // Derived entirely from transaction history — consistent with the formula
  const closingValue = Math.max(0,
    openingValue + purchasesValue - issuesValue + adjustmentsValue
  )

  // ── Per-product breakdown ─────────────────────────────────────────────────────
  type Line = {
    product:         any
    opening_qty:     number
    purchases_qty:   number
    issues_qty:      number
    closing_qty:     number
    opening_value:   number
    purchases_value: number
    issues_value:    number
    closing_value:   number
  }
  const lineMap: Record<string, Line> = {}

  const ensureLine = (pid: string, product: any) => {
    if (!lineMap[pid]) {
      const ob = openingMap[pid] ?? { qty: 0, value: 0 }
      lineMap[pid] = {
        product,
        opening_qty:   Math.max(0, ob.qty),
        purchases_qty: 0, issues_qty: 0,
        closing_qty:   Math.max(0, ob.qty),
        opening_value:   Math.max(0, ob.value),
        purchases_value: 0, issues_value: 0,
        closing_value:   Math.max(0, ob.value),
      }
    }
  }

  for (const tx of txs ?? []) {
    const pid  = tx.product_id
    const cost = txCost(tx)
    const qty  = Number(tx.quantity)
    ensureLine(pid, tx.product)

    if (tx.transaction_type === 'purchase') {
      lineMap[pid].purchases_qty   += Math.abs(qty)
      lineMap[pid].purchases_value += cost
      lineMap[pid].closing_qty     += Math.abs(qty)
      lineMap[pid].closing_value   += cost
    } else if (tx.transaction_type === 'consumption' || tx.transaction_type === 'sale') {
      lineMap[pid].issues_qty   += Math.abs(qty)
      lineMap[pid].issues_value += cost
      lineMap[pid].closing_qty  -= Math.abs(qty)
      lineMap[pid].closing_value -= cost
    } else if (tx.transaction_type === 'adjustment') {
      const adjCost = qty >= 0 ? cost : -cost
      lineMap[pid].closing_qty   += qty
      lineMap[pid].closing_value += adjCost
    }
  }

  // Also seed lines for products that had opening stock but no period activity
  for (const [pid, ob] of Object.entries(openingMap)) {
    if (!lineMap[pid] && ob.value > 0) {
      lineMap[pid] = {
        product: null,
        opening_qty:   Math.max(0, ob.qty),
        purchases_qty: 0, issues_qty: 0,
        closing_qty:   Math.max(0, ob.qty),
        opening_value:   Math.max(0, ob.value),
        purchases_value: 0, issues_value: 0,
        closing_value:   Math.max(0, ob.value),
      }
    }
  }

  const lines = Object.values(lineMap)
    .filter(l => l.opening_value > 0 || l.purchases_value > 0 || l.issues_value > 0 || l.closing_value > 0)
    .sort((a, b) => b.closing_value - a.closing_value)

  return NextResponse.json({
    data: {
      period: { from, to },
      summary: {
        opening_value:     openingValue,
        purchases_value:   purchasesValue,
        issues_value:      issuesValue,
        adjustments_value: adjustmentsValue,
        closing_value:     closingValue,
      },
      lines,
    },
    // More history than one pass can read: the figures above are incomplete.
    truncated: txTruncated || openTruncated || undefined,
  })
}
