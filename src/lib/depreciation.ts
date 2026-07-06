import { createServiceClient } from '@/lib/supabase/service'

/**
 * Shared depreciation math — used by the periodic depreciation run and the
 * disposal catch-up so both post identical amounts for identical periods.
 */

export interface DepreciableAsset {
  id: string
  asset_tag?: string | null
  depreciation_method?: string | null
  useful_life_years?: number | null
  salvage_value?: number | null
  purchase_cost?: number | null
  current_value?: number | null
  purchase_date?: string | null
}

export interface DepreciationResult {
  amount: number            // rounded to cents; 0 when nothing to post
  bookBefore: number
  bookAfter: number
  method: string
  skipped_reason?: string
}

/**
 * Depreciation for an inclusive period [periodStart, periodEnd].
 * Annual amount prorated by days over the start year's length (365/366),
 * capped so book value never falls below salvage.
 */
export function computePeriodDepreciation(
  asset: DepreciableAsset,
  periodStart: Date,
  periodEnd: Date,
): DepreciationResult {
  const method     = asset.depreciation_method ?? 'none'
  const bookValue  = Number(asset.current_value ?? asset.purchase_cost ?? 0)
  const cost       = Number(asset.purchase_cost ?? 0)
  const salvage    = Number(asset.salvage_value ?? 0)
  const usefulLife = Number(asset.useful_life_years ?? 0)

  const base: DepreciationResult = { amount: 0, bookBefore: bookValue, bookAfter: bookValue, method }

  if (method === 'none' || !asset.depreciation_method) {
    return { ...base, skipped_reason: 'Non-depreciable (method: none)' }
  }
  if (method === 'units_of_production') {
    return { ...base, skipped_reason: 'Units of production requires manual entry' }
  }
  if (bookValue <= salvage) {
    return { ...base, skipped_reason: 'Fully depreciated (book value ≤ salvage value)' }
  }
  if (usefulLife <= 0) {
    return { ...base, skipped_reason: 'useful_life_years not set' }
  }

  const periodDays = (periodEnd.getTime() - periodStart.getTime()) / 86_400_000 + 1
  if (periodDays <= 0) return { ...base, skipped_reason: 'Empty period' }

  const y = periodStart.getFullYear()
  const yearDays = ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0) ? 366 : 365
  const periodFraction = periodDays / yearDays

  let amount = 0
  if (method === 'straight_line') {
    amount = ((cost - salvage) / usefulLife) * periodFraction
  } else if (method === 'declining_balance') {
    amount = bookValue * (1 / usefulLife) * periodFraction
  } else if (method === 'double_declining') {
    amount = bookValue * (2 / usefulLife) * periodFraction
  } else {
    return { ...base, skipped_reason: `Unknown method: ${method}` }
  }

  amount = Math.min(amount, bookValue - salvage)
  amount = Math.round(amount * 100) / 100
  if (amount <= 0) return { ...base, skipped_reason: 'Rounds to zero' }

  const bookAfter = Math.round((bookValue - amount) * 100) / 100
  return { amount, bookBefore: bookValue, bookAfter, method }
}

/**
 * Post catch-up depreciation from the day after the asset's last depreciated
 * period (or its purchase date if never depreciated) through `throughDate`
 * (inclusive) — used at disposal so accumulated depreciation is complete to
 * the disposal date. Idempotent via the log's UNIQUE (asset, period) index.
 * Failures are non-fatal: returns 0 and the disposal proceeds without
 * catch-up rather than blocking the status change.
 */
export async function postCatchUpDepreciation(
  supabase: ReturnType<typeof createServiceClient>,
  orgId: string,
  userId: string,
  assetId: string,
  throughDate: string,   // YYYY-MM-DD
): Promise<number> {
  try {
    const { data: asset } = await supabase
      .from('fixed_assets')
      .select('id, asset_tag, depreciation_method, useful_life_years, salvage_value, purchase_cost, current_value, purchase_date')
      .eq('id', assetId)
      .eq('org_id', orgId)
      .single()
    if (!asset) return 0

    // Last depreciated day: max period_end in the log, else the purchase date
    const { data: lastLog } = await supabase
      .from('asset_depreciation_log')
      .select('period_end')
      .eq('asset_id', assetId)
      .order('period_end', { ascending: false })
      .limit(1)
      .maybeSingle()

    const lastEnd = lastLog?.period_end ?? asset.purchase_date
    if (!lastEnd) return 0   // no baseline to depreciate from

    const start = new Date(lastEnd)
    if (!lastLog) start.setDate(start.getDate())        // from purchase date itself
    else          start.setDate(start.getDate() + 1)    // day after last period
    const end = new Date(throughDate)
    if (start > end) return 0

    const result = computePeriodDepreciation(asset as DepreciableAsset, start, end)
    if (result.amount <= 0) return 0

    const period_start = start.toISOString().slice(0, 10)
    const period_end   = throughDate

    const { error: logErr } = await supabase
      .from('asset_depreciation_log')
      .insert({
        org_id:              orgId,
        asset_id:            assetId,
        period_start,
        period_end,
        method:              result.method,
        depreciation_amount: result.amount,
        book_value_before:   result.bookBefore,
        book_value_after:    result.bookAfter,
        run_by:              userId,
        notes:               `Catch-up depreciation to disposal date (${period_start} to ${period_end})`,
      })
    if (logErr) {
      console.error('[depreciation] catch-up insert failed:', logErr.message)
      return 0
    }

    await supabase
      .from('fixed_assets')
      .update({ current_value: result.bookAfter })
      .eq('id', assetId)

    return result.amount
  } catch (err) {
    console.error('[depreciation] catch-up failed:', (err as Error).message)
    return 0
  }
}
