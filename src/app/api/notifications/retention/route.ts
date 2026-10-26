import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAnyRole } from '@/lib/api-auth'
import { sendRetentionWarning } from '@/lib/email'
import { retentionAction, daysUntilPurge, inactiveFrom, RETENTION, type RetentionOrg } from '@/lib/retention'

/**
 * Data retention — warn, warn again, then remove.
 *
 * GET with the cron secret runs daily across every organization.
 * POST as an owner is a dry run: it reports what would happen, and sends and
 * deletes nothing.
 *
 * Deleting a customer's account is the most destructive thing this codebase
 * does, so it is deliberately hard to do by accident:
 *   - paying accounts are excluded by the rules, not by a filter here;
 *   - nothing is purged unless both warnings were actually sent, and the final
 *     one had time to land;
 *   - the purge stays OFF until RETENTION_PURGE=on is set, so the job spends
 *     its first weeks only warning and reporting.
 */

function isCronRequest(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return (
    req.headers.get('x-cron-secret') === secret ||
    req.headers.get('authorization') === `Bearer ${secret}`
  )
}

const purgeEnabled = () => (process.env.RETENTION_PURGE ?? '').toLowerCase() === 'on'

export async function GET(req: NextRequest) {
  if (!isCronRequest(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return run(false)
}

export async function POST(req: NextRequest) {
  if (isCronRequest(req)) return run(false)
  const auth = await requireAnyRole('owner')
  if (auth.error) return auth.error
  return run(true)
}

async function run(dryRun: boolean) {
  const supabase = createServiceClient()
  const today = new Date()

  // Only accounts that are paused: a lapsed trial, or a cancelled subscription.
  const { data: orgs, error } = await supabase
    .from('organizations')
    .select('id, name, plan, plan_status, trial_ends_at, inactive_since, retention_emails')
    .or('plan.eq.trial,plan_status.eq.cancelled')

  if (error) {
    console.error('[retention] orgs', error)
    return NextResponse.json({ error: error.message ?? 'Failed to read organizations' }, { status: 500 })
  }

  const warned: { org: string; action: string; daysLeft: number }[] = []
  const purged: string[] = []
  const wouldPurge: string[] = []
  const failures: string[] = []

  for (const row of (orgs ?? []) as any[]) {
    const org = row as RetentionOrg & { name?: string }

    // Start the clock the first time we notice a cancelled account go quiet.
    if (org.plan_status === 'cancelled' && !org.inactive_since) {
      if (!dryRun) {
        await supabase.from('organizations')
          .update({ inactive_since: today.toISOString() }).eq('id', org.id)
      }
      continue
    }
    if (!inactiveFrom(org, today)) continue

    const action = retentionAction(org, today)
    if (!action) continue

    if (action === 'purge') {
      if (!purgeEnabled()) { wouldPurge.push(org.name ?? org.id); continue }
      if (dryRun) { wouldPurge.push(org.name ?? org.id); continue }

      // Same path as a customer deleting their own account: the organization
      // row cascades its data, then each member's login goes.
      const { data: members } = await supabase
        .from('user_profiles').select('id').eq('org_id', org.id)
      await supabase.from('organizations').delete().eq('id', org.id)
      for (const m of (members ?? []) as any[]) {
        await supabase.auth.admin.deleteUser(m.id).catch(() => {})
      }
      console.warn(`[retention] purged org ${org.id} (${org.name ?? 'unnamed'})`)
      purged.push(org.name ?? org.id)
      continue
    }

    const daysLeft = daysUntilPurge(org, today)
    warned.push({ org: org.name ?? org.id, action, daysLeft })
    if (dryRun) continue

    const { data: recipients } = await supabase
      .from('user_profiles').select('email')
      .eq('org_id', org.id).in('role', ['owner', 'admin']).eq('is_active', true)
    const to = (recipients ?? []).map((r: any) => r.email).filter(Boolean)
    if (!to.length) continue

    try {
      await sendRetentionWarning({ to, action, businessName: org.name ?? 'your team', daysLeft })
      await supabase.from('organizations')
        .update({ retention_emails: { ...(org.retention_emails ?? {}), [action]: today.toISOString() } })
        .eq('id', org.id)
    } catch (e) {
      console.error('[retention] send', org.id, (e as Error).message)
      failures.push(org.id)
    }
  }

  return NextResponse.json({
    dry_run: dryRun || undefined,
    purge_enabled: purgeEnabled(),
    policy: { ...RETENTION },
    checked: orgs?.length ?? 0,
    warned,
    purged,
    // Due for removal but held back — either the switch is off, or this is a dry run.
    would_purge: wouldPurge.length ? wouldPurge : undefined,
    failures: failures.length ? failures : undefined,
  })
}
