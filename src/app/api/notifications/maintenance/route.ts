import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAuth } from '@/lib/api-auth'
import { sendMaintenanceAlert, type MaintenanceAlert } from '@/lib/email'

/**
 * POST /api/notifications/maintenance
 * Sends maintenance alert emails — overdue schedules plus ones due within their
 * notify_days_before window.
 *
 * Two auth paths:
 *  1. CRON_SECRET header — scheduled run; processes EVERY org, each org's
 *     alerts going only to that org's own owners/admins.
 *  2. Session cookie — UI-triggered ("Send Now"); processes ONLY the caller's
 *     org.
 *
 * Multi-tenant: alerts are grouped by org_id and delivered per-org. Previously
 * this queried maintenance_schedules with no org filter and mailed everything to
 * a single global NOTIFICATION_EMAIL, which leaked other orgs' data.
 */
/** True when the request carries the cron secret (Vercel Cron or an external scheduler). */
function isCronRequest(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  // Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`; x-cron-secret
  // supports other schedulers and manual curl runs.
  return (
    req.headers.get('x-cron-secret') === secret ||
    req.headers.get('authorization') === `Bearer ${secret}`
  )
}

/** Vercel Cron invokes scheduled jobs with GET. */
export async function GET(req: NextRequest) {
  if (!isCronRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return run(null)
}

export async function POST(req: NextRequest) {
  // Cron runs across all orgs; a session run is scoped to the caller's org.
  let scopedOrgId: string | null = null
  if (!isCronRequest(req)) {
    const auth = await requireAuth()
    if (auth.error) return auth.error
    if (!auth.orgId) {
      return NextResponse.json({ error: 'No organization found for this account' }, { status: 404 })
    }
    scopedOrgId = auth.orgId
  }
  return run(scopedOrgId)
}

/** Build and send alerts. `scopedOrgId === null` processes every org. */
async function run(scopedOrgId: string | null) {
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: 'RESEND_API_KEY not configured' }, { status: 500 })
  }

  const supabase = createServiceClient()
  const today    = new Date()
  const daysLeft = (d: string) => Math.ceil((new Date(d).getTime() - today.getTime()) / 86400000)

  const select = 'id, org_id, title, scheduled_date, notify_days_before, cost, performed_by, asset:fixed_assets(asset_tag, name)'

  let overdueQ  = supabase.from('maintenance_schedules').select(select).eq('status', 'overdue')
  let upcomingQ = supabase.from('maintenance_schedules').select(select).eq('status', 'scheduled')
  if (scopedOrgId) {
    overdueQ  = overdueQ.eq('org_id', scopedOrgId)
    upcomingQ = upcomingQ.eq('org_id', scopedOrgId)
  }

  const [{ data: overdue }, { data: upcoming }] = await Promise.all([overdueQ, upcomingQ])

  const toAlert = (s: any, status: 'overdue' | 'scheduled'): MaintenanceAlert => ({
    asset_name:     s.asset?.name      ?? 'Unknown Asset',
    asset_tag:      s.asset?.asset_tag ?? '—',
    title:          s.title,
    scheduled_date: s.scheduled_date,
    days_left:      daysLeft(s.scheduled_date),
    performed_by:   s.performed_by,
    cost:           s.cost,
    status,
  })

  // Group alerts by org
  const byOrg = new Map<string, MaintenanceAlert[]>()
  const push  = (orgId: string, alert: MaintenanceAlert) => {
    if (!orgId) return
    const list = byOrg.get(orgId) ?? []
    list.push(alert)
    byOrg.set(orgId, list)
  }

  for (const s of (overdue ?? []) as any[]) push(s.org_id, toAlert(s, 'overdue'))
  for (const s of (upcoming ?? []) as any[]) {
    const left = daysLeft(s.scheduled_date)
    if (left >= 0 && left <= (s.notify_days_before ?? 7)) push(s.org_id, toAlert(s, 'scheduled'))
  }

  if (byOrg.size === 0) {
    return NextResponse.json({ sent: false, reason: 'No alerts to send', alerts: 0, orgs: 0 })
  }

  const orgIds = [...byOrg.keys()]

  // Recipients: each org's active owners/admins, plus that org's own name.
  const [{ data: orgs }, { data: recipients }] = await Promise.all([
    supabase.from('organizations').select('id, name').in('id', orgIds),
    supabase
      .from('user_profiles')
      .select('org_id, email, role, is_active')
      .in('org_id', orgIds)
      .in('role', ['owner', 'admin'])
      .eq('is_active', true),
  ])

  const orgName = new Map((orgs ?? []).map((o: any) => [o.id, o.name as string]))
  const mailTo  = new Map<string, string[]>()
  for (const r of (recipients ?? []) as any[]) {
    if (!r.email) continue
    mailTo.set(r.org_id, [...(mailTo.get(r.org_id) ?? []), r.email])
  }

  let sentCount = 0, alertCount = 0
  const skipped: string[] = []

  for (const [orgId, alerts] of byOrg) {
    const to = mailTo.get(orgId) ?? []
    if (to.length === 0) { skipped.push(orgId); continue }

    // One email per org, addressed to its owners/admins.
    const { error } = await sendMaintenanceAlert({
      to:           to.join(', '),
      businessName: orgName.get(orgId) ?? 'Your Business',
      alerts,
    })
    if (error) {
      console.error('[POST /api/notifications/maintenance] org', orgId, error)
      continue
    }
    sentCount  += 1
    alertCount += alerts.length
  }

  return NextResponse.json({
    sent:            sentCount > 0,
    orgs_notified:   sentCount,
    alerts:          alertCount,
    orgs_skipped:    skipped.length,   // no active owner/admin with an email
    scope:           scopedOrgId ? 'org' : 'all',
  })
}
