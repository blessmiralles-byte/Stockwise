import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

// ── Role → what the member can do on Stocked ──────────────────────────────────
export const ROLE_LABELS: Record<string, string> = {
  owner:       'Owner',
  procurement: 'Procurement',
  operations:  'Operations',
  receiver:    'Receiver',
  finance:     'Finance',
  viewer:      'Viewer',
}

export function roleCapabilities(role: string): string[] {
  switch (role) {
    case 'owner':
      return [
        'Full administrative access to the workspace',
        'Invite and manage team members and their roles',
        'Manage settings, locations, cost centers, and job codes',
        'Create and approve purchase orders, requisitions, and receipts',
        'Manage inventory, fixed assets, suppliers, and products',
        'View all finance reports — valuation, payables, and the journal',
      ]
    case 'procurement':
      return [
        'Create and manage purchase orders',
        'Manage suppliers and reorder suggestions',
        'Raise and track requisitions',
        'View inventory levels and reports',
      ]
    case 'operations':
      return [
        'Record inventory movements, transfers, and stock counts',
        'Raise and approve requisitions',
        'Manage locations and day-to-day stock',
        'View inventory and operational reports',
      ]
    case 'receiver':
      return [
        'Receive goods against purchase orders',
        'Record deliveries, batches, and item conditions',
        'View open purchase orders and inventory levels',
      ]
    case 'finance':
      return [
        'View inventory valuation and the accounting journal',
        'Review payables and three-way PO matching',
        'Export financial and expense reports (read-only)',
      ]
    default: // viewer
      return [
        'Read-only access to inventory and stock levels',
        'View reports and dashboards',
      ]
  }
}

export async function sendInviteEmail({
  to,
  inviterName,
  businessName,
  role,
  actionLink,
}: {
  to: string
  inviterName: string
  businessName: string
  role: string
  actionLink: string
}) {
  const roleLabel = ROLE_LABELS[role] ?? 'Team Member'
  const caps = roleCapabilities(role)

  const subject = `${inviterName} invited you to ${businessName} on Stocked`

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111; background: #f9fafb; margin: 0; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; border: 1px solid #e5e7eb; }
        .header { background: #4f46e5; color: white; padding: 24px 32px; }
        .header h1 { margin: 0; font-size: 20px; font-weight: 700; }
        .header p { margin: 4px 0 0; font-size: 14px; opacity: 0.85; }
        .body { padding: 24px 32px; }
        .lead { font-size: 15px; line-height: 1.55; color: #374151; margin: 0 0 16px; }
        .role-pill { display: inline-block; font-size: 13px; font-weight: 600; padding: 4px 12px; border-radius: 999px; background: #e0e7ff; color: #4338ca; }
        .section-title { font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; margin: 22px 0 10px; }
        ul.caps { margin: 0; padding-left: 0; list-style: none; }
        ul.caps li { font-size: 14px; color: #374151; padding: 7px 0 7px 26px; position: relative; border-bottom: 1px solid #f3f4f6; }
        ul.caps li:before { content: '✓'; position: absolute; left: 0; color: #4f46e5; font-weight: 700; }
        .btn { display: inline-block; background: #4f46e5; color: white; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 600; margin-top: 24px; }
        .footer { padding: 16px 32px; background: #f9fafb; border-top: 1px solid #e5e7eb; font-size: 12px; color: #9ca3af; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>You've been invited to Stocked</h1>
          <p>${businessName}</p>
        </div>
        <div class="body">
          <p class="lead">
            <strong>${inviterName}</strong>, the owner of <strong>${businessName}</strong>, has given you access to
            their Stocked workspace as a <span class="role-pill">${roleLabel}</span>.
          </p>
          <p class="section-title">What you can do</p>
          <ul class="caps">
            ${caps.map(c => `<li>${c}</li>`).join('')}
          </ul>
          <a href="${actionLink}" class="btn">Accept invitation &amp; set up your account →</a>
        </div>
        <div class="footer">
          Sent by ${inviterName} via Stocked · stocked.tech<br/>
          If you weren't expecting this invitation, you can safely ignore this email.
        </div>
      </div>
    </body>
    </html>
  `

  const { data, error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? 'Stocked <notifications@stocked.tech>',
    to,
    subject,
    html,
  })
  // The Resend SDK returns { error } instead of throwing — surface it so the
  // caller doesn't report a "sent" invite that Resend actually rejected
  // (e.g. an unverified sender domain).
  if (error) {
    throw new Error(error.message ?? 'Email provider rejected the message')
  }
  return data
}

export interface MaintenanceAlert {
  asset_name: string
  asset_tag: string
  title: string
  scheduled_date: string
  days_left: number
  performed_by?: string
  cost?: number
  status: 'scheduled' | 'overdue'
}

export async function sendMaintenanceAlert({
  to,
  businessName,
  alerts,
}: {
  to: string
  businessName: string
  alerts: MaintenanceAlert[]
}) {
  const overdueAlerts = alerts.filter(a => a.status === 'overdue')
  const upcomingAlerts = alerts.filter(a => a.status === 'scheduled')

  const subject = overdueAlerts.length > 0
    ? `⚠️ ${overdueAlerts.length} overdue maintenance item${overdueAlerts.length > 1 ? 's' : ''} — ${businessName}`
    : `🔧 ${upcomingAlerts.length} maintenance item${upcomingAlerts.length > 1 ? 's' : ''} due soon — ${businessName}`

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111; background: #f9fafb; margin: 0; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; border: 1px solid #e5e7eb; }
        .header { background: #4f46e5; color: white; padding: 24px 32px; }
        .header h1 { margin: 0; font-size: 20px; font-weight: 700; }
        .header p { margin: 4px 0 0; font-size: 14px; opacity: 0.85; }
        .body { padding: 24px 32px; }
        .section-title { font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; margin: 0 0 12px; }
        .card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px 16px; margin-bottom: 10px; }
        .card.overdue { border-color: #fca5a5; background: #fff7f7; }
        .card.upcoming { border-color: #c7d2fe; background: #f5f7ff; }
        .card-title { font-size: 15px; font-weight: 600; margin: 0 0 4px; }
        .card-sub { font-size: 13px; color: #6b7280; margin: 0 0 8px; }
        .tag { display: inline-block; font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 999px; }
        .tag.overdue { background: #fee2e2; color: #b91c1c; }
        .tag.upcoming { background: #e0e7ff; color: #4338ca; }
        .meta { font-size: 12px; color: #9ca3af; margin-top: 6px; }
        .footer { padding: 16px 32px; background: #f9fafb; border-top: 1px solid #e5e7eb; font-size: 12px; color: #9ca3af; }
        .btn { display: inline-block; background: #4f46e5; color: white; text-decoration: none; padding: 10px 20px; border-radius: 8px; font-size: 14px; font-weight: 600; margin-top: 20px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Stocked Maintenance Alert</h1>
          <p>${businessName} · ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>
        <div class="body">
          ${overdueAlerts.length > 0 ? `
            <p class="section-title">⚠️ Overdue (${overdueAlerts.length})</p>
            ${overdueAlerts.map(a => `
              <div class="card overdue">
                <p class="card-title">${a.asset_name} <span style="font-weight:400;color:#6b7280;font-size:13px">(${a.asset_tag})</span></p>
                <p class="card-sub">${a.title}</p>
                <span class="tag overdue">Overdue by ${Math.abs(a.days_left)} day${Math.abs(a.days_left) !== 1 ? 's' : ''}</span>
                <p class="meta">
                  Scheduled: ${new Date(a.scheduled_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  ${a.performed_by ? ` · ${a.performed_by}` : ''}
                  ${a.cost ? ` · Est. cost: $${a.cost.toLocaleString()}` : ''}
                </p>
              </div>
            `).join('')}
          ` : ''}

          ${upcomingAlerts.length > 0 ? `
            <p class="section-title" style="margin-top:${overdueAlerts.length > 0 ? '20px' : '0'}">🔧 Due Soon (${upcomingAlerts.length})</p>
            ${upcomingAlerts.map(a => `
              <div class="card upcoming">
                <p class="card-title">${a.asset_name} <span style="font-weight:400;color:#6b7280;font-size:13px">(${a.asset_tag})</span></p>
                <p class="card-sub">${a.title}</p>
                <span class="tag upcoming">Due in ${a.days_left} day${a.days_left !== 1 ? 's' : ''}</span>
                <p class="meta">
                  Scheduled: ${new Date(a.scheduled_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  ${a.performed_by ? ` · ${a.performed_by}` : ''}
                  ${a.cost ? ` · Est. cost: $${a.cost.toLocaleString()}` : ''}
                </p>
              </div>
            `).join('')}
          ` : ''}

          <a href="${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/maintenance" class="btn">
            View Maintenance Schedule →
          </a>
        </div>
        <div class="footer">
          Sent by Stocked · You're receiving this because you're the account admin.
        </div>
      </div>
    </body>
    </html>
  `

  return resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? 'Stocked <notifications@stocked.tech>',
    to,
    subject,
    html,
  })
}
