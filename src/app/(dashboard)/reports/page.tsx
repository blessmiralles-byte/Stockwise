'use client'

import { Topbar } from '@/components/layout/topbar'
import { Card, CardContent } from '@/components/ui/card'
import { BarChart2, TrendingUp, Package, ChevronRight, Briefcase, TrendingDown, ScrollText, BookOpen } from 'lucide-react'
import Link from 'next/link'

const reports = [
  {
    href: '/reports/valuation',
    icon: BarChart2,
    color: 'bg-indigo-50 text-indigo-600',
    title: 'Inventory Valuation',
    desc: 'Opening stock, purchases, issues (COGS), and closing stock value for any period.',
  },
  {
    href: '/reports/expenses',
    icon: Briefcase,
    color: 'bg-violet-50 text-violet-600',
    title: 'Expenses by Cost Center / Job',
    desc: 'Consumption and sales grouped by cost center or job code — drill down to SKU level.',
  },
  {
    href: '/reports/depreciation',
    icon: TrendingDown,
    color: 'bg-rose-50 text-rose-600',
    title: 'Depreciation Run',
    desc: 'Calculate and post periodic depreciation for all active fixed assets.',
  },
  {
    href: '/reports/assets-roll-forward',
    icon: ScrollText,
    color: 'bg-slate-100 text-slate-700',
    title: 'Fixed Assets Roll Forward',
    desc: 'Beginning balance + additions − depreciation − disposals = ending balance, per category. Both cost and accumulated depreciation accounts.',
  },
  {
    href: '/reports/accounting-export',
    icon: BookOpen,
    color: 'bg-emerald-50 text-emerald-600',
    title: 'Accounting Export',
    desc: 'General journal in double-entry format. Download as CSV to import into QuickBooks, Xero, MYOB, or any accounting system.',
  },
  {
    href: '/forecasting',
    icon: TrendingUp,
    color: 'bg-green-50 text-green-600',
    title: 'Demand Forecast',
    desc: 'Lead-time-aware reorder alerts, ABC/XYZ classification, and projected demand.',
  },
  {
    href: '/stock-counts',
    icon: Package,
    color: 'bg-orange-50 text-orange-600',
    title: 'Stock Counts',
    desc: 'Cycle count history, variance summaries, and approved adjustment records.',
  },
]

export default function ReportsPage() {
  return (
    <div>
      <Topbar title="Reports" />
      <div className="p-6 space-y-4 max-w-2xl">
        <p className="text-sm text-slate-500">Select a report to view.</p>
        <div className="space-y-3">
          {reports.map(r => (
            <Link key={r.href} href={r.href}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${r.color}`}>
                    <r.icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-slate-900 text-sm">{r.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{r.desc}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
