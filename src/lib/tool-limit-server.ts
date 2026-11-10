import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { PLAN_REQUIRED_CODE } from '@/lib/entitlements'
import { toolLimit, toolsOverLimit } from '@/lib/plan-config'

/** Tools that no longer count against the limit — they've left the business. */
const GONE = ['disposed', 'retired', 'sold']

/**
 * A 403 if adding `adding` tools would take a free Stocked Tools account past
 * its limit, otherwise null. Every other plan passes without a query beyond
 * the plan lookup.
 */
export async function toolLimitRefusal(
  supabase: SupabaseClient,
  orgId: string,
  adding = 1,
): Promise<NextResponse | null> {
  const { data: org } = await supabase
    .from('organizations').select('plan').eq('id', orgId).maybeSingle()
  const limit = toolLimit((org as any)?.plan)
  if (limit == null) return null

  const { count } = await supabase
    .from('fixed_assets')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .not('status', 'in', `(${GONE.join(',')})`)

  const have = count ?? 0
  if (!toolsOverLimit(limit, have, adding)) return null

  const room = Math.max(0, limit - have)
  return NextResponse.json(
    {
      error: adding === 1
        ? `The free plan holds ${limit} tools and you have ${have}. Upgrade to Stocked Tools for unlimited tools.`
        : `The free plan holds ${limit} tools. You have ${have}, so there is room for ${room} more — this would add ${adding}. Upgrade to Stocked Tools for unlimited tools.`,
      code:          PLAN_REQUIRED_CODE,
      required_plan: 'tools',
      limit, have,
    },
    { status: 403 },
  )
}
