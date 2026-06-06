'use client'

import { useState, useCallback } from 'react'
import { Topbar } from '@/components/layout/topbar'
import {
  Loader2, AlertCircle, CheckCircle2, Play, Eye,
  TrendingDown, AlertTriangle, Printer,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────
interface DeprLine {
  asset_id:            string
  asset_tag:           string
  name:                string
  method:              string
  book_value_before:   number
  depreciation_amount: number
  book_value_after:    number
  skipped_reason?:     string
}

interface DeprResult {
  dry_run?:           boolean
  period:             { period_start: string; period_end: string; days: number }
  assets_posted?:     number
  total_depreciation: number
  lines:              DeprLine[]
  skipped:            DeprLine[]
  errors?:            string[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
}

const METHOD_LABELS: Record<string, string> = {
  straight_line:       'Straight-Line',
  declining_balance:   'Declining Balance',
  double_declining:    'Double-Declining',
  units_of_production: 'Units of Production',
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function DepreciationPage() {
  const today    = new Date().toISOString().slice(0, 10)
  const firstDom = today.slice(0, 8) + '01'

  const [from, setFrom]       = useState(firstDom)
  const [to,   setTo]         = useState(today)
  const [result, setResult]   = useState<DeprResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  const run = useCallback(async (dryRun: boolean) => {
    setLoading(true); setError(''); setResult(null)
    try {
      const res  = await fetch('/api/assets/depreciation/run', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ period_start: from, period_end: to, dry_run: dryRun }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Failed to run depreciation'); return }
      setResult(json.data)
    } catch {
      setError('Network error — please try again.')
    } finally {
      setLoading(false)
    }
  }, [from, to])

  return (
    <div>
      <Topbar title="Depreciation Run" />
      <div className="p-6 max-w-4xl mx-auto space-y-6">

        {/* Info banner */}
        <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl no-print">
          <AlertCircle className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-800">
            <p className="font-semibold mb-1">How this works</p>
            <p className="text-xs leading-relaxed text-blue-700">
              This tool calculates and posts depreciation for all active assets with a method set (straight-line, declining balance, or double-declining).
              Use <span className="font-semibold">Preview</span> first to see what will be posted, then <span className="font-semibold">Post</span> to commit the entries.
              Running twice for the same period is safe — duplicates are blocked.
            </p>
          </div>
        </div>

        {/* Controls */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 no-print">
          <h2 className="text-sm font-semibold text-slate-900 mb-4">Period</h2>
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1.5">Period Start</label>
              <input type="date" value={from} onChange={e => setFrom(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1.5">Period End</label>
              <input type="date" value={to} onChange={e => setTo(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => run(true)}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50 transition-colors">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                Preview
              </button>
              <button
                onClick={() => run(false)}
                disabled={loading}
                className="flex items-center gap-2 px-5 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                Post Depreciation
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-xl">
            <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
          </div>
        )}

        {result && !loading && (
          <div className="space-y-5">
            {/* Print-only header */}
            <div className="print-only pb-4 border-b border-slate-200">
              <h1 className="text-xl font-bold text-slate-900">
                Depreciation Run — {result.dry_run ? 'Preview' : 'Posted'}
              </h1>
              <p className="text-sm text-slate-500 mt-1">
                Period: {result.period.period_start} to {result.period.period_end} ({result.period.days} days)
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                Generated {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </p>
            </div>

            {/* Print action */}
            <div className="flex justify-end no-print">
              <button onClick={() => window.print()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors">
                <Printer className="w-3.5 h-3.5" />
                Print
              </button>
            </div>

            {/* Result banner */}
            <div className={cn(
              'flex items-start gap-3 p-4 rounded-xl border',
              result.dry_run
                ? 'bg-amber-50 border-amber-200'
                : result.errors?.length
                  ? 'bg-orange-50 border-orange-200'
                  : 'bg-green-50 border-green-200'
            )}>
              {result.dry_run
                ? <Eye className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                : <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />}
              <div>
                <p className={cn('font-semibold text-sm',
                  result.dry_run ? 'text-amber-800' : 'text-green-800')}>
                  {result.dry_run
                    ? 'Preview — no entries posted'
                    : `${result.assets_posted} asset${result.assets_posted !== 1 ? 's' : ''} depreciated`}
                </p>
                <p className="text-xs mt-0.5 text-slate-600">
                  Period: {result.period.period_start} → {result.period.period_end}
                  ({result.period.days} days) ·
                  Total: <span className="font-semibold">{fmt(result.total_depreciation)}</span>
                </p>
                {result.errors?.map((e, i) => (
                  <p key={i} className="text-xs text-red-700 mt-1">⚠ {e}</p>
                ))}
              </div>
            </div>

            {/* Lines table */}
            {result.lines.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
                  <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                    Depreciation Entries ({result.lines.length})
                  </p>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-slate-500 border-b border-slate-100">
                      <th className="px-5 py-2.5 text-left font-medium">Asset</th>
                      <th className="px-4 py-2.5 text-left font-medium">Method</th>
                      <th className="px-4 py-2.5 text-right font-medium">Book Value Before</th>
                      <th className="px-4 py-2.5 text-right font-medium">Depreciation</th>
                      <th className="px-5 py-2.5 text-right font-medium">Book Value After</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.lines.map((l, i) => (
                      <tr key={i} className="border-t border-slate-50 hover:bg-slate-50/50 transition-colors">
                        <td className="px-5 py-3">
                          <p className="font-medium text-slate-800">{l.name}</p>
                          <p className="text-xs text-slate-400 font-mono">{l.asset_tag}</p>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">
                          {METHOD_LABELS[l.method] ?? l.method}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-600">{fmt(l.book_value_before)}</td>
                        <td className="px-4 py-3 text-right font-semibold text-red-600">
                          <span className="flex items-center justify-end gap-1">
                            <TrendingDown className="w-3.5 h-3.5" />
                            {fmt(l.depreciation_amount)}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right font-semibold text-slate-900">{fmt(l.book_value_after)}</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-slate-200 bg-slate-50">
                      <td colSpan={3} className="px-5 py-3 text-sm font-semibold text-slate-700">Total</td>
                      <td className="px-4 py-3 text-right font-bold text-red-600">
                        {fmt(result.total_depreciation)}
                      </td>
                      <td />
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {/* Skipped */}
            {result.skipped.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                  <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                    Skipped / Not Applicable ({result.skipped.length})
                  </p>
                </div>
                <div className="divide-y divide-slate-50">
                  {result.skipped.map((s, i) => (
                    <div key={i} className="flex items-center justify-between px-5 py-3">
                      <div>
                        <p className="text-sm font-medium text-slate-700">{s.name}</p>
                        <p className="text-xs text-slate-400 font-mono">{s.asset_tag}</p>
                      </div>
                      <p className="text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded-full ml-4">
                        {s.skipped_reason}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
