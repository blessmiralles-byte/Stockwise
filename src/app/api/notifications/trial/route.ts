import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAnyRole } from '@/lib/api-auth'
import { sendTrialEmail } from '@/lib/email'
import { trialEmailDue, daysBetween, type TrialOrgRow } from '@/lib/trial-lifecycle'
import { monthlyPrice } from '@/lib/plan-config'

/**
 * Trial lifecycle emails — welcome, a mid-trial nudge, the last day, and one
 * after it ends.
 *
 * GET with the cron secret runs every organization (Vercel Cron, daily).
 * POST as an owner is a dry run for the caller's own org, so the wording can
 * be checked without waiting a fortnight.
 *
 * Each kind is sent once per organization; what has gone out is recorded on
 * organizations.lifecycle_emails.
 */

function isCronRequest(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return (
    req.headers.get('x-cron-secret') === secret ||
    req.headers.get('authorization') === `Bearer ${secret}`
  )
}

export async function GET(req: NextRequest) {
  if (!isCronRequest(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return run({ dryRun: false, orgId: null })
}

/** Owner-only preview: says what would be sent today, and sends nothing. */
export async function POST(req: NextRequest) {
  if (isCronRequest(req)) return run({ dryRun: false, orgId: null })

  const auth = await requireAnyRole('owner')
  if (auth.error) return auth.error
  return run({ dryRun: true, orgId: auth.orgId })
}

async function run({ dryRun, orgId }: { dryRun: boolean; orgId: string | null }) {
  const supabase = createServiceClient()
  const today = new Date()

  let orgQ = supabase
    .from('organizations')
    .select('id, name, plan, plan_status, trial_ends_at, created_at, lifecycle_emails, pricing_region')
    .eq('plan', 'trial')
  if (orgId) orgQ = orgQ.eq('id', orgId)

  const { data: orgs, error } = await orgQ
  if (error) {
    console.error('[trial-emails] orgs', error)
    return NextResponse.json({ error: error.message ?? 'Failed to read organizations' }, { status: 500 })
  }

  const planned: { org: string; kind: string }[] = []
  let sent = 0
  const failures: string[] = []

  for (const org of (orgs ?? []) as any[]) {
    const kind = trialEmailDue(org as TrialOrgRow, today)
    if (!kind) continue
    planned.push({ org: org.name ?? org.id, kind })
    if (dryRun) continue

    // Owners and admins — the people who can actually act on it.
    const { data: recipients } = await supabase
      .from('user_profiles')
      .select('email')
      .eq('org_id', org.id)
      .in('role', ['owner', 'admin'])
      .eq('is_active', true)
    const to = (recipients ?? []).map((r: any) => r.email).filter(Boolean)
    if (!to.length) continue

    // What they have set up, so the mid-trial note is about them.
    let setup: { products: number; transactions: number; users: number } | undefined
    if (kind === 'day10') {
      const [{ count: products }, { count: transactions }, { count: users }] = await Promise.all([
        supabase.from('products').select('*', { count: 'exact', head: true }).eq('org_id', org.id).eq('is_active', true),
        supabase.from('inventory_transactions').select('*', { count: 'exact', head: true }).eq('org_id', org.id),
        supabase.from('user_profiles').select('*', { count: 'exact', head: true }).eq('org_id', org.id),
      ])
      setup = { products: products ?? 0, transactions: transactions ?? 0, users: users ?? 0 }
    }

    try {
      await sendTrialEmail({
        to,
        kind,
        businessName: org.name ?? 'your team',
        daysLeft: org.trial_ends_at ? daysBetween(today, org.trial_ends_at) : 0,
        // Quote the price this customer would actually pay.
        monthly: monthlyPrice('starter', org.pricing_region === 'asean' ? 'asean' : 'standard'),
        setup,
      })
      await supabase.from('organizations')
        .update({ lifecycle_emails: { ...(org.lifecycle_emails ?? {}), [kind]: new Date().toISOString() } })
        .eq('id', org.id)
      sent++
    } catch (e) {
      console.error('[trial-emails] send', org.id, (e as Error).message)
      failures.push(org.id)
    }
  }

  return NextResponse.json({
    dry_run: dryRun || undefined,
    trials_checked: orgs?.length ?? 0,
    due: planned,
    sent,
    failures: failures.length ? failures : undefined,
  })
}
