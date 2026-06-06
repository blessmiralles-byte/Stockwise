'use client'

import { useState, useCallback } from 'react'
import { Topbar } from '@/components/layout/topbar'
import {
  Loader2, Download, ChevronDown, ChevronRight,
  Briefcase, Tag, AlertCircle, BarChart3, Printer,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────
interface ProductLine {
  product:      any
  quantity:     number
  total_cost:   number
  transactions: number
}

interface ExpenseGroup {
  key:          string
  label:        string
  meta:         any
  total_cost:   number
  products:     ProductLine[]
}

interface ReportData {
  period:            { from: string; to: string }
  group_by:          'cost_center' | 'job_code'
  grand_total:       number
  transaction_count: number
  groups:            ExpenseGroup[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
}

function pct(part: number, total: number) {
  if (total === 0) return '0%'
  return ((part / total) * 100).toFixed(1) + '%'
}

// ── Group Card ────────────────────────────────────────────────────────────────
function GroupCard({ group, grandTotal }: { group: ExpenseGroup; grandTotal: number }) {
  const [open, setOpen] = useState(false)
  const isUnassigned    = group.key === '__unassigned__'

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      {/* Header row */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-4 px-5 py-4 hover:bg-slate-50 transition-colors text-left">
        <div className={cn(
          'w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0',
          isUnassigned ? 'bg-slate-100' : 'bg-indigo-50'
        )}>
          <Briefcase className={cn('w-4 h-4', isUnassigned ? 'text-slate-400' : 'text-indigo-600')} />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-900 truncate">{group.label}</p>
          {group.meta?.code && group.meta?.name && (
            <p className="text-xs text-slate-400 font-mono">{group.meta.code}</p>
          )}
        </div>

        {/* Bar */}
        <div className="hidden sm:flex flex-col items-end gap-1 w-48">
          <div className="w-full bg-slate-100 rounded-full h-1.5">
            <div
              className="bg-indigo-500 h-1.5 rounded-full transition-all"
              style={{ width: pct(group.total_cost, grandTotal) }}
            />
          </div>
          <span className="text-xs text-slate-400">{pct(group.total_cost, grandTotal)}</span>
        </div>

        <div className="text-right ml-4 flex-shrink-0">
          <p className="text-sm font-bold text-slate-900">{fmt(group.total_cost)}</p>
          <p className="text-xs text-slate-400">{group.products.length} SKU{group.products.length !== 1 ? 's' : ''}</p>
        </div>

        {open
          ? <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
          : <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />}
      </button>

      {/* Product breakdown */}
      {open && (
        <div className="border-t border-slate-100">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
                <th className="px-5 py-2 text-left font-medium">Product</th>
                <th className="px-4 py-2 text-right font-medium">Qty</th>
                <th className="px-4 py-2 text-right font-medium">Txns</th>
                <th className="px-5 py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {group.products.map((p, i) => (
                <tr key={i} className="border-t border-slate-50 hover:bg-slate-50/50 transition-colors">
                  <td className="px-5 py-3">
                    <p className="font-medium text-slate-800">{p.product?.name ?? '—'}</p>
                    <p className="text-xs text-slate-400 font-mono mt-0.5">
                      {p.product?.sku} · {p.product?.category?.name ?? 'Uncategorised'}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-right text-slate-600">
                    {p.quantity} {p.product?.unit_of_measure ?? ''}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-400">{p.transactions}</td>
                  <td className="px-5 py-3 text-right font-semibold text-slate-900">{fmt(p.total_cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function ExpensesReportPage() {
  const today   = new Date().toISOString().slice(0, 10)
  const firstDom = today.slice(0, 8) + '01'

  const [from, setFrom]       = useState(firstDom)
  const [to,   setTo]         = useState(today)
  const [groupBy, setGroupBy] = useState<'cost_center' | 'job_code'>('cost_center')
  const [data, setData]       = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  const run = useCallback(async () => {
    setLoading(true); setError(''); setData(null)
    try {
      const params = new URLSearchParams({ from, to, group_by: groupBy })
      const res  = await fetch(`/api/reports/expenses?${params}`)
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Failed to load report'); return }
      setData(json.data)
    } catch {
      setError('Network error — please try again.')
    } finally {
      setLoading(false)
    }
  }, [from, to, groupBy])

  const downloadCsv = () => {
    if (!data) return
    const rows: string[][] = [
      ['Group', 'Product', 'SKU', 'Category', 'Qty', 'Transactions', 'Amount'],
    ]
    for (const g of data.groups) {
      for (const p of g.products) {
        rows.push([
          g.label,
          p.product?.name ?? '',
          p.product?.sku ?? '',
          p.product?.category?.name ?? '',
          String(p.quantity),
          String(p.transactions),
          String(p.total_cost),
        ])
      }
    }
    const csv = rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a   = document.createElement('a')
    a.href    = url
    a.download = `expenses-${from}-to-${to}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <Topbar title="Expense Report" />
      <div className="p-6 max-w-4xl mx-auto">

        {/* Filters */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 mb-6 no-print">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1.5">From</label>
              <input type="date" value={from} onChange={e => setFrom(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1.5">To</label>
              <input type="date" value={to} onChange={e => setTo(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1.5">Group By</label>
              <select value={groupBy} onChange={e => setGroupBy(e.target.value as any)}
                className="px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="cost_center">Cost Center</option>
                <option value="job_code">Job Code</option>
              </select>
            </div>
            <button
              onClick={run}
              disabled={loading}
              className="flex items-center gap-2 px-5 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors">
              {loading
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <BarChart3 className="w-4 h-4" />}
              Run Report
            </button>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-xl mb-4">
            <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
          </div>
        )}

        {data && !loading && (
          <>
            {/* Print-only header */}
            <div className="print-only mb-6 pb-4 border-b border-slate-200">
              <h1 className="text-xl font-bold text-slate-900">
                Expense Report — {data.group_by === 'cost_center' ? 'By Cost Center' : 'By Job Code'}
              </h1>
              <p className="text-sm text-slate-500 mt-1">
                Period: {data.period.from} to {data.period.to}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                Generated {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </p>
            </div>

            {/* Summary bar */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <p className="text-xs text-slate-500 mb-1">Total Expense</p>
                <p className="text-2xl font-bold text-slate-900">{fmt(data.grand_total)}</p>
                <p className="text-xs text-slate-400 mt-1">{data.period.from} → {data.period.to}</p>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <p className="text-xs text-slate-500 mb-1">
                  {data.group_by === 'cost_center' ? 'Cost Centers' : 'Job Codes'}
                </p>
                <p className="text-2xl font-bold text-slate-900">{data.groups.length}</p>
                <p className="text-xs text-slate-400 mt-1">with activity</p>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <p className="text-xs text-slate-500 mb-1">Transactions</p>
                <p className="text-2xl font-bold text-slate-900">{data.transaction_count}</p>
                <p className="text-xs text-slate-400 mt-1">consumption + sales</p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between mb-4 no-print">
              <p className="text-xs text-slate-500">
                Grouped by <span className="font-semibold text-slate-700">
                  {data.group_by === 'cost_center' ? 'Cost Center' : 'Job Code'}
                </span> — click a row to expand products
              </p>
              <div className="flex items-center gap-2">
                <button onClick={() => window.print()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors">
                  <Printer className="w-3.5 h-3.5" />
                  Print
                </button>
                <button onClick={downloadCsv}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors">
                  <Download className="w-3.5 h-3.5" />
                  Export CSV
                </button>
              </div>
            </div>

            {/* Groups */}
            {data.groups.length === 0 ? (
              <div className="text-center py-16 text-slate-400 border border-dashed border-slate-200 rounded-xl">
                <Tag className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm font-medium">No expense data for this period</p>
              </div>
            ) : (
              <div className="space-y-3">
                {data.groups.map(g => (
                  <GroupCard key={g.key} group={g} grandTotal={data.grand_total} />
                ))}

                {/* Grand total row */}
                <div className="flex items-center justify-between px-5 py-4 bg-slate-900 rounded-xl text-white">
                  <p className="text-sm font-semibold">Grand Total</p>
                  <p className="text-lg font-bold">{fmt(data.grand_total)}</p>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
