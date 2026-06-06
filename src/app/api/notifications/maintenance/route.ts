import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAuth } from '@/lib/api-auth'
import { sendMaintenanceAlert, type MaintenanceAlert } from '@/lib/email'

/**
 * POST /api/notifications/maintenance
 * Sends maintenance alert emails.
 *
 * Accepts two auth methods:
 *  1. Session cookie — any authenticated user (e.g. "Send Now" button in Settings)
 *  2. CRON_SECRET header — for scheduled cron jobs (separate from POS key, M-3)
 *
 * Removed: Referer-based auth (was spoofable, H-4)
 */
export async function POST(req: NextRequest) {
  const cronSecret = req.headers.get('x-cron-secret')
  const isValidCron = !!process.env.CRON_SECRET && cronSecret === process.env.CRON_SECRET

  if (!isValidCron) {
    // Fall back to session auth for UI-triggered calls
    const auth = await requireAuth()
    if (auth.error) return auth.error
  }

  const notificationEmail = process.env.NOTIFICATION_EMAIL
  if (!notificationEmail) {
    return NextResponse.json({ error: 'NOTIFICATION_EMAIL not configured' }, { status: 500 })
  }
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: 'RESEND_API_KEY not configured' }, { status: 500 })
  }

  const supabase = createServiceClient()
  const today = new Date()

  const { data: overdue } = await supabase
    .from('maintenance_schedules')
    .select('id, title, scheduled_date, cost, performed_by, asset:fixed_assets(asset_tag, name)')
    .eq('status', 'overdue')

  const { data: upcoming } = await supabase
    .from('maintenance_schedules')
    .select('id, title, scheduled_date, notify_days_before, cost, performed_by, asset:fixed_assets(asset_tag, name)')
    .eq('status', 'scheduled')

  const upcomingDueSoon = (upcoming ?? []).filter((s: any) => {
    const daysLeft = Math.ceil(
      (new Date(s.scheduled_date).getTime() - today.getTime()) / 86400000
    )
    return daysLeft >= 0 && daysLeft <= (s.notify_days_before ?? 7)
  })

  const alerts: MaintenanceAlert[] = [
    ...(overdue ?? []).map((s: any) => ({
      asset_name:     s.asset?.name        ?? 'Unknown Asset',
      asset_tag:      s.asset?.asset_tag   ?? '—',
      title:          s.title,
      scheduled_date: s.scheduled_date,
      days_left:      Math.ceil((new Date(s.scheduled_date).getTime() - today.getTime()) / 86400000),
      performed_by:   s.performed_by,
      cost:           s.cost,
      status:         'overdue' as const,
    })),
    ...upcomingDueSoon.map((s: any) => ({
      asset_name:     s.asset?.name        ?? 'Unknown Asset',
      asset_tag:      s.asset?.asset_tag   ?? '—',
      title:          s.title,
      scheduled_date: s.scheduled_date,
      days_left:      Math.ceil((new Date(s.scheduled_date).getTime() - today.getTime()) / 86400000),
      performed_by:   s.performed_by,
      cost:           s.cost,
      status:         'scheduled' as const,
    })),
  ]

  if (alerts.length === 0) {
    return NextResponse.json({ sent: false, reason: 'No alerts to send', alerts: 0 })
  }

  const { data, error } = await sendMaintenanceAlert({
    to:           notificationEmail,
    businessName: process.env.BUSINESS_NAME ?? 'Your Business',
    alerts,
  })

  if (error) {
    console.error('[POST /api/notifications/maintenance]', error)
    return NextResponse.json({ error: 'Failed to send notification' }, { status: 500 })
  }

  return NextResponse.json({
    sent:               true,
    email_id:           (data as any)?.id,
    to:                 notificationEmail,
    alerts:             alerts.length,
    overdue:            overdue?.length ?? 0,
    upcoming_due_soon:  upcomingDueSoon.length,
  })
}
