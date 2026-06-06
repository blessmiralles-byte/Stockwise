'use client'

import { useState, useCallback } from 'react'
import { Topbar } from '@/components/layout/topbar'
import {
  Loader2, AlertCircle, Download, BarChart3,
  ChevronDown, ChevronRight, Info, Printer,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────
interface CategoryRow {
  id:   string
  name: string
  beginning_cost:       number
  additions_cost:       number
  disposals_cost:       number
  ending_cost:          number
  beginning_accum_depr: number
  period_depreciation:  number
  accum_depr_disposals: number
  ending_accum_depr:    number
  beginning_nbv:        number
  ending_nbv:           number
  count_beginning:      number
  count_additions:      number
  count_disposals:      number
  count_ending:         number
}

interface ReportData {
  period:     { from: string; to: string }
  categories: CategoryRow[]
  total:      Omit<CategoryRow, 'id' | 'name'>
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const $ = (n: number, showSign = false) => {
  const abs  = Math.abs(n)
  const str  = new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 2,
  }).format(abs)
  if (showSign && n < 0) return `(${str})`
  if (showSign && n > 0) return str
  return str
}

// Accumulated depreciation columns always shown as (credit balance / negative)
const $depr = (n: number) => n === 0 ? '—' : `(${$(n)})`

// Movement display: + for increases, () for decreases
const $add  = (n: number) => n === 0 ? '—' : $(n)
const $disp = (n: number) => n === 0 ? '—' : `(${$(n)})`   // disposals remove cost
const $deprAdd  = (n: number) => n === 0 ? '—' : `(${$(n)})` // depr increases contra
const $deprDisp = (n: number) => n === 0 ? '—' : $(n)        // removes accum depr

// ── Row Components ─────────────────────────────────────────────────────────────

/** One labelled data row spanning all 3 column groups */
function DataRow({
  label, sublabel,
  costVal, contraVal, nbvVal,
  isBold, isTotal, isSeparator,
  costClass, contraClass, nbvClass,
}: {
  label:      string
  sublabel?:  string
  costVal:    string
  contraVal:  string
  nbvVal:     string
  isBold?:    boolean
  isTotal?:   boolean
  isSeparator?: boolean
  costClass?:  string
  contraClass?: string
  nbvClass?:   string
}) {
  if (isSeparator) {
    return (
      <tr>
        <td colSpan={4} className="px-0 py-0">
          <div className="border-t border-slate-200 mx-0" />
        </td>
      </tr>
    )
  }

  return (
    <tr className={cn(
      'group transition-colors',
      isTotal ? 'bg-slate-900 text-white' : isBold ? 'bg-slate-50' : 'hover:bg-slate-50/60'
    )}>
      {/* Label */}
      <td className={cn('px-5 py-2.5 text-sm', isBold || isTotal ? 'font-semibold' : 'font-normal', isTotal ? 'text-white' : 'text-slate-700')}>
        {label}
        {sublabel && <span className={cn('block text-xs font-normal mt-0.5', isTotal ? 'text-slate-300' : 'text-slate-400')}>{sublabel}</span>}
      </td>

      {/* Cost account */}
      <td className={cn('px-5 py-2.5 text-right text-sm tabular-nums', isBold || isTotal ? 'font-bold' : 'font-medium', isTotal ? 'text-white' : costClass ?? 'text-slate-800')}>
        {costVal}
      </td>

      {/* Accumulated depreciation (contra) */}
      <td className={cn('px-5 py-2.5 text-right text-sm tabular-nums', isBold || isTotal ? 'font-bold' : 'font-medium', isTotal ? 'text-slate-200' : contraClass ?? 'text-slate-600')}>
        {contraVal}
      </td>

      {/* Net book value */}
      <td className={cn('px-5 py-2.5 text-right text-sm tabular-nums', isBold || isTotal ? 'font-bold' : 'font-medium', isTotal ? 'text-white' : nbvClass ?? 'text-slate-800')}>
        {nbvVal}
      </td>
    </tr>
  )
}

/** Expandable category section */
function CategorySection({ cat, isLast }: { cat: CategoryRow; isLast: boolean }) {
  const [open, setOpen] = useState(true)

  return (
    <>
      {/* Category header */}
      <tr
        className="cursor-pointer hover:bg-indigo-50/50 transition-colors border-t border-slate-200"
        onClick={() => setOpen(o => !o)}
      >
        <td colSpan={4} className="px-5 py-2.5">
          <div className="flex items-center gap-2">
            {open
              ? <ChevronDown className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
              : <ChevronRight className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />}
            <span className="text-xs font-bold uppercase tracking-widest text-indigo-700">{cat.name}</span>
            <span className="text-xs text-slate-400 ml-1">
              {cat.count_ending} asset{cat.count_ending !== 1 ? 's' : ''} at period end
            </span>
          </div>
        </td>
      </tr>

      {open && (
        <>
          {/* Beginning balance */}
          <DataRow
            label="Beginning Balance"
            sublabel={`${cat.count_beginning} asset${cat.count_beginning !== 1 ? 's' : ''} at period start`}
            costVal={cat.beginning_cost === 0 ? '—' : $(cat.beginning_cost)}
            contraVal={$depr(cat.beginning_accum_depr)}
            nbvVal={cat.beginning_nbv === 0 ? '—' : $(cat.beginning_nbv)}
            isBold
          />

          {/* Additions */}
          <DataRow
            label="+ Additions"
            sublabel={cat.count_additions > 0 ? `${cat.count_additions} asset${cat.count_additions !== 1 ? 's' : ''} acquired` : undefined}
            costVal={$add(cat.additions_cost)}
            contraVal="—"
            nbvVal={cat.additions_cost === 0 ? '—' : $add(cat.additions_cost)}
            costClass="text-emerald-700"
            nbvClass="text-emerald-700"
          />

          {/* Depreciation */}
          <DataRow
            label="− Depreciation"
            costVal="—"
            contraVal={$deprAdd(cat.period_depreciation)}
            nbvVal={cat.period_depreciation === 0 ? '—' : `(${$(cat.period_depreciation)})`}
            contraClass="text-rose-700"
            nbvClass="text-rose-700"
          />

          {/* Disposals / retirements */}
          <DataRow
            label="− Disposals / Retirements"
            sublabel={cat.count_disposals > 0 ? `${cat.count_disposals} asset${cat.count_disposals !== 1 ? 's' : ''} retired` : undefined}
            costVal={$disp(cat.disposals_cost)}
            contraVal={cat.accum_depr_disposals === 0 ? '—' : $deprDisp(cat.accum_depr_disposals)}
            nbvVal={(() => {
              const nbvImpact = cat.disposals_cost - cat.accum_depr_disposals
              return nbvImpact === 0 ? '—' : nbvImpact > 0 ? `(${$(nbvImpact)})` : $(Math.abs(nbvImpact))
            })()}
            costClass="text-amber-700"
            contraClass="text-emerald-700"
          />

          {/* Separator */}
          <DataRow
            label="" costVal="" contraVal="" nbvVal="" isSeparator
          />

          {/* Ending balance */}
          <DataRow
            label="Ending Balance"
            sublabel={`${cat.count_ending} asset${cat.count_ending !== 1 ? 's' : ''} at period end`}
            costVal={cat.ending_cost === 0 ? '—' : $(cat.ending_cost)}
            contraVal={$depr(cat.ending_accum_depr)}
            nbvVal={cat.ending_nbv === 0 ? '—' : $(cat.ending_nbv)}
            isBold
          />
        </>
      )}
    </>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function AssetsRollForwardPage() {
  const today    = new Date().toISOString().slice(0, 10)
  const firstDom = today.slice(0, 8) + '01'

  const [from, setFrom]       = useState(firstDom)
  const [to,   setTo]         = useState(today)
  const [data, setData]       = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  const run = useCallback(async () => {
    setLoading(true); setError(''); setData(null)
    try {
      const params = new URLSearchParams({ from, to })
      const res    = await fetch(`/api/reports/assets/roll-forward?${params}`)
      const json   = await res.json()
      if (!res.ok) { setError(json.error ?? 'Failed to load report'); return }
      setData(json.data)
    } catch {
      setError('Network error — please try again.')
    } finally {
      setLoading(false)
    }
  }, [from, to])

  const downloadCsv = () => {
    if (!data) return
    const rows: string[][] = [
      ['Category', 'Line Item', 'Cost Account', 'Accum. Depreciation (Contra)', 'Net Book Value'],
    ]
    const addSection = (cat: CategoryRow, label: string) => {
      rows.push([label, 'Beginning Balance',           String(cat.beginning_cost),       String(-cat.beginning_accum_depr), String(cat.beginning_nbv)])
      rows.push([label, '+ Additions',                 String(cat.additions_cost),        '0',                              String(cat.additions_cost)])
      rows.push([label, '- Depreciation',              '0',                               String(-cat.period_depreciation),  String(-cat.period_depreciation)])
      rows.push([label, '- Disposals',                 String(-cat.disposals_cost),       String(cat.accum_depr_disposals),  String(-(cat.disposals_cost - cat.accum_depr_disposals))])
      rows.push([label, 'Ending Balance',              String(cat.ending_cost),           String(-cat.ending_accum_depr),    String(cat.ending_nbv)])
    }
    data.categories.forEach(c => addSection(c, c.name))
    addSection({ ...data.total, id: 'TOTAL', name: 'TOTAL' } as CategoryRow, 'TOTAL')
    const csv = rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a   = document.createElement('a'); a.href = url
    a.download = `fixed-assets-roll-forward-${from}-to-${to}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  return (
    <div>
      <Topbar title="Fixed Assets Roll Forward" />
      <div className="p-6 max-w-5xl mx-auto space-y-6">

        {/* Controls */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 no-print">
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
            <button
              onClick={run} disabled={loading}
              className="flex items-center gap-2 px-5 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <BarChart3 className="w-4 h-4" />}
              Run Report
            </button>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-4 text-xs text-slate-500 no-print">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-slate-900 inline-block" /> Cost Account — gross asset value at cost
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-slate-400 inline-block" /> Contra Account — accumulated depreciation (credit balance shown in parentheses)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-indigo-500 inline-block" /> NBV — Net Book Value = Cost − Accum. Depr.
          </span>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-xl">
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
            {/* Report title block */}
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900">Fixed Assets Roll Forward</h2>
                <p className="text-sm text-slate-500 mt-0.5">
                  Period: {new Date(data.period.from).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                  {' '}–{' '}
                  {new Date(data.period.to).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                </p>
                <p className="print-only text-xs text-slate-400 mt-0.5">
                  Generated {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                </p>
              </div>
              <div className="flex items-center gap-2 no-print flex-shrink-0">
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

            {data.categories.length === 0 ? (
              <div className="text-center py-16 text-slate-400 border border-dashed border-slate-200 rounded-xl">
                <p className="text-sm font-medium">No fixed asset data found for this period</p>
                <p className="text-xs mt-1">Ensure assets have a purchase date set</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                <table className="w-full border-collapse">

                  {/* Column headers */}
                  <thead>
                    <tr className="bg-slate-800 text-white">
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider w-[38%]">
                        Description
                      </th>
                      <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider w-[20%]">
                        Cost Account
                      </th>
                      <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider w-[22%]">
                        Accum. Depreciation
                        <span className="block text-slate-400 font-normal normal-case tracking-normal">(Contra Account)</span>
                      </th>
                      <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider w-[20%]">
                        Net Book Value
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {/* Per-category sections */}
                    {data.categories.map((cat, i) => (
                      <CategorySection
                        key={cat.id}
                        cat={cat}
                        isLast={i === data.categories.length - 1}
                      />
                    ))}

                    {/* Grand total */}
                    <tr><td colSpan={4} className="p-0"><div className="border-t-2 border-slate-800" /></td></tr>
                    <DataRow
                      label="GRAND TOTAL"
                      sublabel={`${data.total.count_ending} assets at period end`}
                      costVal={$(data.total.ending_cost)}
                      contraVal={$depr(data.total.ending_accum_depr)}
                      nbvVal={$(data.total.ending_nbv)}
                      isTotal
                    />
                  </tbody>
                </table>

                {/* Footnote */}
                <div className="border-t border-slate-100 px-5 py-3 flex items-start gap-2 bg-slate-50/50">
                  <Info className="w-3.5 h-3.5 text-slate-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Accumulated depreciation reflects <strong>posted depreciation runs</strong> only.
                    Assets with method <em>units_of_production</em> or <em>none</em> will show $0 depreciation unless manually updated.
                    Depreciation on disposals is estimated as cost minus current book value at time of disposal.
                  </p>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
