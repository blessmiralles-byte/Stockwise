import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAnyRole } from '@/lib/api-auth'
import { logAudit } from '@/lib/audit'

/**
 * POST /api/assets/depreciation/run
 * Calculates and posts depreciation for all active, depreciable assets
 * for a given period.
 *
 * Body:
 *   period_start  string  YYYY-MM-DD  (first day of the period)
 *   period_end    string  YYYY-MM-DD  (last day of the period)
 *   dry_run?      boolean             If true, returns what WOULD be posted without saving
 */
export async function POST(req: NextRequest) {
  const auth = await requireAnyRole('owner', 'finance')
  if (auth.error) return auth.error

  let body: any
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { period_start, period_end, dry_run = false } = body
  if (!period_start || !period_end) {
    return NextResponse.json({ error: 'period_start and period_end are required (YYYY-MM-DD)' }, { status: 400 })
  }

  const startDate = new Date(period_start)
  const endDate   = new Date(period_end)
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    return NextResponse.json({ error: 'Invalid date format' }, { status: 400 })
  }
  if (startDate > endDate) {
    return NextResponse.json({ error: 'period_start must be before period_end' }, { status: 400 })
  }

  const periodDays     = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24) + 1
  const yearDays       = ((startDate.getFullYear() % 4 === 0 && startDate.getFullYear() % 100 !== 0) || startDate.getFullYear() % 400 === 0) ? 366 : 365
  const periodFraction = periodDays / yearDays

  const supabase = createServiceClient()

  // Load all active assets with depreciation data
  const { data: assets, error: assetErr } = await supabase
    .from('fixed_assets')
    .select('id, asset_tag, name, depreciation_method, useful_life_years, salvage_value, purchase_cost, current_value, purchase_date')
    .eq('org_id', auth.orgId)
    .eq('status', 'active')
    .not('depreciation_method', 'eq', 'none')
    .not('depreciation_method', 'is', null)

  if (assetErr) {
    return NextResponse.json({ error: 'Failed to load assets' }, { status: 500 })
  }

  // Check for already-posted entries in this period (idempotency guard)
  const { data: existing } = await supabase
    .from('asset_depreciation_log')
    .select('asset_id')
    .eq('org_id', auth.orgId)
    .eq('period_start', period_start)
    .eq('period_end',   period_end)

  const alreadyPosted = new Set((existing ?? []).map((r: any) => r.asset_id))

  type DepreciationLine = {
    asset_id:            string
    asset_tag:           string
    name:                string
    method:              string
    book_value_before:   number
    depreciation_amount: number
    book_value_after:    number
    skipped_reason?:     string
  }

  const lines:   DepreciationLine[] = []
  const skipped: DepreciationLine[] = []

  for (const asset of (assets ?? []) as any[]) {
    if (alreadyPosted.has(asset.id)) {
      skipped.push({ ...asset, book_value_before: 0, depreciation_amount: 0, book_value_after: 0, skipped_reason: 'Already posted for this period' })
      continue
    }

    const bookValue    = Number(asset.current_value ?? asset.purchase_cost ?? 0)
    const cost         = Number(asset.purchase_cost  ?? 0)
    const salvage      = Number(asset.salvage_value  ?? 0)
    const usefulLife   = Number(asset.useful_life_years ?? 0)
    const method       = asset.depreciation_method as string

    if (bookValue <= salvage) {
      skipped.push({ ...asset, book_value_before: bookValue, depreciation_amount: 0, book_value_after: bookValue, skipped_reason: 'Fully depreciated (book value ≤ salvage value)' })
      continue
    }

    let deprAmount = 0

    if (method === 'straight_line') {
      if (usefulLife <= 0) {
        skipped.push({ ...asset, book_value_before: bookValue, depreciation_amount: 0, book_value_after: bookValue, skipped_reason: 'useful_life_years not set' })
        continue
      }
      const annualDepr = (cost - salvage) / usefulLife
      deprAmount       = annualDepr * periodFraction

    } else if (method === 'declining_balance') {
      if (usefulLife <= 0) {
        skipped.push({ ...asset, book_value_before: bookValue, depreciation_amount: 0, book_value_after: bookValue, skipped_reason: 'useful_life_years not set' })
        continue
      }
      const rate    = 1 / usefulLife
      deprAmount    = bookValue * rate * periodFraction

    } else if (method === 'double_declining') {
      if (usefulLife <= 0) {
        skipped.push({ ...asset, book_value_before: bookValue, depreciation_amount: 0, book_value_after: bookValue, skipped_reason: 'useful_life_years not set' })
        continue
      }
      const rate    = 2 / usefulLife
      deprAmount    = bookValue * rate * periodFraction

    } else if (method === 'units_of_production') {
      skipped.push({ ...asset, book_value_before: bookValue, depreciation_amount: 0, book_value_after: bookValue, skipped_reason: 'Units of production requires manual entry' })
      continue
    } else {
      continue
    }

    // Cap at remaining depreciable amount so we never go below salvage
    deprAmount = Math.min(deprAmount, bookValue - salvage)
    deprAmount = Math.round(deprAmount * 100) / 100  // round to cents

    if (deprAmount <= 0) continue

    const newBookValue = Math.round((bookValue - deprAmount) * 100) / 100

    lines.push({
      asset_id:            asset.id,
      asset_tag:           asset.asset_tag,
      name:                asset.name,
      method,
      book_value_before:   bookValue,
      depreciation_amount: deprAmount,
      book_value_after:    newBookValue,
    })
  }

  if (dry_run) {
    return NextResponse.json({
      data: {
        dry_run: true,
        period: { period_start, period_end, days: periodDays },
        lines,
        skipped,
        total_depreciation: lines.reduce((s, l) => s + l.depreciation_amount, 0),
      },
    })
  }

  // Post to asset_depreciation_log and update current_value
  const errors: string[] = []

  for (const line of lines) {
    const { error: logErr } = await supabase
      .from('asset_depreciation_log')
      .insert({
        org_id:              auth.orgId,
        asset_id:            line.asset_id,
        period_start,
        period_end,
        method:              line.method,
        depreciation_amount: line.depreciation_amount,
        book_value_before:   line.book_value_before,
        book_value_after:    line.book_value_after,
        run_by:              auth.userId,
        notes:               `Period: ${period_start} to ${period_end}`,
      })

    if (logErr) {
      errors.push(`${line.asset_tag}: ${logErr.message}`)
      continue
    }

    const { error: updateErr } = await supabase
      .from('fixed_assets')
      .update({ current_value: line.book_value_after })
      .eq('id', line.asset_id)

    if (updateErr) {
      errors.push(`${line.asset_tag} (value update): ${updateErr.message}`)
    }
  }

  const totalDepreciation = lines.reduce((s, l) => s + l.depreciation_amount, 0)

  await logAudit({
    actorId:   auth.userId,
    orgId:     auth.orgId,
    action:    'asset.depreciation_run',
    tableName: 'asset_depreciation_log',
    recordId:  undefined,
    newValue:  {
      period_start,
      period_end,
      assets_depreciated: lines.length - errors.length,
      total_depreciation:  totalDepreciation,
    },
  })

  return NextResponse.json({
    data: {
      period: { period_start, period_end, days: periodDays },
      assets_posted:      lines.length - errors.length,
      total_depreciation: totalDepreciation,
      lines,
      skipped,
      errors: errors.length > 0 ? errors : undefined,
    },
  })
}

/** GET /api/assets/depreciation/run — depreciation history */
export async function GET(req: NextRequest) {
  const auth = await requireAnyRole('owner', 'finance')
  if (auth.error) return auth.error

  const { searchParams } = req.nextUrl
  const assetId = searchParams.get('asset_id')

  const supabase = createServiceClient()
  let query = supabase
    .from('asset_depreciation_log')
    .select(`
      id, period_start, period_end, method,
      depreciation_amount, book_value_before, book_value_after, run_at, notes,
      asset:fixed_assets(id, asset_tag, name),
      run_by:user_profiles!run_by(id, full_name)
    `)
    .eq('org_id', auth.orgId)
    .order('run_at', { ascending: false })
    .limit(200)

  if (assetId) query = query.eq('asset_id', assetId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: 'Failed to fetch depreciation history' }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}
