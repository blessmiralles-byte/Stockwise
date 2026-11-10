import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAuth } from '@/lib/api-auth'
import { createNotification } from '@/lib/notify'
import { sendToolsOverdue } from '@/lib/email'
import { overdueToRemind, overdueSummary } from '@/lib/tool-returns'
import { planHasFeature } from '@/lib/entitlements'

/**
 * Overdue tools — chase what was due back and isn't.
 *
 * GET  with the cron secret: every organization (Vercel Cron runs this daily).
 * POST with a session:       just the caller's organization.
 *
 * A tool is flagged the day it goes overdue and then weekly while it stays
 * out (overdue_notified_at), so this never becomes a daily nag. Supervisors
 * get one email listing everything newly flagged; whoever signed each tool
 * out gets an in-app nudge.
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
  return run(null)
}

export async function POST(req: NextRequest) {
  let scopedOrgId: string | null = null
  if (!isCronRequest(req)) {
    const auth = await requireAuth()
    if (auth.error) return auth.error
    if (!auth.orgId) return NextResponse.json({ error: 'No organization found for this account' }, { status: 404 })
    scopedOrgId = auth.orgId
  }
  return run(scopedOrgId)
}

async function run(scopedOrgId: string | null) {
  const supabase = createServiceClient()
  const now = new Date()

  let q = supabase
    .from('asset_checkouts')
    .select(`
      id, org_id, status, holder_name, job_code, job_reference, due_at,
      overdue_notified_at, checked_out_by,
      asset:fixed_assets(id, name, asset_tag)
    `)
    .eq('status', 'out')
    .not('due_at', 'is', null)
    .lt('due_at', now.toISOString())
    .limit(2000)
  if (scopedOrgId) q = q.eq('org_id', scopedOrgId)

  const { data: out, error } = await q
  if (error) {
    console.error('[tools-overdue]', error)
    return NextResponse.json({ error: error.message ?? 'Failed to read checkouts' }, { status: 500 })
  }

  // One tenant's tools never inform another's: group before deciding anything.
  const byOrg = new Map<string, any[]>()
  for (const c of overdueToRemind((out ?? []) as any[], now)) {
    if (!c.org_id) continue
    byOrg.set(c.org_id, [...(byOrg.get(c.org_id) ?? []), c])
  }
  const orgIds = [...byOrg.keys()]
  if (orgIds.length === 0) {
    return NextResponse.json({ sent: false, reason: 'Nothing newly overdue', orgs_notified: 0 })
  }

  const [{ data: orgs }, { data: people }] = await Promise.all([
    supabase.from('organizations').select('id, name, plan').in('id', orgIds),
    supabase.from('user_profiles').select('id, org_id, email, role, is_active')
      .in('org_id', orgIds).in('role', ['owner', 'admin', 'operations', 'manager']).eq('is_active', true),
  ])
  const orgName = new Map((orgs ?? []).map((o: any) => [o.id, o.name as string]))
  // The email is part of paid plans; the in-app notice goes to everyone.
  const emailsOn = new Set((orgs ?? []).filter((o: any) => planHasFeature(o.plan, 'tool_reminders')).map((o: any) => o.id))
  const staffByOrg = new Map<string, any[]>()
  for (const p of (people ?? []) as any[]) {
    staffByOrg.set(p.org_id, [...(staffByOrg.get(p.org_id) ?? []), p])
  }

  let orgsNotified = 0, flagged = 0
  const mailFailures: string[] = []

  for (const [orgId, list] of byOrg) {
    const staff = staffByOrg.get(orgId) ?? []
    const staffIds = new Set(staff.map(s => s.id))

    if (staff.length) {
      await createNotification({
        userId: staff.map(s => s.id),
        orgId,
        type: 'asset.overdue',
        title: overdueSummary(list.length),
        body: list.slice(0, 3).map(c => `${c.asset?.name ?? 'Tool'} — ${c.holder_name}`).join(', ')
          + (list.length > 3 ? ` and ${list.length - 3} more` : ''),
        data: { count: list.length },
        actionUrl: '/reports/tools-out',
      })
    }

    // Whoever signed it out hears about their own tools (supervisors already did).
    const byRequester = new Map<string, any[]>()
    for (const c of list) {
      if (!c.checked_out_by || staffIds.has(c.checked_out_by)) continue
      byRequester.set(c.checked_out_by, [...(byRequester.get(c.checked_out_by) ?? []), c])
    }
    for (const [userId, mine] of byRequester) {
      await createNotification({
        userId: [userId],
        orgId,
        type: 'asset.overdue',
        title: mine.length === 1
          ? `${mine[0].asset?.name ?? 'A tool'} is due back`
          : `${mine.length} tools you signed out are due back`,
        body: mine.slice(0, 3).map(c => `${c.asset?.name ?? 'Tool'} — ${c.days_overdue} day${c.days_overdue > 1 ? 's' : ''} overdue`).join(', '),
        data: { count: mine.length },
        actionUrl: '/assets',
      })
    }

    const to = staff.map(s => s.email).filter(Boolean)
    if (to.length && emailsOn.has(orgId) && process.env.RESEND_API_KEY) {
      try {
        await sendToolsOverdue({
          to,
          businessName: orgName.get(orgId) ?? 'your team',
          tools: list.map(c => ({
            name: c.asset?.name ?? 'Tool',
            asset_tag: c.asset?.asset_tag ?? null,
            holder: c.holder_name ?? null,
            job: c.job_code || c.job_reference || null,
            due_at: c.due_at,
            days_overdue: c.days_overdue,
          })),
        })
      } catch (e) {
        console.error('[tools-overdue] email', orgId, (e as Error).message)
        mailFailures.push(orgId)
      }
    }

    await supabase.from('asset_checkouts')
      .update({ overdue_notified_at: now.toISOString() })
      .eq('org_id', orgId)
      .in('id', list.map(c => c.id))

    flagged += list.length
    orgsNotified++
  }

  return NextResponse.json({
    sent: orgsNotified > 0,
    orgs_notified: orgsNotified,
    tools_flagged: flagged,
    mail_failures: mailFailures.length ? mailFailures : undefined,
    scope: scopedOrgId ? 'org' : 'all',
  })
}
