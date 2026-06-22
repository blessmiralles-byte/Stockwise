'use client'

import { useState } from 'react'
import { Topbar } from '@/components/layout/topbar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useApi } from '@/lib/use-api'
import { formatCurrency } from '@/lib/utils'
import { BarChart2, TrendingUp, TrendingDown, Package, AlertTriangle, Printer } from 'lucide-react'

function SummaryCard({ label, value, sub, color, icon: Icon }: {
  label: string; value: string; sub?: string; color: string; icon: any
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className={`flex items-center gap-2 mb-1`}>
          <Icon className={`w-4 h-4 ${color}`} />
          <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</span>
        </div>
        <p className={`text-2xl font-bold ${color}`}>{value}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  )
}

export default function ValuationReportPage() {
  // Default to current month
  const now = new Date()
  const firstDay = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const lastDay  = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10)

  const [from, setFrom] = useState(firstDay)
  const [to,   setTo]   = useState(lastDay)
  const [query, setQuery] = useState(`?from=${firstDay}&to=${lastDay}`)
  const [search, setSearch] = useState('')

  const { data, loading, error } = useApi<{ data: any }>(
    `/api/reports/valuation${query}`
  )

  function runReport() {
    setQuery(`?from=${from}&to=${to}`)
  }

  const report  = data?.data
  const summary = report?.summary
  const lines: any[] = report?.lines ?? []

  const filtered = lines.filter(l =>
    !search ||
    (l.product?.name ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (l.product?.sku  ?? '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div>
      <Topbar title="Inventory Valuation" />
      <div className="p-6 space-y-5">

        {/* Date picker */}
        <Card className="no-print">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">From</label>
                <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-40" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">To</label>
                <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="w-40" />
              </div>
              <Button onClick={runReport} disabled={loading}>
                {loading ? 'Loading…' : 'Run Report'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {error && <p className="text-red-500 text-sm">{error}</p>}

        {summary && (
          <>
            {/* Print-only header */}
            <div className="print-only mb-6 pb-4 border-b border-slate-200">
              <h1 className="text-xl font-bold text-slate-900">Inventory Valuation Report</h1>
              <p className="text-sm text-slate-500 mt-1">
                Period: {from} to {to}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                Generated {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </p>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <SummaryCard
                label="Opening Stock"
                value={formatCurrency(summary.opening_value)}
                color="text-slate-700"
                icon={Package}
              />
              <SummaryCard
                label="Purchases"
                value={formatCurrency(summary.purchases_value)}
                sub="Stock received"
                color="text-green-600"
                icon={TrendingUp}
              />
              <SummaryCard
                label="Issues / COGS"
                value={formatCurrency(summary.issues_value)}
                sub="Consumed + sold"
                color="text-red-600"
                icon={TrendingDown}
              />
              <SummaryCard
                label="Adjustments"
                value={formatCurrency(Math.abs(summary.adjustments_value))}
                sub={summary.adjustments_value >= 0 ? 'Net positive' : 'Net negative'}
                color="text-yellow-600"
                icon={AlertTriangle}
              />
              <SummaryCard
                label="Closing Stock"
                value={formatCurrency(summary.closing_value)}
                sub="Current balance"
                color="text-indigo-700"
                icon={BarChart2}
              />
            </div>

            {/* Print actions */}
            <div className="flex justify-end no-print">
              <button
                onClick={() => window.print()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors">
                <Printer className="w-3.5 h-3.5" />
                Print Report
              </button>
            </div>

            {/* Reconciliation formula */}
            <div className="bg-indigo-50 border border-indigo-100 rounded-lg px-4 py-3 text-sm text-indigo-700 font-mono">
              {formatCurrency(summary.opening_value)}
              {' + '}{formatCurrency(summary.purchases_value)}
              {' − '}{formatCurrency(summary.issues_value)}
              {summary.adjustments_value !== 0 && (
                <>{' '}{summary.adjustments_value >= 0 ? '+' : '−'}{' '}{formatCurrency(Math.abs(summary.adjustments_value))}</>
              )}
              {' = '}<strong>{formatCurrency(summary.closing_value)}</strong>
            </div>

            {/* Product breakdown */}
            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-sm">Product Breakdown</CardTitle>
                <Input
                  placeholder="Filter…"
                  className="w-40 h-7 text-xs"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-100">
                      <tr>
                        <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase">Product</th>
                        <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase hidden md:table-cell">Category</th>
                        <th className="text-right px-4 py-3 font-semibold text-slate-500 text-xs uppercase hidden lg:table-cell">Opening</th>
                        <th className="text-right px-4 py-3 font-semibold text-green-600 text-xs uppercase">Purchases</th>
                        <th className="text-right px-4 py-3 font-semibold text-red-600 text-xs uppercase">Issues</th>
                        <th className="text-right px-4 py-3 font-semibold text-indigo-700 text-xs uppercase">Closing Value</th>
                        <th className="text-right px-4 py-3 font-semibold text-slate-600 text-xs uppercase hidden lg:table-cell">Closing Qty</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((l: any, i: number) => (
                        <tr key={i} className="border-b border-slate-50 hover:bg-slate-50/50">
                          <td className="px-4 py-3">
                            <p className="font-medium text-slate-900">{l.product?.name ?? '—'}</p>
                            <p className="text-xs text-slate-400 font-mono">{l.product?.sku}</p>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500 hidden md:table-cell">{l.product?.category?.name ?? '—'}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-slate-500 hidden lg:table-cell">{formatCurrency(l.opening_value ?? 0)}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-green-700 font-medium">{formatCurrency(l.purchases_value)}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-red-600">{formatCurrency(l.issues_value)}</td>
                          <td className="px-4 py-3 text-right tabular-nums font-bold text-indigo-700">{formatCurrency(l.closing_value)}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-slate-600 hidden lg:table-cell">
                            {l.closing_qty?.toLocaleString()} <span className="text-slate-400 text-xs">{l.product?.unit_of_measure}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filtered.length === 0 && (
                    <div className="text-center py-10 text-slate-400 text-sm">No transactions in this period.</div>
                  )}
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  )
}
