'use client'

import { Topbar } from '@/components/layout/topbar'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CardSkeleton, Skeleton } from '@/components/ui/skeleton'
import { useApi } from '@/lib/use-api'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  Package, AlertTriangle, TrendingUp, Building2,
  Wrench, ArrowUpRight, ScanBarcode, ArrowLeftRight,
  ClipboardList, ShoppingCart, ShieldAlert, CheckCircle2, Circle, X,
} from 'lucide-react'
import Link from 'next/link'

const typeColors: Record<string, string> = {
  purchase:    'success',
  transfer:    'default',
  sale:        'warning',
  consumption: 'secondary',
  adjustment:  'outline',
}

export default function DashboardPage() {
  const { data, loading }                        = useApi<any>('/api/dashboard')
  const { data: onboarding, refetch: refetchOB } = useApi<any>('/api/onboarding/status')

  const stats = data ? [
    {
      label: 'Total Items', value: data.total_products,
      icon: Package, color: 'bg-indigo-50 text-indigo-600',
      change: `${data.low_stock_count} low stock`,
    },
    {
      label: 'Inventory Value', value: formatCurrency(data.total_inventory_value),
      icon: TrendingUp, color: 'bg-green-50 text-green-600',
      change: `${data.out_of_stock_count} out of stock`,
    },
    {
      label: 'Fixed Assets', value: data.total_assets,
      icon: Building2, color: 'bg-purple-50 text-purple-600',
      change: `${data.assets_in_maintenance} in maintenance`,
    },
    {
      label: 'Low Stock', value: data.low_stock_count,
      icon: AlertTriangle, color: 'bg-yellow-50 text-yellow-600',
      change: 'Below reorder point',
    },
  ] : []

  // Action items that need attention
  const alerts = data ? [
    data.pending_req_count     > 0 && { icon: ClipboardList, color: 'text-indigo-600 bg-indigo-50', label: `${data.pending_req_count} requisition${data.pending_req_count !== 1 ? 's' : ''} pending approval`, href: '/requisitions?status=pending' },
    data.overdue_maint_count   > 0 && { icon: Wrench,        color: 'text-red-600 bg-red-50',     label: `${data.overdue_maint_count} maintenance task${data.overdue_maint_count !== 1 ? 's' : ''} overdue`,         href: '/maintenance' },
    data.expiring_warranty_count > 0 && { icon: ShieldAlert, color: 'text-amber-600 bg-amber-50', label: `${data.expiring_warranty_count} warranty${data.expiring_warranty_count !== 1 ? 'ies' : ''} expiring in 60 days`, href: '/assets' },
    data.open_po_count         > 0 && { icon: ShoppingCart,  color: 'text-slate-600 bg-slate-100',label: `${data.open_po_count} purchase order${data.open_po_count !== 1 ? 's' : ''} open`,               href: '/purchase-orders' },
  ].filter(Boolean) as { icon: any; color: string; label: string; href: string }[] : []

  return (
    <div>
      <Topbar title="Dashboard" />
      <div className="p-6 space-y-6">

        {/* Quick Actions */}
        <div className="flex flex-wrap gap-3">
          <Link href="/transactions/new">
            <Button className="gap-2"><ScanBarcode className="w-4 h-4" />Scan / New Transaction</Button>
          </Link>
          <Link href="/transactions/new">
            <Button variant="outline" className="gap-2"><ArrowLeftRight className="w-4 h-4" />New Transaction</Button>
          </Link>
          <Link href="/inventory/new">
            <Button variant="outline" className="gap-2"><Package className="w-4 h-4" />Add Item</Button>
          </Link>
        </div>

        {/* Action Alerts strip */}
        {!loading && alerts.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            {alerts.map((a, i) => (
              <Link key={i} href={a.href}>
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-slate-200 bg-white hover:shadow-sm transition-shadow cursor-pointer group">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${a.color}`}>
                    <a.icon className="w-4 h-4" />
                  </div>
                  <p className="text-xs font-medium text-slate-700 leading-snug group-hover:text-indigo-700 transition-colors">{a.label}</p>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Getting Started checklist — shown until all steps are done */}
        {onboarding && !onboarding.allDone && (
          <div className="bg-white rounded-2xl border border-indigo-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 bg-indigo-50/70 border-b border-indigo-100">
              <div>
                <p className="text-sm font-semibold text-indigo-900">Getting Started</p>
                <p className="text-xs text-indigo-600 mt-0.5">
                  {onboarding.completedCount} of {onboarding.totalSteps} steps complete
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-28 bg-indigo-100 rounded-full h-1.5">
                  <div
                    className="bg-indigo-500 h-1.5 rounded-full transition-all"
                    style={{ width: `${(onboarding.completedCount / onboarding.totalSteps) * 100}%` }}
                  />
                </div>
              </div>
            </div>
            <div className="px-5 py-3 grid sm:grid-cols-2 xl:grid-cols-3 gap-2">
              {onboarding.steps.map((step: any) => (
                <Link key={step.id} href={step.href}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors group ${
                    step.done ? 'bg-green-50/60 cursor-default pointer-events-none' : 'hover:bg-slate-50'
                  }`}>
                  {step.done
                    ? <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                    : <Circle className="w-4 h-4 text-slate-300 flex-shrink-0" />}
                  <span className={`text-xs font-medium ${step.done ? 'text-green-700 line-through' : 'text-slate-700 group-hover:text-indigo-700'}`}>
                    {step.label}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {loading
            ? Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)
            : stats.map((stat) => (
              <Card key={stat.label}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm text-slate-500 mb-1">{stat.label}</p>
                      <p className="text-2xl font-bold text-slate-900">{stat.value}</p>
                      <p className="text-xs text-slate-400 mt-1">{stat.change}</p>
                    </div>
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${stat.color}`}>
                      <stat.icon className="w-5 h-5" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Recent Transactions */}
          <Card className="xl:col-span-2">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle>Recent Transactions</CardTitle>
                <Link href="/transactions">
                  <Button variant="ghost" size="sm" className="gap-1 text-indigo-600">
                    View all <ArrowUpRight className="w-3 h-3" />
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
              ) : (
                <div className="space-y-1">
                  {(data?.recent_transactions ?? []).map((tx: any) => (
                    <div key={tx.id} className="flex items-center justify-between py-2.5 border-b border-slate-50 last:border-0">
                      <div className="flex items-center gap-3">
                        <Badge variant={typeColors[tx.transaction_type] as any}>{tx.transaction_type}</Badge>
                        <div>
                          <p className="text-sm font-medium text-slate-900">{tx.product?.name}</p>
                          <p className="text-xs text-slate-400">
                            {tx.to_location?.name ?? tx.from_location?.name ?? '—'} · {formatDate(tx.created_at)}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-slate-900">{formatCurrency(tx.quantity * tx.unit_cost)}</p>
                        <p className="text-xs text-slate-400">qty: {tx.quantity}</p>
                      </div>
                    </div>
                  ))}
                  {data?.recent_transactions?.length === 0 && (
                    <p className="text-center text-sm text-slate-400 py-6">No transactions yet</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Right column — maintenance + pending reqs */}
          <div className="space-y-4">
            {/* Pending Requisitions */}
            {(loading || (data?.pending_req_count ?? 0) > 0) && (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">Pending Approvals</CardTitle>
                    <Link href="/requisitions?status=pending">
                      <Button variant="ghost" size="sm" className="gap-1 text-indigo-600 text-xs">
                        View all <ArrowUpRight className="w-3 h-3" />
                      </Button>
                    </Link>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  {loading ? (
                    <div className="space-y-2">{[1,2].map(i => <Skeleton key={i} className="h-12 rounded-lg" />)}</div>
                  ) : (
                    <div className="space-y-2">
                      {(data?.pending_requisitions ?? []).slice(0, 3).map((r: any) => (
                        <Link key={r.id} href="/requisitions?status=pending">
                          <div className="flex items-center gap-2.5 p-2.5 bg-indigo-50/60 rounded-lg hover:bg-indigo-50 transition-colors">
                            <ClipboardList className="w-3.5 h-3.5 text-indigo-600 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-slate-800 truncate">{r.req_number}</p>
                              <p className="text-[11px] text-slate-500 truncate">{r.requested_by?.full_name}</p>
                            </div>
                            <Badge variant="outline" className="text-[10px] capitalize flex-shrink-0">{r.type}</Badge>
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Upcoming Maintenance */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">Upcoming Maintenance</CardTitle>
                  <Link href="/maintenance">
                    <Button variant="ghost" size="sm" className="gap-1 text-indigo-600 text-xs">
                      View all <ArrowUpRight className="w-3 h-3" />
                    </Button>
                  </Link>
                </div>
                <CardDescription>Next 30 days</CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                {loading ? (
                  <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-16 rounded-lg" />)}</div>
                ) : (
                  <div className="space-y-2">
                    {/* Overdue first */}
                    {(data?.overdue_maintenance ?? []).slice(0, 2).map((m: any) => (
                      <div key={m.id} className="flex items-start gap-2.5 p-2.5 bg-red-50 rounded-lg">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 bg-red-100">
                          <Wrench className="w-3.5 h-3.5 text-red-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-slate-900 truncate">{m.asset?.name}</p>
                          <p className="text-[11px] text-slate-500">{m.title}</p>
                        </div>
                        <Badge variant="destructive" className="text-[10px] flex-shrink-0">{m.daysOverdue}d overdue</Badge>
                      </div>
                    ))}
                    {/* Upcoming */}
                    {(data?.upcoming_maintenance ?? []).slice(0, 3).map((m: any) => (
                      <div key={m.id} className="flex items-start gap-2.5 p-2.5 bg-slate-50 rounded-lg">
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${m.daysLeft <= 5 ? 'bg-red-100' : m.daysLeft <= 10 ? 'bg-yellow-100' : 'bg-blue-100'}`}>
                          <Wrench className={`w-3.5 h-3.5 ${m.daysLeft <= 5 ? 'text-red-600' : m.daysLeft <= 10 ? 'text-yellow-600' : 'text-blue-600'}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-slate-900 truncate">{m.asset?.name}</p>
                          <p className="text-[11px] text-slate-500">{m.title}</p>
                          <p className="text-[11px] text-slate-400 mt-0.5">{formatDate(m.scheduled_date)}</p>
                        </div>
                        <Badge variant={m.daysLeft <= 5 ? 'destructive' : m.daysLeft <= 10 ? 'warning' : 'secondary'} className="text-[10px] flex-shrink-0">
                          {m.daysLeft}d
                        </Badge>
                      </div>
                    ))}
                    {!data?.upcoming_maintenance?.length && !data?.overdue_maintenance?.length && (
                      <p className="text-center text-xs text-slate-400 py-4">No upcoming maintenance</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Expiring Warranties */}
            {(data?.expiring_warranty_count ?? 0) > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">Expiring Warranties</CardTitle>
                    <Link href="/assets">
                      <Button variant="ghost" size="sm" className="gap-1 text-indigo-600 text-xs">
                        View <ArrowUpRight className="w-3 h-3" />
                      </Button>
                    </Link>
                  </div>
                  <CardDescription>Next 60 days</CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-2">
                    {(data?.expiring_warranties ?? []).slice(0, 3).map((a: any) => {
                      const daysLeft = Math.ceil((new Date(a.warranty_expires).getTime() - Date.now()) / 86400000)
                      return (
                        <div key={a.id} className="flex items-center gap-2.5 p-2.5 bg-amber-50/60 rounded-lg">
                          <ShieldAlert className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-slate-800 truncate">{a.name}</p>
                            <p className="text-[11px] text-slate-500 font-mono">{a.asset_tag}</p>
                          </div>
                          <Badge variant="warning" className="text-[10px] flex-shrink-0">{daysLeft}d</Badge>
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
