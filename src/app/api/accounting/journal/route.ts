import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAuth } from '@/lib/api-auth'

/**
 * GET /api/accounting/journal
 *
 * Machine-readable journal feed for accounting system integrations.
 * Supports two auth modes:
 *   1. Session cookie (browser / same-origin)
 *   2. API key header: Authorization: Bearer {ACCOUNTING_API_KEY}
 *
 * SCOPE: entries cover INVENTORY and FIXED ASSETS only — no revenue entries
 * (sales are invoiced and journaled in JobLedger) and no sales tax / VAT.
 * Purchases credit Accounts Payable at goods receipt (GRNI simplification).
 *
 * Query params:
 *   from     YYYY-MM-DD   required
 *   to       YYYY-MM-DD   required
 *   cursor   ISO datetime  optional — return only entries after this timestamp (for incremental sync)
 *   types    csv list      optional — purchase,sale,consumption,adjustment,transfer,
 *            depreciation,asset_purchase,asset_disposal,ppv
 *   limit    number        optional — max 500, default 200
 *
 * Response:
 * {
 *   data: JournalEntry[],
 *   meta: { count, next_cursor, has_more, period: { from, to } }
 * }
 *
 * Each entry is a balanced double-entry line ready for import; dedupe by `id`
 * (asset_purchase/asset_disposal/ppv entries are period-scoped, not
 * cursor-scoped, so they can reappear across cursor polls).
 */
export async function GET(req: NextRequest) {
  // ── Auth: API key or session ───────────────────────────────────────────────
  const apiKey = process.env.ACCOUNTING_API_KEY
  const authHeader = req.headers.get('authorization') ?? ''

  let orgId: string | null = null

  if (apiKey && authHeader === `Bearer ${apiKey}`) {
    // API key auth: read org_id from query param or default to first org
    const qOrgId = req.nextUrl.searchParams.get('org_id')
    if (!qOrgId) {
      return NextResponse.json(
        { error: 'org_id query param is required when using API key auth' },
        { status: 400 }
      )
    }
    orgId = qOrgId
  } else {
    // Session auth
    const auth = await requireAuth()
    if (auth.error) return auth.error
    if (!['owner', 'finance', 'admin'].includes(auth.role)) {
      return NextResponse.json({ error: 'Finance or Owner role required' }, { status: 403 })
    }
    orgId = auth.orgId
  }

  const { searchParams } = req.nextUrl
  const from   = searchParams.get('from')
  const to     = searchParams.get('to')
  const cursor = searchParams.get('cursor')   // ISO datetime — return entries AFTER this
  const types  = searchParams.get('types')?.split(',').filter(Boolean) ?? []
  const limit  = Math.min(Number(searchParams.get('limit') ?? '200'), 500)

  if (!from || !to) {
    return NextResponse.json({ error: 'from and to params required (YYYY-MM-DD)' }, { status: 400 })
  }

  const supabase   = createServiceClient()
  const entries: any[] = []

  const includeAll = types.length === 0
  const inc        = (t: string) => includeAll || types.includes(t)

  // ── Inventory transactions ──────────────────────────────────────────────────
  const txTypes: string[] = []
  if (inc('purchase'))    txTypes.push('purchase')
  if (inc('sale'))        txTypes.push('sale')
  if (inc('consumption')) txTypes.push('consumption')
  if (inc('adjustment'))  txTypes.push('adjustment')
  if (inc('transfer'))    txTypes.push('transfer')

  if (txTypes.length > 0) {
    let q = supabase
      .from('inventory_transactions')
      .select(`
        id, transaction_type, reference_no, quantity, unit_cost, total_cost, notes, created_at,
        job_order_id, job_code,
        cost_center:cost_centers(code, name),
        product:products(id, sku, name, category:categories(name)),
        from_location:locations!inventory_transactions_from_location_id_fkey(id, name),
        to_location:locations!inventory_transactions_to_location_id_fkey(id, name)
      `)
      .eq('org_id', orgId)
      .in('transaction_type', txTypes)
      .gte('created_at', `${from}T00:00:00.000Z`)
      .lte('created_at', `${to}T23:59:59.999Z`)
      .order('created_at', { ascending: true })
      .limit(limit)

    if (cursor) q = q.gt('created_at', cursor)

    const { data: txs } = await q

    for (const t of txs ?? []) {
      const tx = t as any
      // Magnitude only — direction lives in the debit/credit accounts, and
      // total_cost is signed for negative-quantity adjustments.
      const amount = Math.abs(Number(tx.total_cost ?? (tx.quantity * (tx.unit_cost ?? 0))))
      entries.push(mapTransaction(tx, amount))
    }
  }

  // ── Depreciation ────────────────────────────────────────────────────────────
  if (inc('depreciation')) {
    // NB: the log's columns are depreciation_amount / run_at (not amount /
    // created_at) — selecting the wrong names silently dropped every
    // depreciation entry from this feed.
    let q = supabase
      .from('asset_depreciation_log')
      .select(`id, period_start, depreciation_amount, notes, run_at, asset:fixed_assets(name, asset_tag, category:categories(name))`)
      .eq('org_id', orgId)
      .gte('period_start', from)
      .lte('period_start', to)
      .order('period_start', { ascending: true })
      .limit(limit)

    if (cursor) q = q.gt('run_at', cursor)

    const { data: deps } = await q

    for (const d of deps ?? []) {
      const dep = d as any
      entries.push({
        id:             dep.id,
        timestamp:      dep.run_at ?? dep.period_start,
        date:           dep.period_start?.slice(0, 10),
        reference:      dep.id.slice(0, 8).toUpperCase(),
        source:         'depreciation',
        type:           'Depreciation',
        description:    `Depreciation — ${dep.asset?.asset_tag ?? ''} ${dep.asset?.name ?? ''}`.trim(),
        debit_account:  'Depreciation Expense',
        credit_account: 'Accumulated Depreciation',
        amount:         Number(dep.depreciation_amount ?? 0),
        currency:       'USD',
        product_sku:    dep.asset?.asset_tag ?? null,
        product_name:   dep.asset?.name ?? null,
        category:       dep.asset?.category?.name ?? null,
        notes:          dep.notes ?? null,
      })
    }
  }

  // ── Fixed-asset acquisitions ────────────────────────────────────────────────
  if (inc('asset_purchase')) {
    const { data: acquired } = await supabase
      .from('fixed_assets')
      .select('id, asset_tag, name, purchase_date, purchase_cost, category:categories(name)')
      .eq('org_id', orgId)
      .gte('purchase_date', from)
      .lte('purchase_date', to)
      .gt('purchase_cost', 0)
      .order('purchase_date')
      .limit(limit)

    for (const a of (acquired ?? []) as any[]) {
      entries.push({
        id:             `ap-${a.id}`,
        timestamp:      a.purchase_date,
        date:           String(a.purchase_date).slice(0, 10),
        reference:      a.asset_tag ?? a.id.slice(0, 8).toUpperCase(),
        source:         'fixed_assets',
        type:           'Asset Purchase',
        description:    `Asset acquisition — ${a.asset_tag ?? ''} ${a.name ?? ''}`.trim(),
        debit_account:  'Fixed Assets',
        credit_account: 'Accounts Payable',
        amount:         Number(a.purchase_cost),
        currency:       'USD',
        product_sku:    a.asset_tag ?? null,
        product_name:   a.name ?? null,
        category:       a.category?.name ?? null,
        notes:          null,
      })
    }
  }

  // ── Fixed-asset disposals / retirements / sales ─────────────────────────────
  // Accumulated depreciation is complete to the disposal date (catch-up posts
  // at status change); recorded sale proceeds go to Undeposited Funds against
  // Gain/Loss on Asset Disposal, whose net balance is the gain or loss.
  if (inc('asset_disposal')) {
    const { data: assets } = await supabase
      .from('fixed_assets')
      .select('id, asset_tag, name, status, purchase_cost, current_value, sale_price, disposed_at, retired_at, sold_at, category:categories(name)')
      .eq('org_id', orgId)
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

      const base = {
        timestamp:    when,
        date,
        reference:    a.asset_tag ?? a.id.slice(0, 8).toUpperCase(),
        source:       'fixed_assets',
        type:         'Asset Disposal',
        currency:     'USD',
        product_sku:  a.asset_tag ?? null,
        product_name: a.name ?? null,
        category:     a.category?.name ?? null,
        notes: a.status === 'sold'
          ? (proceeds != null
              ? `Sold for ${proceeds.toFixed(2)}; net gain/(loss) = ${(proceeds - book).toFixed(2)}`
              : 'Asset marked sold but no sale price recorded — book the proceeds against Gain/Loss on Asset Disposal manually.')
          : null,
      }
      if (accum > 0) {
        entries.push({
          ...base,
          id: `ad-${a.id}-accum`,
          description:    `Disposal — ${a.asset_tag ?? ''} ${a.name ?? ''} (relieve accumulated depreciation)`.trim(),
          debit_account:  'Accumulated Depreciation',
          credit_account: 'Fixed Assets',
          amount:         accum,
        })
      }
      if (book > 0) {
        entries.push({
          ...base,
          id: `ad-${a.id}-loss`,
          description:    `Disposal — ${a.asset_tag ?? ''} ${a.name ?? ''} (write off remaining book value)`.trim(),
          debit_account:  'Gain/Loss on Asset Disposal',
          credit_account: 'Fixed Assets',
          amount:         book,
        })
      }
      if (proceeds != null && proceeds > 0) {
        entries.push({
          ...base,
          id: `ad-${a.id}-proceeds`,
          description:    `Disposal — ${a.asset_tag ?? ''} ${a.name ?? ''} (sale proceeds)`.trim(),
          debit_account:  'Undeposited Funds',
          credit_account: 'Gain/Loss on Asset Disposal',
          amount:         proceeds,
        })
      }
    }
  }

  // ── Purchase price variance (invoice vs GRN, from three-way match) ──────────
  if (inc('ppv')) {
    const { data: matchedPos } = await supabase
      .from('purchase_orders')
      .select(`
        id, po_number, supplier_invoice_no, supplier_invoice_date, supplier_invoice_amount,
        lines:purchase_order_lines(quantity_received, unit_cost)
      `)
      .eq('org_id', orgId)
      .not('supplier_invoice_amount', 'is', null)
      .gte('supplier_invoice_date', from)
      .lte('supplier_invoice_date', to)
      .order('supplier_invoice_date')
      .limit(limit)

    for (const p of (matchedPos ?? []) as any[]) {
      const grn      = ((p.lines ?? []) as any[]).reduce((s, l) => s + l.quantity_received * l.unit_cost, 0)
      const variance = Number(p.supplier_invoice_amount) - grn
      if (Math.abs(variance) <= 0.01) continue   // matched — no entry

      const over = variance > 0
      entries.push({
        id:             `ppv-${p.id}`,
        timestamp:      p.supplier_invoice_date,
        date:           String(p.supplier_invoice_date).slice(0, 10),
        reference:      p.supplier_invoice_no ?? p.po_number,
        source:         'three_way_match',
        type:           'Purchase Price Variance',
        description:    `Invoice ${p.supplier_invoice_no ?? ''} vs GRN on ${p.po_number} — ${over ? 'over' : 'under'}-invoiced`,
        debit_account:  over ? 'Purchase Price Variance' : 'Accounts Payable',
        credit_account: over ? 'Accounts Payable' : 'Purchase Price Variance',
        amount:         Math.abs(variance),
        currency:       'USD',
        product_sku:    null,
        product_name:   p.po_number,
        category:       null,
        notes:          `Invoice ${Number(p.supplier_invoice_amount).toFixed(2)} vs received ${grn.toFixed(2)}`,
      })
    }
  }

  // Sort by timestamp, apply limit
  entries.sort((a, b) => (a.timestamp > b.timestamp ? 1 : -1))
  const page       = entries.slice(0, limit)
  const next_cursor = page.length > 0 ? page[page.length - 1].timestamp : null

  return NextResponse.json({
    data: page,
    meta: {
      count:       page.length,
      next_cursor,
      has_more:    entries.length > limit,
      period:      { from, to },
    },
  }, {
    headers: { 'Cache-Control': 'no-store' },
  })
}

function mapTransaction(tx: any, amount: number) {
  const ref    = tx.reference_no ?? tx.id.slice(0, 8).toUpperCase()
  const product = tx.product?.sku ? `${tx.product.sku}` : null
  let debit: string, credit: string, type: string

  switch (tx.transaction_type) {
    case 'purchase':
      debit = 'Inventory Asset'; credit = 'Accounts Payable'; type = 'Purchase'; break
    case 'sale':
      debit = 'Cost of Goods Sold'; credit = 'Inventory Asset'; type = 'Sale'; break
    case 'consumption':
      debit = 'Operating Expense'; credit = 'Inventory Asset'; type = 'Consumption'; break
    case 'adjustment':
      if (tx.quantity >= 0) { debit = 'Inventory Asset'; credit = 'Inventory Shrinkage' }
      else                  { debit = 'Inventory Shrinkage'; credit = 'Inventory Asset' }
      type = tx.quantity >= 0 ? 'Adjustment (+)' : 'Adjustment (−)'; break
    case 'transfer':
      debit  = `Inventory — ${tx.to_location?.name   ?? 'Destination'}`
      credit = `Inventory — ${tx.from_location?.name ?? 'Source'}`
      type   = 'Transfer'; break
    default:
      debit = 'Inventory Asset'; credit = 'Suspense'; type = tx.transaction_type
  }

  return {
    id:             tx.id,
    timestamp:      tx.created_at,
    date:           tx.created_at?.slice(0, 10),
    reference:      ref,
    source:         'inventory',
    type,
    description:    `${type} — ${tx.product?.name ?? ''}`,
    debit_account:  debit,
    credit_account: credit,
    amount,
    currency:       'USD',
    quantity:       Math.abs(tx.quantity),
    unit_cost:      tx.unit_cost ?? 0,
    product_sku:    product,
    product_name:   tx.product?.name ?? null,
    category:       tx.product?.category?.name ?? null,
    // Job-costing dimensions for WIP/job reclassification and JobLedger reconciliation
    job_order:      tx.job_order_id ?? null,
    job_code:       tx.job_code ?? null,
    cost_center:    tx.cost_center ? `${tx.cost_center.code} — ${tx.cost_center.name}` : null,
    notes:          tx.notes ?? null,
  }
}
