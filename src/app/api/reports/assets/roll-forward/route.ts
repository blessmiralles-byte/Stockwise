import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAnyRole } from '@/lib/api-auth'

/**
 * GET /api/reports/assets/roll-forward?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Fixed Assets Roll Forward — per category, shows:
 *
 *   COST ACCOUNT (Asset):
 *     Beginning balance  — cost of assets owned at period start
 *     + Additions        — cost of assets purchased in the period
 *     − Disposals        — cost of assets retired/disposed in the period
 *     = Ending balance
 *
 *   CONTRA ACCOUNT (Accumulated Depreciation):
 *     Beginning balance  — accum. depr. at period start
 *     + Depreciation     — from asset_depreciation_log entries in the period
 *     − On disposals     — accumulated depr. removed when asset is retired
 *     = Ending balance
 *
 *   NET BOOK VALUE (Ending) = Ending Cost − Ending Accum. Depr.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAnyRole('owner', 'finance')
  if (auth.error) return auth.error

  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from')
  const to   = searchParams.get('to')

  if (!from || !to) {
    return NextResponse.json(
      { error: 'from and to date params are required (YYYY-MM-DD)' },
      { status: 400 }
    )
  }

  const fromDate = new Date(from)
  const toDate   = new Date(to)
  toDate.setHours(23, 59, 59, 999)

  if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
    return NextResponse.json({ error: 'Invalid date format' }, { status: 400 })
  }
  if (fromDate > toDate) {
    return NextResponse.json({ error: 'from must be before to' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // ── Load all assets relevant to the period ─────────────────────────────────
  // Relevant = existed at any point up to period_end
  //   (purchased on or before period_end)
  // We load all and classify in JS.
  const { data: assets, error: assetErr } = await supabase
    .from('fixed_assets')
    .select(`
      id, name, asset_tag, status,
      purchase_cost, current_value,
      purchase_date, disposed_at,
      depreciation_method,
      category:categories(id, name)
    `)
    .eq('org_id', auth.orgId)
    .or(`purchase_date.lte.${to},purchase_date.is.null`)
    .order('purchase_date', { ascending: true })

  if (assetErr) {
    console.error('[roll-forward] assets', assetErr)
    return NextResponse.json({ error: 'Failed to load asset data' }, { status: 500 })
  }

  // ── Load depreciation entries strictly within the period ──────────────────
  // Match runs whose period_start ≥ from AND period_end ≤ to
  const { data: deprLog, error: deprErr } = await supabase
    .from('asset_depreciation_log')
    .select('asset_id, depreciation_amount, period_start, period_end')
    .eq('org_id', auth.orgId)
    .gte('period_start', from)
    .lte('period_end',   to)

  if (deprErr) {
    console.error('[roll-forward] depr log', deprErr)
    return NextResponse.json({ error: 'Failed to load depreciation data' }, { status: 500 })
  }

  // ── Index depreciation by asset ───────────────────────────────────────────
  const deprByAsset: Record<string, number> = {}
  for (const d of (deprLog ?? []) as any[]) {
    deprByAsset[d.asset_id] = (deprByAsset[d.asset_id] ?? 0) + Number(d.depreciation_amount)
  }

  // ── Classify each asset ───────────────────────────────────────────────────
  type AssetClass = {
    cost:            number
    currentValue:    number
    categoryId:      string
    categoryName:    string
    isBeginning:     boolean   // was on the books at period start
    isAddition:      boolean   // purchased during the period
    isDisposalInPeriod: boolean // disposed during the period
    isEndingBalance: boolean   // on the books at period end
    periodDepr:      number    // depreciation posted for this asset in period
  }

  const classified: AssetClass[] = []

  for (const a of (assets ?? []) as any[]) {
    const cost         = Number(a.purchase_cost ?? 0)
    const currentValue = Number(a.current_value ?? cost)
    const catId        = a.category?.id   ?? '__none__'
    const catName      = a.category?.name ?? 'Uncategorised'
    const purchaseDate = a.purchase_date ? new Date(a.purchase_date) : null
    const disposedAt   = a.disposed_at   ? new Date(a.disposed_at)   : null

    // Was the asset on the books at period start?
    //   Purchased before period start AND not yet disposed at period start
    const isBeginning = purchaseDate !== null
      && purchaseDate < fromDate
      && (disposedAt === null || disposedAt >= fromDate)

    // Was it added during the period?
    const isAddition  = purchaseDate !== null
      && purchaseDate >= fromDate
      && purchaseDate <= toDate

    // Was it disposed during the period?
    const isDisposalInPeriod = disposedAt !== null
      && disposedAt >= fromDate
      && disposedAt <= toDate

    // Is it on the books at period end?
    const isEndingBalance = (purchaseDate !== null && purchaseDate <= toDate)
      && (disposedAt === null || disposedAt > toDate)

    const periodDepr = deprByAsset[a.id] ?? 0

    classified.push({
      cost, currentValue, categoryId: catId, categoryName: catName,
      isBeginning, isAddition, isDisposalInPeriod, isEndingBalance, periodDepr,
    })
  }

  // ── Aggregate by category ─────────────────────────────────────────────────
  type CategoryRow = {
    id:   string
    name: string
    // Cost account
    beginning_cost:  number
    additions_cost:  number
    disposals_cost:  number
    ending_cost:     number
    // Contra account (accumulated depreciation) — stored as positive, sign shown in UI
    beginning_accum_depr: number
    period_depreciation:  number
    accum_depr_disposals: number   // removed on retirement
    ending_accum_depr:    number
    // Derived
    beginning_nbv:   number
    ending_nbv:      number
    // Asset counts
    count_beginning: number
    count_additions: number
    count_disposals: number
    count_ending:    number
  }

  const catMap: Record<string, CategoryRow> = {}

  const ensureCat = (id: string, name: string) => {
    if (!catMap[id]) {
      catMap[id] = {
        id, name,
        beginning_cost: 0, additions_cost: 0, disposals_cost: 0, ending_cost: 0,
        beginning_accum_depr: 0, period_depreciation: 0, accum_depr_disposals: 0, ending_accum_depr: 0,
        beginning_nbv: 0, ending_nbv: 0,
        count_beginning: 0, count_additions: 0, count_disposals: 0, count_ending: 0,
      }
    }
    return catMap[id]
  }

  for (const a of classified) {
    const cat = ensureCat(a.categoryId, a.categoryName)

    // ── Cost account ───────────────────────────────────────────────────────
    if (a.isBeginning)         { cat.beginning_cost += a.cost; cat.count_beginning++ }
    if (a.isAddition)          { cat.additions_cost  += a.cost; cat.count_additions++ }
    if (a.isDisposalInPeriod)  { cat.disposals_cost  += a.cost; cat.count_disposals++ }
    if (a.isEndingBalance)     { cat.ending_cost     += a.cost; cat.count_ending++ }

    // ── Accumulated depreciation ───────────────────────────────────────────

    // Period depreciation: from the log, only for assets that were active during period
    if (a.periodDepr > 0) {
      cat.period_depreciation += a.periodDepr
    }

    // Accumulated depreciation on disposals:
    //   When an asset is retired, we remove its accumulated depr.
    //   Accumulated depr at disposal ≈ cost − current_value (book value at disposal)
    if (a.isDisposalInPeriod) {
      const accumAtDisposal = Math.max(0, a.cost - a.currentValue)
      cat.accum_depr_disposals += accumAtDisposal
    }

    // Ending accumulated depreciation:
    //   For assets still on the books at period end: cost − current_value
    if (a.isEndingBalance) {
      cat.ending_accum_depr += Math.max(0, a.cost - a.currentValue)
    }
  }

  // ── Derive beginning accum depr and NBVs ─────────────────────────────────
  //   Roll-forward identity:
  //     Beg Accum Depr + Period Depr − Accum Depr on Disposals = Ending Accum Depr
  //   ∴  Beg Accum Depr = Ending − Period + Disposals removed

  for (const cat of Object.values(catMap)) {
    cat.beginning_accum_depr =
      cat.ending_accum_depr - cat.period_depreciation + cat.accum_depr_disposals

    cat.beginning_nbv = cat.beginning_cost - cat.beginning_accum_depr
    cat.ending_nbv    = cat.ending_cost    - cat.ending_accum_depr

    // Round to cents
    const round = (n: number) => Math.round(n * 100) / 100
    cat.beginning_cost        = round(cat.beginning_cost)
    cat.additions_cost        = round(cat.additions_cost)
    cat.disposals_cost        = round(cat.disposals_cost)
    cat.ending_cost           = round(cat.ending_cost)
    cat.beginning_accum_depr  = round(cat.beginning_accum_depr)
    cat.period_depreciation   = round(cat.period_depreciation)
    cat.accum_depr_disposals  = round(cat.accum_depr_disposals)
    cat.ending_accum_depr     = round(cat.ending_accum_depr)
    cat.beginning_nbv         = round(cat.beginning_nbv)
    cat.ending_nbv            = round(cat.ending_nbv)
  }

  // ── Sort: alphabetical, Uncategorised last ────────────────────────────────
  const categories = Object.values(catMap).sort((a, b) => {
    if (a.id === '__none__') return 1
    if (b.id === '__none__') return -1
    return a.name.localeCompare(b.name)
  })

  // ── Grand totals ─────────────────────────────────────────────────────────
  const total: Omit<CategoryRow, 'id' | 'name'> = {
    beginning_cost:       categories.reduce((s, c) => s + c.beginning_cost, 0),
    additions_cost:       categories.reduce((s, c) => s + c.additions_cost, 0),
    disposals_cost:       categories.reduce((s, c) => s + c.disposals_cost, 0),
    ending_cost:          categories.reduce((s, c) => s + c.ending_cost, 0),
    beginning_accum_depr: categories.reduce((s, c) => s + c.beginning_accum_depr, 0),
    period_depreciation:  categories.reduce((s, c) => s + c.period_depreciation, 0),
    accum_depr_disposals: categories.reduce((s, c) => s + c.accum_depr_disposals, 0),
    ending_accum_depr:    categories.reduce((s, c) => s + c.ending_accum_depr, 0),
    beginning_nbv:        categories.reduce((s, c) => s + c.beginning_nbv, 0),
    ending_nbv:           categories.reduce((s, c) => s + c.ending_nbv, 0),
    count_beginning:      categories.reduce((s, c) => s + c.count_beginning, 0),
    count_additions:      categories.reduce((s, c) => s + c.count_additions, 0),
    count_disposals:      categories.reduce((s, c) => s + c.count_disposals, 0),
    count_ending:         categories.reduce((s, c) => s + c.count_ending, 0),
  }

  return NextResponse.json({
    data: {
      period:     { from, to },
      categories,
      total,
    },
  })
}
