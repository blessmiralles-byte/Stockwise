'use client'

import Link from 'next/link'
import { useApi } from '@/lib/use-api'
import { formatDate } from '@/lib/utils'
import {
  ScanBarcode, Cpu, Wrench, AlertCircle,
  ArrowLeftRight, CheckCircle2, Clock, ChevronRight,
  Package,
} from 'lucide-react'

const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner', procurement: 'Procurement Manager', operations: 'Operations Manager',
  receiver: 'Receiver / Field Officer', finance: 'Finance / AP', viewer: 'Viewer',
  admin: 'Owner', manager: 'Operations Manager',
}

// ── Quick action tiles ────────────────────────────────────────────────────────
const actions = [
  {
    href: '/field/log',
    icon: ScanBarcode,
    label: 'Log Movement',
    description: 'Scan or search — issue, receive, or transfer',
    color: 'bg-indigo-50 text-indigo-600 border-indigo-100',
    iconBg: 'bg-indigo-600',
  },
  {
    href: '/field/equipment',
    icon: Cpu,
    label: 'Equipment',
    description: 'Status, report issues, mark fixed',
    color: 'bg-purple-50 text-purple-600 border-purple-100',
    iconBg: 'bg-purple-600',
  },
  {
    href: '/field/maintenance',
    icon: Wrench,
    label: 'My Tasks',
    description: 'Maintenance due today and overdue',
    color: 'bg-amber-50 text-amber-600 border-amber-100',
    iconBg: 'bg-amber-500',
  },
]

const txTypeLabel: Record<string, string> = {
  purchase: 'Received', consumption: 'Issued', sale: 'Sold',
  transfer: 'Transferred', adjustment: 'Adjusted',
}
const txTypeColor: Record<string, string> = {
  purchase: 'text-green-600', consumption: 'text-indigo-600',
  sale: 'text-purple-600', transfer: 'text-gray-600', adjustment: 'text-amber-600',
}

export default function FieldHubPage() {
  const { data: profileData }   = useApi<any>('/api/user/profile')
  const { data: maintData }     = useApi<{ data: any[] }>('/api/maintenance')
  const { data: txData }        = useApi<{ data: any[] }>('/api/transactions?limit=6')

  const profile = profileData
  const schedules = maintData?.data ?? []
  const transactions = txData?.data ?? []

  const overdue   = schedules.filter((s: any) => s.status === 'overdue')
  const dueToday  = schedules.filter((s: any) => {
    if (s.status !== 'scheduled') return false
    const d = new Date(s.scheduled_date)
    const t = new Date()
    return d.toDateString() === t.toDateString()
  })
  const urgentCount = overdue.length + dueToday.length

  const name = profile?.full_name?.split(' ')[0] || 'there'
  const roleLabel = ROLE_LABELS[profile?.role ?? 'viewer'] ?? 'Field Worker'

  return (
    <div className="flex flex-col min-h-full">
      {/* Header */}
      <div className="bg-indigo-600 px-5 pt-10 pb-6 text-white">
        <p className="text-indigo-200 text-sm mb-1">{roleLabel}</p>
        <h1 className="text-2xl font-bold">Hi, {name} 👷</h1>
        <p className="text-indigo-200 text-sm mt-1">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
      </div>

      <div className="px-4 py-5 space-y-5 -mt-3">

        {/* Urgent alert banner */}
        {urgentCount > 0 && (
          <Link href="/field/maintenance">
            <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3.5 flex items-center gap-3 active:bg-red-100 transition-colors">
              <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <AlertCircle className="w-5 h-5 text-red-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-red-800 text-sm">
                  {urgentCount} maintenance task{urgentCount !== 1 ? 's' : ''} need attention
                </p>
                <p className="text-xs text-red-600">
                  {overdue.length > 0 && `${overdue.length} overdue`}
                  {overdue.length > 0 && dueToday.length > 0 && ' · '}
                  {dueToday.length > 0 && `${dueToday.length} due today`}
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-red-400 flex-shrink-0" />
            </div>
          </Link>
        )}

        {/* Quick actions */}
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Quick Actions</p>
          <div className="grid grid-cols-1 gap-3">
            {actions.map(a => (
              <Link key={a.href} href={a.href}>
                <div className={`flex items-center gap-4 p-4 rounded-2xl border bg-white active:scale-[0.98] transition-transform shadow-sm`}>
                  <div className={`w-12 h-12 rounded-xl ${a.iconBg} flex items-center justify-center flex-shrink-0`}>
                    <a.icon className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900">{a.label}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{a.description}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Today's maintenance tasks */}
        {(overdue.length > 0 || dueToday.length > 0) && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Urgent Tasks</p>
              <Link href="/field/maintenance" className="text-xs text-indigo-600 font-medium">See all</Link>
            </div>
            <div className="space-y-2">
              {[...overdue, ...dueToday].slice(0, 3).map((s: any) => (
                <Link key={s.id} href="/field/maintenance">
                  <div className={`flex items-center gap-3 p-3.5 rounded-xl border bg-white shadow-sm ${s.status === 'overdue' ? 'border-red-100' : 'border-amber-100'}`}>
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${s.status === 'overdue' ? 'bg-red-500' : 'bg-amber-400'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{s.title}</p>
                      <p className="text-xs text-gray-400 truncate">{s.asset?.name} · {s.asset?.asset_tag}</p>
                    </div>
                    <span className={`text-xs font-medium flex-shrink-0 ${s.status === 'overdue' ? 'text-red-600' : 'text-amber-600'}`}>
                      {s.status === 'overdue' ? 'OVERDUE' : 'TODAY'}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Recent activity */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Recent Activity</p>
            <Link href="/transactions" className="text-xs text-indigo-600 font-medium">Full log</Link>
          </div>
          {transactions.length === 0 ? (
            <div className="text-center py-8 text-gray-300">
              <ArrowLeftRight className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No recent transactions</p>
            </div>
          ) : (
            <div className="space-y-2">
              {transactions.slice(0, 5).map((tx: any) => (
                <div key={tx.id} className="flex items-center gap-3 p-3.5 rounded-xl bg-white border border-gray-100 shadow-sm">
                  <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center flex-shrink-0">
                    <Package className="w-4 h-4 text-gray-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {tx.product?.name ?? 'Unknown item'}
                    </p>
                    <p className="text-xs text-gray-400 truncate">
                      {tx.quantity} {tx.product?.unit_of_measure}
                      {tx.job_order_id && <span className="text-indigo-500 ml-1">→ {tx.job_order_id}</span>}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`text-xs font-semibold ${txTypeColor[tx.transaction_type] ?? 'text-gray-500'}`}>
                      {txTypeLabel[tx.transaction_type] ?? tx.transaction_type}
                    </p>
                    <p className="text-xs text-gray-300">{formatDate(tx.created_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Desktop back-link */}
        <div className="text-center pb-2">
          <Link href="/dashboard" className="text-xs text-gray-400 hover:text-indigo-600 transition-colors">
            ← Back to full dashboard
          </Link>
        </div>

      </div>
    </div>
  )
}
