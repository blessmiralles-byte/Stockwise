import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAuth } from '@/lib/api-auth'
import {
  inventoryPosting, depreciationPosting, assetPurchasePosting,
  invoiceReceiptPosting, ppvPosting, computeDisposal, disposalLegs,
} from '@/lib/journal-mapping'

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
 * Purchases run through a GR/IR clearing account: goods receipt credits GR/IR
 * Clearing; recording the vendor invoice debits GR/IR and credits AP.
 *
 * Query params:
 *   from     YYYY-MM-DD   required
 *   to       YYYY-MM-DD   required
 *   cursor   ISO datetime  optional — return only entries after this timestamp (for incremental sync)
 *   types    csv list      optional — purchase,sale,consumption,adjustment,transfer,
 *            depreciation,asset_purchase,asset_disposal,invoice_receipt,ppv
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

    const depPosting = depreciationPosting()
    for (const d of deps ?? []) {
      const dep = d as any
      entries.push({
        id:             dep.id,
        timestamp:      dep.run_at ?? dep.period_start,
        date:           dep.period_start?.slice(0, 10),
        reference:      dep.id.slice(0, 8).toUpperCase(),
        source:         'depreciation',
        type:           depPosting.type,
        description:    `Depreciation — ${dep.asset?.asset_tag ?? ''} ${dep.asset?.name ?? ''}`.trim(),
        debit_account:  depPosting.debit_account,
        credit_account: depPosting.credit_account,
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

    const apPosting = assetPurchasePosting()
    for (const a of (acquired ?? []) as any[]) {
      entries.push({
        id:             `ap-${a.id}`,
        timestamp:      a.purchase_date,
        date:           String(a.purchase_date).slice(0, 10),
        reference:      a.asset_tag ?? a.id.slice(0, 8).toUpperCase(),
        source:         'fixed_assets',
        type:           apPosting.type,
        description:    `Asset acquisition — ${a.asset_tag ?? ''} ${a.name ?? ''}`.trim(),
        debit_account:  apPosting.debit_account,
        credit_account: apPosting.credit_account,
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

      const { cost, book, accum, proceeds } = computeDisposal(a)
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
      for (const leg of disposalLegs({ cost, book, accum, proceeds })) {
        entries.push({
          ...base,
          id:             `ad-${a.id}-${leg.leg}`,
          description:    `Disposal — ${a.asset_tag ?? ''} ${a.name ?? ''} (${leg.description_suffix})`.trim(),
          debit_account:  leg.debit_account,
          credit_account: leg.credit_account,
          amount:         leg.amount,
        })
      }
    }
  }

  // ── Vendor invoice recorded: clear GR/IR into AP, plus any price variance ───
  if (inc('invoice_receipt') || inc('ppv')) {
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

    const invRec = invoiceReceiptPosting()
    for (const p of (matchedPos ?? []) as any[]) {
      const grn      = ((p.lines ?? []) as any[]).reduce((s, l) => s + l.quantity_received * l.unit_cost, 0)
      const variance = Number(p.supplier_invoice_amount) - grn

      // Relieve the GR/IR accrual raised at goods receipt, at receipt value.
      if (inc('invoice_receipt') && grn > 0) {
        entries.push({
          id:             `ir-${p.id}`,
          timestamp:      p.supplier_invoice_date,
          date:           String(p.supplier_invoice_date).slice(0, 10),
          reference:      p.supplier_invoice_no ?? p.po_number,
          source:         'three_way_match',
          type:           invRec.type,
          description:    `Vendor invoice ${p.supplier_invoice_no ?? ''} on ${p.po_number} — clear GR/IR to payables`.replace(/\s+/g, ' ').trim(),
          debit_account:  invRec.debit_account,
          credit_account: invRec.credit_account,
          amount:         grn,
          currency:       'USD',
          product_sku:    null,
          product_name:   p.po_number,
          category:       null,
          notes:          `Goods received ${grn.toFixed(2)}; invoice ${Number(p.supplier_invoice_amount).toFixed(2)}`,
        })
      }

      if (!inc('ppv') || Math.abs(variance) <= 0.01) continue   // matched — no variance entry

      const over = variance > 0
      const ppv  = ppvPosting(over)
      entries.push({
        id:             `ppv-${p.id}`,
        timestamp:      p.supplier_invoice_date,
        date:           String(p.supplier_invoice_date).slice(0, 10),
        reference:      p.supplier_invoice_no ?? p.po_number,
        source:         'three_way_match',
        type:           ppv.type,
        description:    `Invoice ${p.supplier_invoice_no ?? ''} vs GRN on ${p.po_number} — ${over ? 'over' : 'under'}-invoiced`,
        debit_account:  ppv.debit_account,
        credit_account: ppv.credit_account,
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
  const posting = inventoryPosting(tx)

  return {
    id:             tx.id,
    timestamp:      tx.created_at,
    date:           tx.created_at?.slice(0, 10),
    reference:      ref,
    source:         'inventory',
    type:           posting.type,
    description:    `${posting.type} — ${tx.product?.name ?? ''}`,
    debit_account:  posting.debit_account,
    credit_account: posting.credit_account,
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
