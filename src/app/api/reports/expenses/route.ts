import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAnyRole } from '@/lib/api-auth'

/**
 * GET /api/reports/expenses
 *
 * Query params:
 *   from            YYYY-MM-DD   required
 *   to              YYYY-MM-DD   required
 *   group_by        'cost_center' | 'job_code'   default 'cost_center'
 *   cost_center_id  uuid         optional filter
 *   job_code        string       optional filter
 *
 * Returns consumption + sale transactions grouped by cost center or job code,
 * with a per-product breakdown and a total.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAnyRole('owner', 'finance', 'operations', 'procurement')
  if (auth.error) return auth.error

  const { searchParams } = new URL(req.url)
  const from         = searchParams.get('from')
  const to           = searchParams.get('to')
  const groupBy      = (searchParams.get('group_by') ?? 'cost_center') as 'cost_center' | 'job_code'
  const ccFilter     = searchParams.get('cost_center_id')
  const jobFilter    = searchParams.get('job_code')

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

  // Fetch consumption + sale transactions in the period
  let query = supabase
    .from('inventory_transactions')
    .select(`
      id, transaction_type, quantity, unit_cost, total_cost,
      reference_no, job_code, created_at,
      product:products(id, sku, name, unit_of_measure, category:categories(name)),
      cost_center:cost_centers(id, code, name),
      location:locations!from_location_id(id, name)
    `)
    .eq('org_id', auth.orgId)
    .in('transaction_type', ['consumption', 'sale'])
    .gte('created_at', fromDate.toISOString())
    .lte('created_at', toDate.toISOString())
    .order('created_at', { ascending: false })

  if (ccFilter)  query = query.eq('cost_center_id', ccFilter)
  if (jobFilter) query = query.eq('job_code', jobFilter)

  const { data: txs, error: txErr } = await query
  if (txErr) {
    console.error('[GET /api/reports/expenses]', txErr)
    return NextResponse.json({ error: 'Failed to fetch expense data' }, { status: 500 })
  }

  const transactions = (txs ?? []) as any[]

  // Group by the requested dimension
  type ProductLine = {
    product: any
    quantity: number
    total_cost: number
    transactions: number
  }

  type Group = {
    key:         string
    label:       string
    meta?:       any
    total_cost:  number
    products:    Record<string, ProductLine>
  }

  const groups: Record<string, Group> = {}

  for (const tx of transactions) {
    const cost = Number(tx.total_cost ?? (tx.quantity * tx.unit_cost))

    // Determine group key
    let key:   string
    let label: string
    let meta:  any

    if (groupBy === 'cost_center') {
      key   = tx.cost_center?.id  ?? '__unassigned__'
      label = tx.cost_center?.name ?? 'Unassigned'
      meta  = tx.cost_center ?? null
    } else {
      key   = tx.job_code ?? '__unassigned__'
      label = tx.job_code ?? 'No Job Code'
      meta  = null
    }

    if (!groups[key]) {
      groups[key] = { key, label, meta, total_cost: 0, products: {} }
    }

    const g = groups[key]
    g.total_cost += cost

    const productKey = tx.product?.id ?? '__unknown__'
    if (!g.products[productKey]) {
      g.products[productKey] = { product: tx.product, quantity: 0, total_cost: 0, transactions: 0 }
    }
    g.products[productKey].quantity     += Number(tx.quantity)
    g.products[productKey].total_cost   += cost
    g.products[productKey].transactions += 1
  }

  // Sort groups by total descending, build final shape
  const groupList = Object.values(groups)
    .sort((a, b) => b.total_cost - a.total_cost)
    .map(g => ({
      key:        g.key,
      label:      g.label,
      meta:       g.meta,
      total_cost: Math.round(g.total_cost * 100) / 100,
      products:   Object.values(g.products)
        .sort((a, b) => b.total_cost - a.total_cost)
        .map(p => ({ ...p, total_cost: Math.round(p.total_cost * 100) / 100 })),
    }))

  const grandTotal = groupList.reduce((s, g) => s + g.total_cost, 0)

  return NextResponse.json({
    data: {
      period:        { from, to },
      group_by:      groupBy,
      grand_total:   Math.round(grandTotal * 100) / 100,
      transaction_count: transactions.length,
      groups:        groupList,
    },
  })
}
