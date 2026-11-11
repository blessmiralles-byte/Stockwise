'use client'

import { Topbar } from '@/components/layout/topbar'
import { Card, CardContent } from '@/components/ui/card'
import {
  BarChart2, TrendingUp, Package, ChevronRight, Briefcase, TrendingDown, ScrollText, BookOpen, Wrench,
  HardHat, Grid3x3, ShieldCheck, History, Truck, Award, PieChart, FileWarning, Hourglass, Scale, PackageSearch,
} from 'lucide-react'
import Link from 'next/link'
import { type Feature, FEATURES, isToolsPlan, toolsPageAllowed } from '@/lib/entitlements'
import { usePlan } from '@/lib/use-plan'
import { PlanBadge } from '@/components/billing/upgrade-prompt'

type Report = { href: string; icon: any; color: string; title: string; desc: string; feature?: Feature }

/** Grouped by who opens them, so a buyer isn't reading past depreciation runs to find open orders. */
const groups: { title: string; reports: Report[] }[] = [
  {
    title: 'Purchasing',
    reports: [
      {
        href: '/reports/open-pos', icon: Truck, color: 'bg-sky-50 text-sky-600',
        title: 'Open Purchase Orders',
        desc: 'Everything on order and not yet in — what is still to arrive, what it is worth, and which orders are late.',
      },
      {
        href: '/reports/vendor-performance', icon: Award, color: 'bg-indigo-50 text-indigo-600',
        title: 'Vendor Performance',
        desc: 'On-time rate, fill rate, and real lead time against the quoted one, for each vendor.',
      },
      {
        href: '/reports/purchase-spend', icon: PieChart, color: 'bg-violet-50 text-violet-600',
        title: 'Purchase Spend',
        desc: 'What was received in a period, by vendor, category and item — and whose prices went up.',
      },
      {
        href: '/reorder', icon: PackageSearch, color: 'bg-amber-50 text-amber-600',
        title: 'Reorder List',
        desc: 'Items at or below their reorder point, grouped by vendor, ready to turn into purchase orders.',
      },
      {
        href: '/forecasting', icon: TrendingUp, color: 'bg-green-50 text-green-600',
        title: 'Demand Forecast', feature: 'forecasting',
        desc: 'Projected usage and stock balance per item, with a run-out date and the last day to order.',
      },
    ],
  },
  {
    title: 'Accounting',
    reports: [
      {
        href: '/reports/valuation', icon: BarChart2, color: 'bg-indigo-50 text-indigo-600',
        title: 'Inventory Valuation',
        desc: 'Opening stock, purchases, issues (COGS), adjustments and closing stock value for any period.',
      },
      {
        href: '/reports/received-not-invoiced', icon: FileWarning, color: 'bg-amber-50 text-amber-600',
        title: 'Received, Not Invoiced',
        desc: 'Goods that have arrived with no vendor invoice — the accrual to book at period end — and invoices that don’t match what was received.',
      },
      {
        href: '/reports/adjustments', icon: Scale, color: 'bg-rose-50 text-rose-600',
        title: 'Stock Adjustments',
        desc: 'Every write-up and write-down in a period, valued: what shrinkage cost and where it came from.',
      },
      {
        href: '/reports/expenses', icon: Briefcase, color: 'bg-violet-50 text-violet-600',
        title: 'Expenses by Cost Center / Job', feature: 'job_costing',
        desc: 'Consumption and sales grouped by cost center or job code — drill down to item level.',
      },
      {
        href: '/reports/cost-analysis', icon: Grid3x3, color: 'bg-fuchsia-50 text-fuchsia-600',
        title: 'Cost Analysis (Matrix)', feature: 'job_costing',
        desc: 'Expenses cross-tabulated by cost center × job code — matrix, per-job, and per-cost-center views.',
      },
      {
        href: '/reports/depreciation', icon: TrendingDown, color: 'bg-rose-50 text-rose-600',
        title: 'Depreciation Run',
        desc: 'Calculate and post periodic depreciation for all active fixed assets.',
      },
      {
        href: '/reports/assets-roll-forward', icon: ScrollText, color: 'bg-slate-100 text-slate-700',
        title: 'Fixed Assets Roll Forward',
        desc: 'Beginning balance + additions − depreciation − disposals = ending balance, per category.',
      },
      {
        href: '/reports/accounting-export', icon: BookOpen, color: 'bg-emerald-50 text-emerald-600',
        title: 'Accounting Export',
        desc: 'General journal in double-entry format, to import into QuickBooks, Xero or any accounting system.',
      },
    ],
  },
  {
    title: 'Operations',
    reports: [
      {
        href: '/reports/slow-moving', icon: Hourglass, color: 'bg-orange-50 text-orange-600',
        title: 'Slow-Moving Stock',
        desc: 'What is sitting on the shelf, how long since it was last used, and the money tied up in it.',
      },
      {
        href: '/stock-counts', icon: Package, color: 'bg-orange-50 text-orange-600',
        title: 'Stock Counts',
        desc: 'Cycle count history, variance summaries, and approved adjustment records.',
      },
    ],
  },
  {
    title: 'Tools',
    reports: [
      {
        href: '/reports/tools-out', icon: Wrench, color: 'bg-amber-50 text-amber-600',
        title: 'Tools Checked Out',
        desc: 'Every tool currently checked out — who holds it, the job, and whether it is overdue.',
      },
      {
        href: '/reports/tools-by-crew', icon: HardHat, color: 'bg-cyan-50 text-cyan-600',
        title: 'Tools by Crew Member',
        desc: 'Type a crew member’s name to see every tool currently assigned to them.',
      },
      {
        href: '/reports/tool-history', icon: History, color: 'bg-violet-50 text-violet-600',
        title: 'Tool History', feature: 'tool_reports',
        desc: 'Every check-out and return — who had which tool, when it came back, and what state it was in.',
      },
      {
        href: '/reports/tool-compliance', icon: ShieldCheck, color: 'bg-teal-50 text-teal-600',
        title: 'Tool Compliance',
        desc: 'Inspection and calibration certificates — what is due, what has expired — plus lost, stolen and damaged tools.',
      },
    ],
  },
]

export default function ReportsPage() {
  const { has, plan } = usePlan()
  // A Stocked Tools account sees the tool reports and nothing else.
  const toolsOnly = isToolsPlan(plan)
  const visible = groups
    .map(g => ({ ...g, reports: toolsOnly ? g.reports.filter(r => toolsPageAllowed(r.href)) : g.reports }))
    .filter(g => g.reports.length > 0)

  return (
    <div>
      <Topbar title="Reports" />
      <div className="p-6 space-y-8 max-w-5xl">
        {visible.map(g => (
          <section key={g.title}>
            {/* One group needs no heading. */}
            {visible.length > 1 && (
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">{g.title}</h2>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {g.reports.map(r => (
                <Link key={r.href} href={r.href}>
                  <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                    <CardContent className="p-4 flex items-start gap-4">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${r.color}`}>
                        <r.icon className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-slate-900 text-sm flex items-center gap-2">
                          {r.title}
                          {r.feature && !has(r.feature) && <PlanBadge tier={FEATURES[r.feature].minPlan} />}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">{r.desc}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0 mt-1" />
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
