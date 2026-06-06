'use client'

import {
  Package, BarChart3, QrCode, Truck, ClipboardList, Wrench,
  CheckCircle2, Shield, Zap, Users, Globe, Lock, Star,
  FileText, Bell, ArrowUpDown, Layers, ScanLine, Building2,
  Printer
} from 'lucide-react'
import { PLAN_CONFIG } from '@/lib/stripe-config'

// ─────────────────────────────────────────────────────────────────────────────
// Data
// ─────────────────────────────────────────────────────────────────────────────

const FEATURE_SECTIONS = [
  {
    heading: 'Inventory Management',
    icon: Package,
    color: 'indigo',
    items: [
      'Real-time stock levels across unlimited locations',
      'Weighted average and FIFO cost methods per product',
      'Low-stock threshold alerts and reorder points',
      'Multi-location balance view with transfer support',
      'Category and SKU management with barcode fields',
      'CSV / Excel import for bulk product setup',
    ],
  },
  {
    heading: 'Purchase Orders',
    icon: Truck,
    color: 'sky',
    items: [
      'Create POs with line items, quantities, and unit costs',
      'Send to suppliers and track fulfilment status',
      'Goods receipt (GRN) with partial receipt support',
      'Three-way match: PO → receipt → inventory update',
      'Segregation of duties: creator ≠ receiver',
      'PO number barcode scanning for fast receiving',
    ],
  },
  {
    heading: 'Barcode & QR Scanning',
    icon: ScanLine,
    color: 'violet',
    items: [
      'Universal resolver: scan any code to find any record',
      'Works on any smartphone camera — no dedicated scanner',
      'Resolves products, assets, locations, POs, and stock counts',
      'Instant product detail view with live quantity',
      'Asset check-in / check-out via barcode',
      'Print barcodes directly from the product page',
    ],
  },
  {
    heading: 'Fixed Assets',
    icon: Wrench,
    color: 'amber',
    items: [
      'Full asset register with photos, serial numbers, and tags',
      'Straight-line and declining-balance depreciation engines',
      'Automated monthly depreciation run with audit trail',
      'Asset movement log and location tracking',
      'Maintenance schedules with email alerts',
      'Roll-forward report: opening balance → additions → disposals → closing',
    ],
  },
  {
    heading: 'Stock Counts',
    icon: ClipboardList,
    color: 'emerald',
    items: [
      'Plan cycle counts by location or category',
      'Mobile-friendly count entry with barcode scan',
      'Variance highlighting before posting adjustments',
      'SOD control: counter ≠ approver',
      'Full count history and audit trail',
      'Freeze stock quantities during active counts',
    ],
  },
  {
    heading: 'Requisitions',
    icon: FileText,
    color: 'rose',
    items: [
      'Internal purchase and transfer requisition workflow',
      'Multi-level approval routing by role',
      'Convert approved requisitions to POs in one click',
      'Requisition number scanning via barcode',
      'Status dashboard: draft → submitted → approved → fulfilled',
      'Cost center assignment per requisition line',
    ],
  },
  {
    heading: 'Reports & Analytics',
    icon: BarChart3,
    color: 'teal',
    items: [
      'Inventory valuation report (current period + as-of-date)',
      'Inventory movement ledger with drill-down',
      'Expense and COGS analysis by category',
      'Asset depreciation roll-forward schedule',
      'ABC / XYZ demand classification',
      'Demand forecasting with reorder suggestions',
    ],
  },
  {
    heading: 'Team & Security',
    icon: Shield,
    color: 'slate',
    items: [
      'Six built-in roles: Owner, Procurement, Operations, Receiver, Finance, Viewer',
      'Segregation of duties enforced at the API level',
      'Email invite flow — teammates join your org automatically',
      'Immutable audit log for every create / update / approve action',
      'Row-level security: each org\'s data is completely isolated',
      'Accounting periods with period-close controls',
    ],
  },
]

const COLOR_MAP: Record<string, { bg: string; icon: string; badge: string }> = {
  indigo:  { bg: 'bg-indigo-50',  icon: 'text-indigo-600',  badge: 'bg-indigo-100 text-indigo-700'  },
  sky:     { bg: 'bg-sky-50',     icon: 'text-sky-600',     badge: 'bg-sky-100 text-sky-700'        },
  violet:  { bg: 'bg-violet-50',  icon: 'text-violet-600',  badge: 'bg-violet-100 text-violet-700'  },
  amber:   { bg: 'bg-amber-50',   icon: 'text-amber-600',   badge: 'bg-amber-100 text-amber-700'    },
  emerald: { bg: 'bg-emerald-50', icon: 'text-emerald-600', badge: 'bg-emerald-100 text-emerald-700'},
  rose:    { bg: 'bg-rose-50',    icon: 'text-rose-600',    badge: 'bg-rose-100 text-rose-700'      },
  teal:    { bg: 'bg-teal-50',    icon: 'text-teal-600',    badge: 'bg-teal-100 text-teal-700'      },
  slate:   { bg: 'bg-slate-100',  icon: 'text-slate-600',   badge: 'bg-slate-200 text-slate-700'    },
}

const TRUST_ITEMS = [
  { icon: Globe,          label: 'Multi-location',     sub: 'Warehouses, stores & sites'      },
  { icon: Lock,           label: 'Secure by design',   sub: 'Org-isolated, RLS on every query' },
  { icon: Shield,         label: 'SOD enforced',       sub: 'API-level duty separation'        },
  { icon: Users,          label: 'Role-based access',  sub: '6 purpose-built roles'            },
  { icon: ArrowUpDown,    label: 'FIFO & Avg cost',    sub: 'Configurable per product'         },
  { icon: Zap,            label: '14-day free trial',  sub: 'No credit card required'          },
]

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function OnePagerPage() {
  return (
    <div className="bg-white min-h-screen font-sans">

      {/* ── Print button (hidden when printing) ─────────────────────────── */}
      <div className="print:hidden fixed bottom-6 right-6 z-50">
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold shadow-lg hover:bg-indigo-700 transition-colors"
        >
          <Printer className="w-4 h-4" />
          Save / Print
        </button>
      </div>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="bg-gradient-to-br from-indigo-950 via-indigo-900 to-slate-900 text-white px-10 py-10 print:py-8">
        <div className="max-w-[900px] mx-auto flex items-start justify-between gap-8">
          <div className="flex-1">
            {/* Logo */}
            <div className="flex items-center gap-3 mb-5">
              <div className="w-11 h-11 bg-indigo-500 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-900/40">
                <Package className="w-5.5 h-5.5 text-white" strokeWidth={2.5} />
              </div>
              <span className="text-2xl font-extrabold tracking-tight">StockWise</span>
            </div>

            <h1 className="text-3xl font-extrabold leading-tight mb-3">
              Inventory management<br />
              <span className="text-indigo-300">built for real businesses</span>
            </h1>
            <p className="text-indigo-200 text-sm max-w-lg leading-relaxed">
              One platform for stock control, purchase orders, barcode scanning,
              fixed assets, stock counts, and financial reporting. Replace your
              spreadsheets — your team will be up and running in minutes.
            </p>
          </div>

          {/* QR / CTA block */}
          <div className="flex-shrink-0 text-center hidden sm:block">
            <div className="bg-white/10 border border-white/20 rounded-2xl px-6 py-5 space-y-2">
              <p className="text-xs text-indigo-300 font-medium uppercase tracking-widest">Get started</p>
              <p className="text-2xl font-extrabold">Free 14-day</p>
              <p className="text-indigo-200 text-sm">trial — no card needed</p>
              <div className="pt-2 border-t border-white/10 mt-2">
                <p className="text-xs text-indigo-300">stockwise.app/register</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-[900px] mx-auto px-10 py-10 print:py-8 space-y-12 print:space-y-10">

        {/* ── Trust strip ───────────────────────────────────────────────────── */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-4 py-5 border-y border-slate-100">
          {TRUST_ITEMS.map(t => (
            <div key={t.label} className="text-center space-y-1">
              <t.icon className="w-5 h-5 text-indigo-500 mx-auto" />
              <p className="text-xs font-semibold text-slate-800 leading-tight">{t.label}</p>
              <p className="text-[10px] text-slate-400 leading-tight">{t.sub}</p>
            </div>
          ))}
        </div>

        {/* ── Features grid ─────────────────────────────────────────────────── */}
        <section>
          <h2 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
            <Layers className="w-5 h-5 text-indigo-500" />
            Full feature breakdown
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {FEATURE_SECTIONS.map(section => {
              const c = COLOR_MAP[section.color]
              return (
                <div key={section.heading} className="rounded-xl border border-slate-100 overflow-hidden">
                  {/* Section header */}
                  <div className={`${c.bg} px-4 py-3 flex items-center gap-2.5`}>
                    <div className={`w-7 h-7 rounded-lg bg-white/70 flex items-center justify-center`}>
                      <section.icon className={`w-4 h-4 ${c.icon}`} />
                    </div>
                    <span className="text-sm font-semibold text-slate-800">{section.heading}</span>
                  </div>
                  {/* Items */}
                  <ul className="px-4 py-3 space-y-1.5">
                    {section.items.map(item => (
                      <li key={item} className="flex items-start gap-2 text-xs text-slate-600">
                        <CheckCircle2 className={`w-3.5 h-3.5 flex-shrink-0 mt-0.5 ${c.icon}`} />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>
        </section>

        {/* ── Pricing ───────────────────────────────────────────────────────── */}
        <section className="print:break-inside-avoid">
          <h2 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
            <Star className="w-5 h-5 text-indigo-500" />
            Pricing
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Starter */}
            {(['starter', 'pro', 'enterprise'] as const).map(key => {
              const cfg      = PLAN_CONFIG[key]
              const isPro    = key === 'pro'
              const isEnt    = key === 'enterprise'

              return (
                <div
                  key={key}
                  className={`rounded-xl border p-5 space-y-4 relative ${
                    isPro
                      ? 'border-indigo-300 bg-indigo-600 text-white'
                      : 'border-slate-200 bg-white'
                  }`}
                >
                  {isPro && (
                    <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-amber-400 text-amber-900 text-[10px] font-bold px-2.5 py-0.5 rounded-full">
                      Most Popular
                    </span>
                  )}

                  <div>
                    <p className={`font-bold text-base ${isPro ? 'text-white' : 'text-slate-900'}`}>
                      {cfg.label}
                    </p>
                    {isEnt ? (
                      <p className={`text-2xl font-extrabold mt-1 ${isPro ? 'text-white' : 'text-slate-900'}`}>
                        Custom
                      </p>
                    ) : (
                      <p className={`text-2xl font-extrabold mt-1 ${isPro ? 'text-white' : 'text-slate-900'}`}>
                        ${cfg.price}
                        <span className={`text-xs font-normal ${isPro ? 'text-indigo-200' : 'text-slate-400'}`}> /month</span>
                      </p>
                    )}
                  </div>

                  <ul className="space-y-1.5">
                    {cfg.features.map(f => (
                      <li key={f} className={`flex items-start gap-1.5 text-xs ${isPro ? 'text-indigo-100' : 'text-slate-600'}`}>
                        <CheckCircle2 className={`w-3.5 h-3.5 flex-shrink-0 mt-0.5 ${isPro ? 'text-indigo-200' : 'text-green-500'}`} />
                        {f}
                      </li>
                    ))}
                  </ul>

                  <div className={`pt-2 border-t text-xs ${isPro ? 'border-indigo-500 text-indigo-200' : 'border-slate-100 text-slate-400'}`}>
                    {isEnt ? 'Contact us for a custom quote' : '14-day free trial included'}
                  </div>
                </div>
              )
            })}
          </div>

          <p className="text-xs text-slate-400 text-center mt-4">
            All plans include full access to every feature. No feature gating — just user seat limits.
            Upgrade or cancel anytime.
          </p>
        </section>

        {/* ── Role matrix ───────────────────────────────────────────────────── */}
        <section className="print:break-inside-avoid">
          <h2 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
            <Shield className="w-5 h-5 text-indigo-500" />
            Role permissions at a glance
          </h2>

          <div className="overflow-x-auto rounded-xl border border-slate-100">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="text-left px-3 py-2.5 font-semibold text-slate-600 w-32">Role</th>
                  {['Products', 'POs', 'Receive', 'Assets', 'Counts', 'Reports', 'Users'].map(h => (
                    <th key={h} className="text-center px-2 py-2.5 font-semibold text-slate-600">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 text-slate-600">
                {[
                  { role: 'Owner',        cols: ['✅','✅','✅','✅','✅','✅','✅'] },
                  { role: 'Procurement',  cols: ['✅','✅','—','✅','—','✅','—']   },
                  { role: 'Operations',   cols: ['✅','—','—','✅','✅','✅','—']   },
                  { role: 'Receiver',     cols: ['👁','—','✅','—','—','—','—']    },
                  { role: 'Finance / AP', cols: ['👁','👁','—','👁','—','✅','—']  },
                  { role: 'Viewer',       cols: ['👁','👁','—','👁','👁','👁','—'] },
                ].map(row => (
                  <tr key={row.role} className="hover:bg-slate-50/60">
                    <td className="px-3 py-2 font-medium text-slate-800">{row.role}</td>
                    {row.cols.map((v, i) => (
                      <td key={i} className="px-2 py-2 text-center">{v}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-3 py-2 text-[10px] text-slate-400 bg-slate-50 border-t border-slate-100">
              ✅ Full access &nbsp;·&nbsp; 👁 Read-only &nbsp;·&nbsp; — Not accessible &nbsp;·&nbsp;
              SOD enforced at API level: PO creator ≠ goods receiver; stock counter ≠ adjustment approver.
            </div>
          </div>
        </section>

        {/* ── Footer ────────────────────────────────────────────────────────── */}
        <footer className="border-t border-slate-100 pt-6 pb-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-indigo-600 rounded-md flex items-center justify-center">
              <Package className="w-3 h-3 text-white" strokeWidth={2.5} />
            </div>
            <span className="font-semibold text-slate-700">StockWise</span>
            <span>— Inventory software for growing businesses</span>
          </div>
          <div className="flex gap-4">
            <span>stockwise.app</span>
            <span>hello@stockwise.app</span>
            <span>© {new Date().getFullYear()}</span>
          </div>
        </footer>

      </div>
    </div>
  )
}
