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
 * Query params:
 *   from     YYYY-MM-DD   required
 *   to       YYYY-MM-DD   required
 *   cursor   ISO datetime  optional — return only entries after this timestamp (for incremental sync)
 *   types    csv list      optional — purchase,sale,consumption,adjustment,transfer,depreciation
 *   limit    number        optional — max 500, default 200
 *
 * Response:
 * {
 *   data: JournalEntry[],
 *   meta: { count, next_cursor, has_more, period: { from, to } }
 * }
 *
 * Each entry is a balanced double-entry line ready for import.
 * Poll on a schedule (e.g. hourly) using cursor for incremental updates.
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
        id, transaction_type, reference_no, quantity, unit_cost, notes, created_at,
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
      const amount = Math.abs(tx.quantity * (tx.unit_cost ?? 0))
      entries.push(mapTransaction(tx, amount))
    }
  }

  // ── Depreciation ────────────────────────────────────────────────────────────
  if (inc('depreciation')) {
    let q = supabase
      .from('asset_depreciation_log')
      .select(`id, period_start, amount, notes, created_at, asset:fixed_assets(name, asset_tag, category:categories(name))`)
      .eq('org_id', orgId)
      .gte('period_start', from)
      .lte('period_start', to)
      .order('period_start', { ascending: true })
      .limit(limit)

    if (cursor) q = q.gt('created_at', cursor)

    const { data: deps } = await q

    for (const d of deps ?? []) {
      const dep = d as any
      entries.push({
        id:             dep.id,
        timestamp:      dep.created_at ?? dep.period_start,
        date:           dep.period_start?.slice(0, 10),
        reference:      dep.id.slice(0, 8).toUpperCase(),
        source:         'depreciation',
        type:           'Depreciation',
        description:    `Depreciation — ${dep.asset?.asset_tag ?? ''} ${dep.asset?.name ?? ''}`.trim(),
        debit_account:  'Depreciation Expense',
        credit_account: 'Accumulated Depreciation',
        amount:         dep.amount,
        currency:       'USD',
        product_sku:    dep.asset?.asset_tag ?? null,
        product_name:   dep.asset?.name ?? null,
        category:       dep.asset?.category?.name ?? null,
        notes:          dep.notes ?? null,
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
      if (tx.quantity >= 0) { debit = 'Inventory Asset'; credit = 'Inventory Adjustment' }
      else                  { debit = 'Inventory Adjustment'; credit = 'Inventory Asset' }
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
    notes:          tx.notes ?? null,
  }
}
