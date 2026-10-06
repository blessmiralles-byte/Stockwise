import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAuth } from '@/lib/api-auth'
import { createNotification } from '@/lib/notify'
import { sendReorderAlert } from '@/lib/email'
import { belowReorderPoint, planReorderAlerts, summarise, type StockLine } from '@/lib/reorder'

/**
 * Reorder digest — the trigger that starts procurement.
 *
 * GET  with the cron secret: every organization (Vercel Cron runs this daily).
 * POST with a session:       just the caller's organization ("check now").
 *
 * Opens an alert for each product that has newly crossed its reorder point,
 * closes alerts for anything that recovered, then emails procurement (and the
 * owner) a single digest of what is new. Items already alerted are not
 * re-sent — that is what stops a daily nag.
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

const BALANCE_SELECT = `
  org_id, product_id, quantity,
  product:products(
    id, name, sku, unit_of_measure, reorder_point, supplier_id, lead_time_days,
    supplier:suppliers(id, name, lead_time_days)
  )
`

async function run(scopedOrgId: string | null) {
  const supabase = createServiceClient()
  const now = new Date().toISOString()

  let balanceQ = supabase.from('inventory_balances').select(BALANCE_SELECT)
  if (scopedOrgId) balanceQ = balanceQ.eq('org_id', scopedOrgId)
  const { data: balances, error } = await balanceQ
  if (error) {
    console.error('[reorder] balances', error)
    return NextResponse.json({ error: error.message ?? 'Failed to read stock' }, { status: 500 })
  }

  // Group the stock lines per organization — one tenant's stock never informs another's.
  const byOrg = new Map<string, StockLine[]>()
  for (const b of (balances ?? []) as any[]) {
    if (!b.org_id) continue
    byOrg.set(b.org_id, [...(byOrg.get(b.org_id) ?? []), b as StockLine])
  }

  const orgIds = [...byOrg.keys()]
  if (orgIds.length === 0) {
    return NextResponse.json({ sent: false, reason: 'No stock to check', orgs_notified: 0 })
  }

  const [{ data: orgs }, { data: alerts }, { data: people }] = await Promise.all([
    supabase.from('organizations').select('id, name').in('id', orgIds),
    supabase.from('reorder_alerts').select('org_id, product_id, status').in('org_id', orgIds)
      .in('status', ['open', 'ordered']),
    supabase.from('user_profiles').select('id, org_id, email, role, is_active')
      .in('org_id', orgIds).in('role', ['owner', 'admin', 'procurement']).eq('is_active', true),
  ])

  const orgName = new Map((orgs ?? []).map((o: any) => [o.id, o.name as string]))
  const alertsByOrg = new Map<string, any[]>()
  for (const a of (alerts ?? []) as any[]) {
    alertsByOrg.set(a.org_id, [...(alertsByOrg.get(a.org_id) ?? []), a])
  }
  const staffByOrg = new Map<string, any[]>()
  for (const p of (people ?? []) as any[]) {
    staffByOrg.set(p.org_id, [...(staffByOrg.get(p.org_id) ?? []), p])
  }

  let orgsNotified = 0, opened = 0, resolved = 0
  const mailFailures: string[] = []

  for (const [orgId, lines] of byOrg) {
    const candidates = belowReorderPoint(lines)
    const plan = planReorderAlerts(candidates, alertsByOrg.get(orgId) ?? [])

    // Stock recovered — close those alerts so the item can alert again later.
    if (plan.toResolve.length) {
      await supabase.from('reorder_alerts')
        .update({ status: 'resolved', resolved_at: now })
        .eq('org_id', orgId)
        .in('product_id', plan.toResolve)
        .in('status', ['open', 'ordered'])
      resolved += plan.toResolve.length
    }

    if (plan.toOpen.length === 0) continue

    await supabase.from('reorder_alerts').insert(plan.toOpen.map(c => ({
      org_id: orgId,
      product_id: c.product_id,
      status: 'open',
      quantity_at_trigger: c.quantity,
      reorder_point: c.reorder_point,
      suggested_qty: c.suggested_qty,
      triggered_at: now,
      notified_at: now,
    })))
    opened += plan.toOpen.length

    const staff = staffByOrg.get(orgId) ?? []
    const summary = summarise(plan.toOpen)

    if (staff.length) {
      await createNotification({
        userId: staff.map(s => s.id),
        orgId,
        type: 'reorder.low_stock',
        title: `Time to reorder — ${summary}`,
        body: plan.toOpen.slice(0, 3).map(c => `${c.name} (${c.quantity} left)`).join(', ')
          + (plan.toOpen.length > 3 ? ` and ${plan.toOpen.length - 3} more` : ''),
        data: { count: plan.toOpen.length },
        actionUrl: '/reorder',
      })
    }

    const to = staff.map(s => s.email).filter(Boolean)
    if (to.length && process.env.RESEND_API_KEY) {
      try {
        await sendReorderAlert({
          to,
          businessName: orgName.get(orgId) ?? 'your team',
          items: plan.toOpen.map(c => ({
            name: c.name, sku: c.sku, quantity: c.quantity, reorder_point: c.reorder_point,
            suggested_qty: c.suggested_qty, unit: c.unit, vendor_name: c.vendor_name,
          })),
        })
      } catch (e) {
        console.error('[reorder] email', orgId, (e as Error).message)
        mailFailures.push(orgId)
      }
    }
    orgsNotified++
  }

  return NextResponse.json({
    sent: orgsNotified > 0,
    orgs_checked: orgIds.length,
    orgs_notified: orgsNotified,
    alerts_opened: opened,
    alerts_resolved: resolved,
    mail_failures: mailFailures.length ? mailFailures : undefined,
    scope: scopedOrgId ? 'org' : 'all',
  })
}
