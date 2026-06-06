import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAnyRole } from '@/lib/api-auth'

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

  // Transactions in the period
  const { data: txs, error: txErr } = await supabase
    .from('inventory_transactions')
    .select(`
      transaction_type, product_id, quantity, unit_cost, total_cost,
      product:products(id, sku, name, unit_of_measure, category:categories(name))
    `)
    .eq('org_id', auth.orgId)
    .gte('created_at', fromDate.toISOString())
    .lte('created_at', toDate.toISOString())
    .in('transaction_type', ['purchase', 'consumption', 'sale', 'adjustment'])

  if (txErr) {
    return NextResponse.json({ error: 'Failed to fetch transactions' }, { status: 500 })
  }

  // Transactions BEFORE period for opening value
  const { data: openingTxs, error: openErr } = await supabase
    .from('inventory_transactions')
    .select('product_id, quantity, total_cost, transaction_type')
    .eq('org_id', auth.orgId)
    .lt('created_at', fromDate.toISOString())

  if (openErr) {
    return NextResponse.json({ error: 'Failed to compute opening stock' }, { status: 500 })
  }

  // Current closing balances
  const { data: balances, error: balErr } = await supabase
    .from('inventory_balances')
    .select(`
      product_id, quantity, avg_cost,
      product:products(id, sku, name, unit_of_measure, category:categories(name))
    `)
    .eq('org_id', auth.orgId)

  if (balErr) {
    return NextResponse.json({ error: 'Failed to fetch closing balances' }, { status: 500 })
  }

  // Opening value
  let openingValue = 0
  for (const tx of openingTxs ?? []) {
    if (tx.transaction_type === 'purchase') {
      openingValue += Number(tx.total_cost)
    } else if (tx.transaction_type === 'consumption' || tx.transaction_type === 'sale') {
      openingValue -= Number(tx.total_cost)
    }
  }
  openingValue = Math.max(0, openingValue)

  let purchasesValue   = 0
  let issuesValue      = 0
  let adjustmentsValue = 0

  for (const tx of txs ?? []) {
    if (tx.transaction_type === 'purchase') purchasesValue += Number(tx.total_cost)
    else if (tx.transaction_type === 'consumption' || tx.transaction_type === 'sale') issuesValue += Number(tx.total_cost)
    else if (tx.transaction_type === 'adjustment') adjustmentsValue += Number(tx.total_cost)
  }

  const closingValue = (balances ?? []).reduce(
    (s: number, b: any) => s + Number(b.quantity) * Number(b.avg_cost), 0
  )

  // Per-product breakdown
  type Line = {
    product: any
    purchases_qty: number
    issues_qty: number
    closing_qty: number
    purchases_value: number
    issues_value: number
    closing_value: number
  }
  const lineMap: Record<string, Line> = {}

  for (const b of balances ?? []) {
    if (!lineMap[b.product_id]) {
      lineMap[b.product_id] = {
        product: b.product,
        purchases_qty: 0, issues_qty: 0,
        closing_qty: Number(b.quantity),
        purchases_value: 0, issues_value: 0,
        closing_value: Number(b.quantity) * Number(b.avg_cost),
      }
    }
  }

  for (const tx of txs ?? []) {
    if (!lineMap[tx.product_id]) {
      lineMap[tx.product_id] = {
        product: tx.product,
        purchases_qty: 0, issues_qty: 0, closing_qty: 0,
        purchases_value: 0, issues_value: 0, closing_value: 0,
      }
    }
    if (tx.transaction_type === 'purchase') {
      lineMap[tx.product_id].purchases_qty   += Number(tx.quantity)
      lineMap[tx.product_id].purchases_value += Number(tx.total_cost)
    } else if (tx.transaction_type === 'consumption' || tx.transaction_type === 'sale') {
      lineMap[tx.product_id].issues_qty   += Number(tx.quantity)
      lineMap[tx.product_id].issues_value += Number(tx.total_cost)
    }
  }

  const lines = Object.values(lineMap)
    .filter(l => l.purchases_value > 0 || l.issues_value > 0 || l.closing_value > 0)
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
  })
}
