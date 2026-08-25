'use client'

import { useState, useCallback } from 'react'
import { Topbar } from '@/components/layout/topbar'
import { Button } from '@/components/ui/button'
import {
  Loader2, Download, RefreshCw, AlertCircle, Grid3x3, Briefcase, Tag, BarChart3,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface Dim { key: string; label: string; total: number }
interface ReportData {
  period:            { from: string; to: string }
  grand_total:       number
  transaction_count: number
  cost_centers:      Dim[]
  job_codes:         Dim[]
  cells:             Record<string, Record<string, number>>
}

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
}
function pct(part: number, total: number) {
  return total === 0 ? '0%' : ((part / total) * 100).toFixed(1) + '%'
}

function defaultDates() {
  const now  = new Date()
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  const to   = now.toISOString().slice(0, 10)
  return { from, to }
}

type View = 'matrix' | 'by_job' | 'by_cc'

export default function CostAnalysisPage() {
  const def = defaultDates()
  const [from, setFrom] = useState(def.from)
  const [to,   setTo]   = useState(def.to)
  const [view, setView] = useState<View>('matrix')
  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const run = useCallback(async () => {
    if (!from || !to) { setError('Please select a date range'); return }
    setLoading(true); setError(''); setData(null)
    try {
      const res  = await fetch(`/api/reports/cost-analysis?from=${from}&to=${to}`)
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Failed to load report'); return }
      setData(json.data)
    } catch {
      setError('Network error — please try again.')
    } finally {
      setLoading(false)
    }
  }, [from, to])

  const download = () => { window.location.href = `/api/reports/cost-analysis?from=${from}&to=${to}&format=csv` }

  const cell = (ccKey: string, jobKey: string) => data?.cells[ccKey]?.[jobKey] ?? 0
  const hasData = data && data.transaction_count > 0

  return (
    <div>
      <Topbar title="Cost Analysis" />
      <div className="p-6 space-y-5 max-w-6xl">

        <div className="flex items-start gap-3 bg-violet-50 border border-violet-100 rounded-xl px-4 py-3 text-sm text-violet-800">
          <BarChart3 className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold mb-0.5">Expenses across cost centers and job codes</p>
            <p className="text-xs text-violet-600">
              Consumption and sales spend, cross-tabulated by both dimensions. See how each job&apos;s
              cost splits across cost centers (and the reverse) — the intersection the single-axis
              Expenses report can&apos;t show.
            </p>
          </div>
        </div>

        {/* Controls */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">From</label>
              <input type="date" value={from} onChange={e => setFrom(e.target.value)}
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">To</label>
              <input type="date" value={to} onChange={e => setTo(e.target.value)}
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div className="flex gap-1.5">
              {[
                { label: 'This month', fn: () => { const n = new Date(); setFrom(new Date(n.getFullYear(), n.getMonth(), 1).toISOString().slice(0,10)); setTo(n.toISOString().slice(0,10)) } },
                { label: 'Last month', fn: () => { const n = new Date(); const f = new Date(n.getFullYear(), n.getMonth()-1, 1); const t = new Date(n.getFullYear(), n.getMonth(), 0); setFrom(f.toISOString().slice(0,10)); setTo(t.toISOString().slice(0,10)) } },
                { label: 'This year',  fn: () => { const n = new Date(); setFrom(`${n.getFullYear()}-01-01`); setTo(n.toISOString().slice(0,10)) } },
              ].map(r => (
                <button key={r.label} onClick={r.fn} className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-600 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-600 transition-colors">
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={run} disabled={loading} className="gap-2">
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" />Loading…</> : <><RefreshCw className="w-4 h-4" />Run Report</>}
            </Button>
            {hasData && (
              <Button variant="outline" onClick={download} className="gap-2">
                <Download className="w-4 h-4" />Download CSV
              </Button>
            )}
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
          </p>
        )}

        {hasData && (
          <>
            {/* Summary + view toggle */}
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-6 bg-slate-50 border border-slate-200 rounded-xl px-5 py-3">
                <div>
                  <p className="text-xs text-slate-400">Total spend</p>
                  <p className="text-lg font-bold text-slate-900">{fmt(data!.grand_total)}</p>
                </div>
                <div className="w-px h-8 bg-slate-200" />
                <div>
                  <p className="text-xs text-slate-400">Transactions</p>
                  <p className="text-lg font-bold text-slate-900">{data!.transaction_count}</p>
                </div>
              </div>
              <div className="inline-flex items-center bg-slate-100 rounded-lg p-1 text-sm ml-auto">
                {([
                  ['matrix', 'Matrix',         Grid3x3],
                  ['by_job', 'By job',         Tag],
                  ['by_cc',  'By cost center',  Briefcase],
                ] as const).map(([v, label, Icon]) => (
                  <button key={v} onClick={() => setView(v)}
                    className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors',
                      view === v ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500')}>
                    <Icon className="w-3.5 h-3.5" /> {label}
                  </button>
                ))}
              </div>
            </div>

            {view === 'matrix'  && <MatrixView data={data!} cell={cell} />}
            {view === 'by_job'  && <GroupedView data={data!} axis="job" cell={cell} />}
            {view === 'by_cc'   && <GroupedView data={data!} axis="cc"  cell={cell} />}
          </>
        )}

        {data && data.transaction_count === 0 && (
          <div className="text-center py-12 text-slate-400 border border-dashed rounded-xl">
            <BarChart3 className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No tagged expenses found for this period</p>
            <p className="text-xs mt-1">Tag consumption/sale transactions with a cost center or job code to see them here.</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Matrix: cost centers (rows) × job codes (columns) ─────────────────────────
function MatrixView({ data, cell }: { data: ReportData; cell: (cc: string, j: string) => number }) {
  return (
    <div className="border border-slate-200 rounded-xl overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200">
            <th className="text-left px-4 py-2.5 font-semibold text-slate-500 sticky left-0 bg-slate-50 z-10 min-w-[10rem]">Cost Center \ Job</th>
            {data.job_codes.map(j => (
              <th key={j.key} className="text-right px-3 py-2.5 font-semibold text-slate-500 whitespace-nowrap min-w-[6rem]">{j.label}</th>
            ))}
            <th className="text-right px-4 py-2.5 font-semibold text-slate-700 whitespace-nowrap bg-slate-100">Row Total</th>
          </tr>
        </thead>
        <tbody>
          {data.cost_centers.map(cc => (
            <tr key={cc.key} className="border-b border-slate-50 hover:bg-slate-50/60">
              <td className="px-4 py-2.5 text-slate-700 font-medium sticky left-0 bg-white z-10">{cc.label}</td>
              {data.job_codes.map(j => {
                const v = cell(cc.key, j.key)
                return (
                  <td key={j.key} className={cn('px-3 py-2.5 text-right font-mono', v > 0 ? 'text-slate-700' : 'text-slate-300')}>
                    {v > 0 ? fmt(v) : '·'}
                  </td>
                )
              })}
              <td className="px-4 py-2.5 text-right font-mono font-semibold text-slate-900 bg-slate-50">{fmt(cc.total)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-slate-100 border-t border-slate-200">
            <td className="px-4 py-2.5 font-semibold text-slate-700 sticky left-0 bg-slate-100 z-10">Column Total</td>
            {data.job_codes.map(j => (
              <td key={j.key} className="px-3 py-2.5 text-right font-mono font-semibold text-slate-800">{fmt(j.total)}</td>
            ))}
            <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-900 bg-slate-200">{fmt(data.grand_total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

// ── Grouped: one axis as sections, the other as a breakdown underneath ────────
function GroupedView({ data, axis, cell }: {
  data: ReportData
  axis: 'job' | 'cc'
  cell: (cc: string, j: string) => number
}) {
  // Outer = the axis we group by; inner = the other dimension.
  const outer = axis === 'job' ? data.job_codes    : data.cost_centers
  const inner = axis === 'job' ? data.cost_centers : data.job_codes
  const valueOf = (outerKey: string, innerKey: string) =>
    axis === 'job' ? cell(innerKey, outerKey) : cell(outerKey, innerKey)

  return (
    <div className="space-y-3">
      {outer.map(o => {
        const lines = inner
          .map(i => ({ label: i.label, value: valueOf(o.key, i.key) }))
          .filter(l => l.value > 0)
          .sort((a, b) => b.value - a.value)
        return (
          <div key={o.key} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-100">
              <div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center flex-shrink-0">
                {axis === 'job' ? <Tag className="w-4 h-4 text-indigo-600" /> : <Briefcase className="w-4 h-4 text-indigo-600" />}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900 truncate">{o.label}</p>
                <p className="text-xs text-slate-400">{pct(o.total, data.grand_total)} of total spend</p>
              </div>
              <p className="ml-auto text-sm font-bold text-slate-900 font-mono">{fmt(o.total)}</p>
            </div>
            <div className="divide-y divide-slate-50">
              {lines.map((l, i) => (
                <div key={i} className="flex items-center gap-3 px-5 py-2 text-xs">
                  <span className="text-slate-600">{l.label}</span>
                  <span className="ml-auto text-slate-400">{pct(l.value, o.total)}</span>
                  <span className="font-mono font-medium text-slate-800 w-24 text-right">{fmt(l.value)}</span>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
