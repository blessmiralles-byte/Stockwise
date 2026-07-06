import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAnyRole } from '@/lib/api-auth'

/**
 * GET /api/reports/journal
 *
 * Returns inventory and fixed-asset activity formatted as double-entry
 * journal entries suitable for import into accounting systems
 * (QuickBooks, Xero, MYOB, Wave, etc.)
 *
 * SCOPE (read before importing):
 *   • Entries cover INVENTORY and FIXED ASSETS only. No revenue entries are
 *     produced — sales revenue is invoiced and journaled in JobLedger.
 *   • Purchases credit Accounts Payable at goods receipt (a GRNI
 *     simplification); review period-end cutoff for received-not-invoiced.
 *   • No sales tax / VAT is computed or accrued anywhere in these entries.
 *   • Disposals: catch-up depreciation is posted through the disposal date at
 *     status change, and recorded sale proceeds (sale_price) are journaled to
 *     Undeposited Funds against Gain/Loss on Asset Disposal.
 *
 * Query params:
 *   from   YYYY-MM-DD  required
 *   to     YYYY-MM-DD  required
 *   types  comma-separated: purchase,sale,consumption,adjustment,transfer,
 *          depreciation,asset_purchase,asset_disposal,ppv — defaults to all
 *   format json (default) | csv
 *
 * Journal entry mapping:
 *   purchase       → Dr Inventory Asset          / Cr Accounts Payable
 *   sale           → Dr Cost of Goods Sold       / Cr Inventory Asset   (COGS side only)
 *   consumption    → Dr Operating Expense        / Cr Inventory Asset   (job/cost-center dimensions included)
 *   adjustment+    → Dr Inventory Asset          / Cr Inventory Shrinkage
 *   adjustment-    → Dr Inventory Shrinkage      / Cr Inventory Asset
 *   transfer       → Dr Inventory (to-loc)       / Cr Inventory (from-loc)
 *   depreciation   → Dr Depreciation Expense     / Cr Accumulated Depreciation
 *   asset_purchase → Dr Fixed Assets             / Cr Accounts Payable
 *   asset_disposal → Dr Accumulated Depreciation / Cr Fixed Assets (accum. portion)
 *                    Dr Gain/Loss on Asset Disposal / Cr Fixed Assets (remaining book value)
 *                    Dr Undeposited Funds        / Cr Gain/Loss on Asset Disposal (sale proceeds)
 *   ppv            → Dr Purchase Price Variance  / Cr Accounts Payable (invoice > GRN)
 *                    Dr Accounts Payable         / Cr Purchase Price Variance (invoice < GRN)
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
        job_order_id, job_code,
        cost_center:cost_centers(code, name),
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
      // Job-costing dimensions so consumption can be reclassified to WIP /
      // job cost by the accountant (and reconciled to JobLedger)
      const dims = {
        job_order:   t.job_order_id ?? '',
        job_code:    t.job_code ?? '',
        cost_center: t.cost_center ? `${t.cost_center.code} — ${t.cost_center.name}` : '',
      }

      switch (t.transaction_type) {
        case 'purchase':
          entries.push({
            date, reference: ref, type: 'Purchase',
            description: `Purchase — ${productRef}`,
            debit_account:  'Inventory Asset',
            credit_account: 'Accounts Payable',
            amount, product: productRef, category, notes, ...dims,
          })
          break

        case 'sale':
          entries.push({
            date, reference: ref, type: 'Sale',
            description: `COGS — ${productRef}`,
            debit_account:  'Cost of Goods Sold',
            credit_account: 'Inventory Asset',
            amount, product: productRef, category, notes, ...dims,
          })
          break

        case 'consumption':
          entries.push({
            date, reference: ref, type: 'Consumption',
            description: `Consumption — ${productRef}`,
            debit_account:  'Operating Expense',
            credit_account: 'Inventory Asset',
            amount, product: productRef, category, notes, ...dims,
          })
          break

        case 'adjustment':
          if (t.quantity >= 0) {
            entries.push({
              date, reference: ref, type: 'Adjustment (+)',
              description: `Inventory adjustment (increase) — ${productRef}`,
              debit_account:  'Inventory Asset',
              credit_account: 'Inventory Shrinkage',
              amount, product: productRef, category, notes, ...dims,
            })
          } else {
            entries.push({
              date, reference: ref, type: 'Adjustment (−)',
              description: `Inventory adjustment (decrease) — ${productRef}`,
              debit_account:  'Inventory Shrinkage',
              credit_account: 'Inventory Asset',
              amount, product: productRef, category, notes, ...dims,
            })
          }
          break

        case 'transfer':
          entries.push({
            date, reference: ref, type: 'Transfer',
            description: `Stock transfer — ${productRef} · ${t.from_location?.name ?? '?'} → ${t.to_location?.name ?? '?'}`,
            debit_account:  `Inventory (${t.to_location?.name   ?? 'Destination'})`,
            credit_account: `Inventory (${t.from_location?.name ?? 'Source'})`,
            amount, product: productRef, category, notes, ...dims,
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

  // ── Fixed-asset acquisitions ────────────────────────────────────────────────
  if (include('asset_purchase')) {
    const { data: acquired } = await supabase
      .from('fixed_assets')
      .select('id, asset_tag, name, purchase_date, purchase_cost, category:categories(name)')
      .eq('org_id', auth.orgId)
      .gte('purchase_date', from)
      .lte('purchase_date', to)
      .gt('purchase_cost', 0)
      .order('purchase_date')

    for (const a of (acquired ?? []) as any[]) {
      const assetRef = a.asset_tag ? `${a.asset_tag} — ${a.name}` : (a.name ?? '')
      entries.push({
        date:           a.purchase_date.slice(0, 10),
        reference:      a.asset_tag ?? a.id.slice(0, 8).toUpperCase(),
        type:           'Asset Purchase',
        description:    `Asset acquisition — ${assetRef}`,
        debit_account:  'Fixed Assets',
        credit_account: 'Accounts Payable',
        amount:         Number(a.purchase_cost),
        product:        assetRef,
        category:       a.category?.name ?? '',
        notes:          '',
      })
    }
  }

  // ── Fixed-asset disposals / retirements / sales ─────────────────────────────
  // Removes the asset at cost. Accumulated depreciation (complete to the
  // disposal date via catch-up posting) is relieved, remaining book value goes
  // to Gain/Loss on Asset Disposal, and recorded sale proceeds are debited to
  // Undeposited Funds against the same gain/loss account — its net balance is
  // the gain or loss on the sale.
  if (include('asset_disposal')) {
    const { data: assets } = await supabase
      .from('fixed_assets')
      .select('id, asset_tag, name, status, purchase_cost, current_value, sale_price, disposed_at, retired_at, sold_at, category:categories(name)')
      .eq('org_id', auth.orgId)
      .in('status', ['disposed', 'retired', 'sold'])

    for (const a of (assets ?? []) as any[]) {
      const when = a.disposed_at ?? a.retired_at ?? a.sold_at
      if (!when) continue
      const date = String(when).slice(0, 10)
      if (date < from || date > to) continue

      const cost     = Number(a.purchase_cost ?? 0)
      const book     = Math.max(0, Math.min(cost, Number(a.current_value ?? 0)))
      const accum    = Math.max(0, cost - book)
      const proceeds = a.status === 'sold' && a.sale_price != null ? Number(a.sale_price) : null
      if (cost <= 0) continue

      const assetRef = a.asset_tag ? `${a.asset_tag} — ${a.name}` : (a.name ?? '')
      const ref      = a.asset_tag ?? a.id.slice(0, 8).toUpperCase()
      const category = a.category?.name ?? ''
      const note = a.status === 'sold'
        ? (proceeds != null
            ? `Sold for ${proceeds.toFixed(2)}; net gain/(loss) = ${(proceeds - book).toFixed(2)}`
            : 'Asset marked sold but no sale price recorded — book the proceeds against Gain/Loss on Asset Disposal manually.')
        : ''

      if (accum > 0) {
        entries.push({
          date, reference: ref, type: 'Asset Disposal',
          description:    `Disposal — ${assetRef} (relieve accumulated depreciation)`,
          debit_account:  'Accumulated Depreciation',
          credit_account: 'Fixed Assets',
          amount:         accum,
          product:        assetRef, category, notes: note,
        })
      }
      if (book > 0) {
        entries.push({
          date, reference: ref, type: 'Asset Disposal',
          description:    `Disposal — ${assetRef} (write off remaining book value)`,
          debit_account:  'Gain/Loss on Asset Disposal',
          credit_account: 'Fixed Assets',
          amount:         book,
          product:        assetRef, category, notes: note,
        })
      }
      if (proceeds != null && proceeds > 0) {
        entries.push({
          date, reference: ref, type: 'Asset Disposal',
          description:    `Disposal — ${assetRef} (sale proceeds)`,
          debit_account:  'Undeposited Funds',
          credit_account: 'Gain/Loss on Asset Disposal',
          amount:         proceeds,
          product:        assetRef, category, notes: note,
        })
      }
    }
  }

  // ── Purchase price variance (invoice vs GRN, from three-way match) ──────────
  if (include('ppv')) {
    const { data: matchedPos } = await supabase
      .from('purchase_orders')
      .select(`
        id, po_number, supplier_invoice_no, supplier_invoice_date, supplier_invoice_amount,
        lines:purchase_order_lines(quantity_received, unit_cost)
      `)
      .eq('org_id', auth.orgId)
      .not('supplier_invoice_amount', 'is', null)
      .gte('supplier_invoice_date', from)
      .lte('supplier_invoice_date', to)
      .order('supplier_invoice_date')

    for (const p of (matchedPos ?? []) as any[]) {
      const grn      = ((p.lines ?? []) as any[]).reduce((s, l) => s + l.quantity_received * l.unit_cost, 0)
      const variance = Number(p.supplier_invoice_amount) - grn
      if (Math.abs(variance) <= 0.01) continue   // matched — no entry

      const over = variance > 0
      entries.push({
        date:           String(p.supplier_invoice_date).slice(0, 10),
        reference:      p.supplier_invoice_no ?? p.po_number,
        type:           'Purchase Price Variance',
        description:    `Invoice ${p.supplier_invoice_no ?? ''} vs GRN on ${p.po_number} — ${over ? 'over' : 'under'}-invoiced`,
        debit_account:  over ? 'Purchase Price Variance' : 'Accounts Payable',
        credit_account: over ? 'Accounts Payable' : 'Purchase Price Variance',
        amount:         Math.abs(variance),
        product:        p.po_number,
        category:       '',
        notes:          `Invoice ${Number(p.supplier_invoice_amount).toFixed(2)} vs received ${grn.toFixed(2)}`,
      })
    }
  }

  // Sort all entries by date
  entries.sort((a, b) => a.date.localeCompare(b.date))

  // ── CSV output ──────────────────────────────────────────────────────────────
  if (format === 'csv') {
    const headers = ['Date','Reference','Type','Description','Debit Account','Credit Account','Amount','Product / Asset','Category','Job Order','Job Code','Cost Center','Notes']
    const rows    = entries.map(e => [
      e.date, e.reference, e.type, e.description,
      e.debit_account, e.credit_account,
      e.amount.toFixed(2),
      e.product, e.category,
      e.job_order ?? '', e.job_code ?? '', e.cost_center ?? '',
      e.notes,
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
  // Job-costing dimensions (inventory transactions only)
  job_order?:     string
  job_code?:      string
  cost_center?:   string
}
