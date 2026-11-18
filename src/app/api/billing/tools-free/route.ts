import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAnyRole } from '@/lib/api-auth'
import { canSwitchToToolsFree } from '@/lib/billing'
import { PLAN_CONFIG } from '@/lib/plan-config'

/**
 * POST /api/billing/tools-free
 * Moves a locked org (trial over, or subscription ended) onto the free
 * Stocked Tools plan. Nothing is deleted: inventory data stays in the
 * database, just out of reach of the Tools plan's pages, and upgrading later
 * brings it all back. Over the free tool limit they simply can't add more.
 *
 * Restricted to: owner
 */
export async function POST() {
  const auth = await requireAnyRole('owner')
  if (auth.error) return auth.error
  if (!auth.orgId) return NextResponse.json({ error: 'No organization found' }, { status: 400 })

  const supabase = createServiceClient()
  const { data: org } = await supabase
    .from('organizations')
    .select('plan, plan_status, trial_ends_at, trial_reused')
    .eq('id', auth.orgId)
    .single()
  if (!org) return NextResponse.json({ error: 'Organization not found' }, { status: 404 })

  // Already there (a second click, or another tab): nothing to change, and
  // nothing wrong. The page just carries on to the tool tracker.
  if ((org as any).plan === 'tools_free') {
    return NextResponse.json({ ok: true, already: true })
  }

  if (!canSwitchToToolsFree(org as any)) {
    return NextResponse.json(
      { error: 'Your account is on an active plan. Cancel it under Settings → Billing before switching to Stocked Tools Free.' },
      { status: 409 },
    )
  }

  const { error } = await supabase
    .from('organizations')
    .update({
      plan:        'tools_free',
      plan_status: 'active',
      max_users:   PLAN_CONFIG.tools_free.maxUsers,
    })
    .eq('id', auth.orgId)
  if (error) {
    console.error('[billing/tools-free]', error.message)
    return NextResponse.json({ error: 'Could not switch plans. Please try again.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
