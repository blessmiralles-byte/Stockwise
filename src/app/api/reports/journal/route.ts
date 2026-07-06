import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAnyRole } from '@/lib/api-auth'

/**
 * GET /api/reports/journal
 *
 * Returns inventory transactions and asset depreciation formatted as
 * double-entry journal entries suitable for import into accounting systems
 * (QuickBooks, Xero, MYOB, Wave, etc.)
 *
 * Query params:
 *   from   YYYY-MM-DD  required
 *   to     YYYY-MM-DD  required
 *   types  comma-separated: purchase,sale,consumption,adjustment,transfer,depreciation
 *          defaults to all
 *   format json (default) | csv
 *
 * Journal entry mapping:
 *   purchase    → Dr Inventory Asset        / Cr Accounts Payable
 *   sale        → Dr Cost of Goods Sold     / Cr Inventory Asset
 *   consumption → Dr Operating Expense      / Cr Inventory Asset
 *   adjustment+ → Dr Inventory Asset        / Cr Inventory Adjustment
 *   adjustment- → Dr Inventory Adjustment   / Cr Inventory Asset
 *   transfer    → Dr Inventory (to-loc)     / Cr Inventory (from-loc)
 *   depreciation→ Dr Depreciation Expense   / Cr Accumulated Depreciation
 */
export async function GET(req: NextRequest) {
  const auth = await requireAnyRole('owner', 'finance')
  if (auth.error) return auth.error

  const { searchParams } = req.nextUrl
  const from   = searchParams.get('from')
  const to     = searchParams.get('to')
  const types  = searchParams.get('types')?.split(',').filter(Boolean) ?? []
  const format = searchParams.get('format') ?? 'json'

  if (!from || !to) {
    return NextResponse.json({ error: 'from and to params are required (YYYY-MM-DD)' }, { status: 400 })
  }

  const fromDate = new Date(from)
  const toDate   = new Date(to); toDate.setHours(23, 59, 59, 999)

  if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
    return NextResponse.json({ error: 'Invalid date format' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const entries: JournalEntry[] = []

  const includeAll  = types.length === 0
  const include     = (t: string) => includeAll || types.includes(t)

  // ── Inventory transactions ──────────────────────────────────────────────────
  if (include('purchase') || include('sale') || include('consumption') || include('adjustment') || include('transfer')) {
    const txTypes: string[] = []
    if (include('purchase'))    txTypes.push('purchase')
    if (include('sale'))        txTypes.push('sale')
    if (include('consumption')) txTypes.push('consumption')
    if (include('adjustment'))  txTypes.push('adjustment')
    if (include('transfer'))    txTypes.push('transfer')

    const { data: txs } = await supabase
      .from('inventory_transactions')
      .select(`
        id, transaction_type, reference_no, quantity, unit_cost, total_cost, notes, created_at,
        product:products(name, sku, category:categories(name)),
        from_location:locations!inventory_transactions_from_location_id_fkey(name),
        to_location:locations!inventory_transactions_to_location_id_fkey(name)
      `)
      .eq('org_id', auth.orgId)
      .in('transaction_type', txTypes)
      .gte('created_at', fromDate.toISOString())
      .lte('created_at', toDate.toISOString())
      .order('created_at')

    for (const tx of txs ?? []) {
      const t          = tx as any
      // total_cost is signed (quantity × unit_cost; adjustments carry negative
      // quantity). Direction is expressed by the debit/credit accounts, so the
      // journal amount must always be the magnitude — a signed amount imported
      // into QuickBooks/Xero would reverse the entry.
      const amount     = Math.abs(Number(t.total_cost ?? (Number(t.quantity) * Number(t.unit_cost ?? 0))))
      const productRef = t.product?.sku ? `${t.product.sku} — ${t.product?.name}` : (t.product?.name ?? '')
      const category   = t.product?.category?.name ?? ''
      const ref        = t.reference_no ?? t.id.slice(0, 8).toUpperCase()
      const date       = t.created_at.slice(0, 10)
      const notes      = t.notes ?? ''

      switch (t.transaction_type) {
        case 'purchase':
          entries.push({
            date, reference: ref, type: 'Purchase',
            description: `Purchase — ${productRef}`,
            debit_account:  'Inventory Asset',
            credit_account: 'Accounts Payable',
            amount, product: productRef, category, notes,
          })
          break

        case 'sale':
          entries.push({
            date, reference: ref, type: 'Sale',
            description: `COGS — ${productRef}`,
            debit_account:  'Cost of Goods Sold',
            credit_account: 'Inventory Asset',
            amount, product: productRef, category, notes,
          })
          break

        case 'consumption':
          entries.push({
            date, reference: ref, type: 'Consumption',
            description: `Consumption — ${productRef}`,
            debit_account:  'Operating Expense',
            credit_account: 'Inventory Asset',
            amount, product: productRef, category, notes,
          })
          break

        case 'adjustment':
          if (t.quantity >= 0) {
            entries.push({
              date, reference: ref, type: 'Adjustment (+)',
              description: `Inventory adjustment (increase) — ${productRef}`,
              debit_account:  'Inventory Asset',
              credit_account: 'Inventory Adjustment',
              amount, product: productRef, category, notes,
            })
          } else {
            entries.push({
              date, reference: ref, type: 'Adjustment (−)',
              description: `Inventory adjustment (decrease) — ${productRef}`,
              debit_account:  'Inventory Adjustment',
              credit_account: 'Inventory Asset',
              amount, product: productRef, category, notes,
            })
          }
          break

        case 'transfer':
          entries.push({
            date, reference: ref, type: 'Transfer',
            description: `Stock transfer — ${productRef} · ${t.from_location?.name ?? '?'} → ${t.to_location?.name ?? '?'}`,
            debit_account:  `Inventory (${t.to_location?.name   ?? 'Destination'})`,
            credit_account: `Inventory (${t.from_location?.name ?? 'Source'})`,
            amount, product: productRef, category, notes,
          })
          break
      }
    }
  }

  // ── Asset depreciation ──────────────────────────────────────────────────────
  if (include('depreciation')) {
    const { data: deps } = await supabase
      .from('asset_depreciation_log')
      .select(`
        id, period_start, depreciation_amount, notes,
        asset:fixed_assets(name, asset_tag, category:categories(name))
      `)
      .eq('org_id', auth.orgId)
      .gte('period_start', from)
      .lte('period_start', to)
      .order('period_start')

    for (const d of deps ?? []) {
      const dep = d as any
      const assetRef = dep.asset?.asset_tag ? `${dep.asset.asset_tag} — ${dep.asset?.name}` : (dep.asset?.name ?? '')
      entries.push({
        date:           dep.period_start.slice(0, 10),
        reference:      dep.id.slice(0, 8).toUpperCase(),
        type:           'Depreciation',
        description:    `Depreciation — ${assetRef}`,
        debit_account:  'Depreciation Expense',
        credit_account: 'Accumulated Depreciation',
        amount:         Number(dep.depreciation_amount ?? 0),
        product:        assetRef,
        category:       dep.asset?.category?.name ?? '',
        notes:          dep.notes ?? '',
      })
    }
  }

  // Sort all entries by date
  entries.sort((a, b) => a.date.localeCompare(b.date))

  // ── CSV output ──────────────────────────────────────────────────────────────
  if (format === 'csv') {
    const headers = ['Date','Reference','Type','Description','Debit Account','Credit Account','Amount','Product / Asset','Category','Notes']
    const rows    = entries.map(e => [
      e.date, e.reference, e.type, e.description,
      e.debit_account, e.credit_account,
      e.amount.toFixed(2),
      e.product, e.category, e.notes,
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))

    const csv = [headers.join(','), ...rows].join('\r\n')
    return new NextResponse(csv, {
      headers: {
        'Content-Type':        'text/csv',
        'Content-Disposition': `attachment; filename="journal-${from}-to-${to}.csv"`,
      },
    })
  }

  // ── JSON output ─────────────────────────────────────────────────────────────
  const totalDebit  = entries.reduce((s, e) => s + e.amount, 0)
  const totalCredit = totalDebit // always balanced

  return NextResponse.json({
    data:         entries,
    count:        entries.length,
    total_debit:  totalDebit,
    total_credit: totalCredit,
    period:       { from, to },
  })
}

interface JournalEntry {
  date:           string
  reference:      string
  type:           string
  description:    string
  debit_account:  string
  credit_account: string
  amount:         number
  product:        string
  category:       string
  notes:          string
}
