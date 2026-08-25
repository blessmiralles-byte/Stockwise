import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAnyRole } from '@/lib/api-auth'

/**
 * GET /api/reports/cost-analysis
 *
 * Cross-tabulates expense (consumption + sale) spend across BOTH the cost
 * centre and job-code dimensions at once — the intersection the single-axis
 * Expenses report can't show. Powers the matrix, per-job, and per-cost-centre
 * views of the Cost Analysis report.
 *
 * Query params:
 *   from    YYYY-MM-DD   required
 *   to      YYYY-MM-DD   required
 *   format  json (default) | csv
 *
 * Response.data:
 *   { period, grand_total, transaction_count,
 *     cost_centers: [{ key, label, total }],  // rows, sorted by total desc
 *     job_codes:    [{ key, label, total }],  // cols, sorted by total desc
 *     cells: { [ccKey]: { [jobKey]: number } } }
 */
const NONE = '__none__'

export async function GET(req: NextRequest) {
  const auth = await requireAnyRole('owner', 'finance', 'operations', 'procurement')
  if (auth.error) return auth.error

  const { searchParams } = new URL(req.url)
  const from   = searchParams.get('from')
  const to     = searchParams.get('to')
  const format = searchParams.get('format') ?? 'json'

  if (!from || !to) {
    return NextResponse.json({ error: 'from and to date params are required (YYYY-MM-DD)' }, { status: 400 })
  }
  const fromDate = new Date(from)
  const toDate   = new Date(to); toDate.setHours(23, 59, 59, 999)
  if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
    return NextResponse.json({ error: 'Invalid date format' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data: txs, error } = await supabase
    .from('inventory_transactions')
    .select(`
      quantity, unit_cost, total_cost, job_code,
      cost_center:cost_centers(id, code, name)
    `)
    .eq('org_id', auth.orgId)
    .in('transaction_type', ['consumption', 'sale'])
    .gte('created_at', fromDate.toISOString())
    .lte('created_at', toDate.toISOString())

  if (error) {
    console.error('[GET /api/reports/cost-analysis]', error)
    return NextResponse.json({ error: 'Failed to fetch expense data' }, { status: 500 })
  }

  const transactions = (txs ?? []) as any[]

  const ccLabel:  Record<string, string> = { [NONE]: 'Unassigned' }
  const jobLabel: Record<string, string> = { [NONE]: 'No job code' }
  const ccTotal:  Record<string, number> = {}
  const jobTotal: Record<string, number> = {}
  const cells:    Record<string, Record<string, number>> = {}
  let grandTotal = 0

  for (const tx of transactions) {
    const cost   = Number(tx.total_cost ?? (tx.quantity * tx.unit_cost)) || 0
    const ccKey  = tx.cost_center?.id ?? NONE
    const jobKey = tx.job_code ?? NONE

    if (tx.cost_center && !ccLabel[ccKey]) {
      ccLabel[ccKey] = tx.cost_center.code ? `${tx.cost_center.code} — ${tx.cost_center.name}` : tx.cost_center.name
    }
    if (tx.job_code && !jobLabel[jobKey]) jobLabel[jobKey] = tx.job_code

    ccTotal[ccKey]   = (ccTotal[ccKey]  ?? 0) + cost
    jobTotal[jobKey] = (jobTotal[jobKey] ?? 0) + cost
    if (!cells[ccKey]) cells[ccKey] = {}
    cells[ccKey][jobKey] = (cells[ccKey][jobKey] ?? 0) + cost
    grandTotal += cost
  }

  const round = (n: number) => Math.round(n * 100) / 100
  const cost_centers = Object.keys(ccTotal)
    .map(key => ({ key, label: ccLabel[key] ?? key, total: round(ccTotal[key]) }))
    .sort((a, b) => b.total - a.total)
  const job_codes = Object.keys(jobTotal)
    .map(key => ({ key, label: jobLabel[key] ?? key, total: round(jobTotal[key]) }))
    .sort((a, b) => b.total - a.total)
  // round the cells
  for (const cc of Object.keys(cells)) for (const j of Object.keys(cells[cc])) cells[cc][j] = round(cells[cc][j])

  const data = {
    period:            { from, to },
    grand_total:       round(grandTotal),
    transaction_count: transactions.length,
    cost_centers,
    job_codes,
    cells,
  }

  if (format === 'csv') {
    const esc = (v: any) => `"${String(v).replace(/"/g, '""')}"`
    const header = ['Cost Center', ...job_codes.map(j => j.label), 'Row Total']
    const rows = cost_centers.map(cc => [
      cc.label,
      ...job_codes.map(j => (cells[cc.key]?.[j.key] ?? 0).toFixed(2)),
      cc.total.toFixed(2),
    ])
    const totalRow = ['Column Total', ...job_codes.map(j => j.total.toFixed(2)), data.grand_total.toFixed(2)]
    const csv = [header, ...rows, totalRow].map(r => r.map(esc).join(',')).join('\r\n')
    return new NextResponse(csv, {
      headers: {
        'Content-Type':        'text/csv',
        'Content-Disposition': `attachment; filename="cost-analysis-${from}-to-${to}.csv"`,
      },
    })
  }

  return NextResponse.json({ data })
}
