'use client'

import { useState } from 'react'
import { Topbar } from '@/components/layout/topbar'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils'
import {
  Download, Loader2, RefreshCw, BookOpen,
  AlertCircle, CheckCircle2, Info,
} from 'lucide-react'
import { postingReference, JOURNAL_SCOPE, JOURNAL_IMPORT_STEPS } from '@/lib/journal-mapping'

// ── Types ─────────────────────────────────────────────────────────────────────
interface JournalEntry {
  date:           string
  reference:      string
  type:           string
  description:    string
  debit_account:  string
  credit_account: string
  amount:         number
  product:        string
  category:       string
  notes:          string
}

const TX_TYPES = [
  { id: 'purchase',     label: 'Purchases',    color: 'bg-green-100 text-green-700'  },
  { id: 'sale',         label: 'Sales / COGS', color: 'bg-blue-100 text-blue-700'    },
  { id: 'consumption',  label: 'Consumption',  color: 'bg-violet-100 text-violet-700'},
  { id: 'adjustment',   label: 'Adjustments',  color: 'bg-amber-100 text-amber-700'  },
  { id: 'transfer',     label: 'Transfers',    color: 'bg-slate-100 text-slate-600'  },
  { id: 'depreciation', label: 'Depreciation', color: 'bg-rose-100 text-rose-700'    },
  { id: 'invoice_receipt', label: 'Invoice Receipts', color: 'bg-teal-100 text-teal-700' },
  { id: 'ppv',          label: 'Price Variance', color: 'bg-orange-100 text-orange-700' },
]

const TYPE_COLOR: Record<string, string> = Object.fromEntries(TX_TYPES.map(t => [t.id.toLowerCase(), t.color]))

function typeBadgeColor(type: string) {
  const key = type.toLowerCase().replace(/[^a-z]/g, '')
  if (key.includes('purchase'))    return 'bg-green-100 text-green-700'
  if (key.includes('sale'))        return 'bg-blue-100 text-blue-700'
  if (key.includes('consumption')) return 'bg-violet-100 text-violet-700'
  if (key.includes('adjustment'))  return 'bg-amber-100 text-amber-700'
  if (key.includes('transfer'))    return 'bg-slate-100 text-slate-600'
  if (key.includes('depreciation'))return 'bg-rose-100 text-rose-700'
  if (key.includes('invoicereceipt')) return 'bg-teal-100 text-teal-700'
  if (key.includes('variance'))    return 'bg-orange-100 text-orange-700'
  return 'bg-slate-100 text-slate-500'
}

// ── Default date range: current month ─────────────────────────────────────────
function defaultDates() {
  const now   = new Date()
  const from  = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  const to    = now.toISOString().slice(0, 10)
  return { from, to }
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function AccountingExportPage() {
  const def = defaultDates()
  const [from,        setFrom]        = useState(def.from)
  const [to,          setTo]          = useState(def.to)
  const [selectedTypes, setSelectedTypes] = useState<string[]>([])   // empty = all
  const [entries,     setEntries]     = useState<JournalEntry[]>([])
  const [summary,     setSummary]     = useState<{ total: number; count: number } | null>(null)
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState('')
  const [downloaded,  setDownloaded]  = useState(false)

  const toggleType = (id: string) =>
    setSelectedTypes(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id])

  const buildUrl = (fmt = 'json') => {
    const params = new URLSearchParams({ from, to, format: fmt })
    if (selectedTypes.length) params.set('types', selectedTypes.join(','))
    return `/api/reports/journal?${params}`
  }

  const run = async () => {
    if (!from || !to) { setError('Please select a date range'); return }
    setLoading(true); setError(''); setEntries([]); setSummary(null)
    const res  = await fetch(buildUrl('json'))
    const json = await res.json()
    setLoading(false)
    if (!res.ok) { setError(json.error ?? 'Failed to load journal'); return }
    setEntries(json.data ?? [])
    setSummary({ total: json.total_debit ?? 0, count: json.count ?? 0 })
  }

  const download = () => {
    window.location.href = buildUrl('csv')
    setDownloaded(true)
    setTimeout(() => setDownloaded(false), 3000)
  }

  // Group entries by date for display
  const grouped: { date: string; rows: JournalEntry[] }[] = []
  for (const e of entries) {
    const last = grouped[grouped.length - 1]
    if (last && last.date === e.date) last.rows.push(e)
    else grouped.push({ date: e.date, rows: [e] })
  }

  return (
    <div>
      <Topbar title="Accounting Export" />
      <div className="p-6 space-y-5 max-w-5xl">

        {/* Description */}
        <div className="flex items-start gap-3 bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3 text-sm text-indigo-800">
          <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold mb-0.5">General Journal — double-entry format</p>
            <p className="text-xs text-indigo-600">
              Every inventory movement and depreciation run is shown as a Dr/Cr entry.
              Download as CSV to import directly into QuickBooks, Xero, MYOB, Wave, or any
              accounting system that accepts a journal import.
            </p>
          </div>
        </div>

        {/* How accounting entries work — the guide */}
        <details className="bg-white border border-slate-200 rounded-xl overflow-hidden group">
          <summary className="flex items-center gap-2 px-4 py-3 cursor-pointer text-sm font-semibold text-slate-700 hover:bg-slate-50 select-none">
            <BookOpen className="w-4 h-4 text-slate-400" />
            How accounting entries work in Stocked
            <span className="ml-auto text-xs font-normal text-slate-400 group-open:hidden">Read before importing</span>
          </summary>
          <div className="px-4 pb-4 pt-1 space-y-4 text-xs text-slate-600">
            <div>
              <p className="font-semibold text-slate-700 mb-1.5">Scope &amp; assumptions</p>
              <ul className="space-y-1.5">
                {JOURNAL_SCOPE.map((s, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-slate-300 mt-0.5">•</span><span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="font-semibold text-slate-700 mb-1.5">How to import</p>
              <ol className="space-y-1.5 list-decimal list-inside marker:text-slate-400">
                {JOURNAL_IMPORT_STEPS.map((s, i) => <li key={i}>{s}</li>)}
              </ol>
            </div>
          </div>
        </details>

        {/* Filters */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
          <p className="text-sm font-semibold text-slate-700">Filter</p>

          {/* Date range */}
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">From</label>
              <input
                type="date"
                value={from}
                onChange={e => setFrom(e.target.value)}
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">To</label>
              <input
                type="date"
                value={to}
                onChange={e => setTo(e.target.value)}
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            {/* Quick ranges */}
            <div className="flex gap-1.5">
              {[
                { label: 'This month',  fn: () => { const n = new Date(); setFrom(new Date(n.getFullYear(), n.getMonth(), 1).toISOString().slice(0, 10)); setTo(n.toISOString().slice(0, 10)) } },
                { label: 'Last month',  fn: () => { const n = new Date(); const f = new Date(n.getFullYear(), n.getMonth() - 1, 1); const t = new Date(n.getFullYear(), n.getMonth(), 0); setFrom(f.toISOString().slice(0, 10)); setTo(t.toISOString().slice(0, 10)) } },
                { label: 'This year',   fn: () => { const n = new Date(); setFrom(`${n.getFullYear()}-01-01`); setTo(n.toISOString().slice(0, 10)) } },
              ].map(r => (
                <button key={r.label} onClick={r.fn} className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-600 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-600 transition-colors">
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {/* Transaction types */}
          <div>
            <p className="text-xs font-medium text-slate-500 mb-2">
              Transaction types
              <span className="ml-1 text-slate-400 font-normal">({selectedTypes.length === 0 ? 'all selected' : `${selectedTypes.length} selected`})</span>
            </p>
            <div className="flex flex-wrap gap-2">
              {TX_TYPES.map(t => {
                const active = selectedTypes.length === 0 || selectedTypes.includes(t.id)
                return (
                  <button
                    key={t.id}
                    onClick={() => toggleType(t.id)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                      selectedTypes.includes(t.id)
                        ? t.color + ' border-current'
                        : selectedTypes.length === 0
                        ? t.color + ' border-transparent'
                        : 'bg-white text-slate-400 border-slate-200'
                    }`}
                  >
                    {t.label}
                  </button>
                )
              })}
              {selectedTypes.length > 0 && (
                <button onClick={() => setSelectedTypes([])} className="px-2.5 py-1.5 rounded-full text-xs text-slate-400 hover:text-slate-600 border border-dashed border-slate-200">
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-1">
            <Button onClick={run} disabled={loading} className="gap-2">
              {loading
                ? <><Loader2 className="w-4 h-4 animate-spin" />Loading…</>
                : <><RefreshCw className="w-4 h-4" />Run Report</>
              }
            </Button>
            {entries.length > 0 && (
              <Button variant="outline" onClick={download} className="gap-2">
                {downloaded
                  ? <><CheckCircle2 className="w-4 h-4 text-green-500" />Downloaded!</>
                  : <><Download className="w-4 h-4" />Download CSV</>
                }
              </Button>
            )}
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
          </p>
        )}

        {/* Summary bar */}
        {summary && (
          <div className="flex items-center gap-6 bg-slate-50 border border-slate-200 rounded-xl px-5 py-3">
            <div>
              <p className="text-xs text-slate-400">Journal entries</p>
              <p className="text-lg font-bold text-slate-900">{summary.count}</p>
            </div>
            <div className="w-px h-8 bg-slate-200" />
            <div>
              <p className="text-xs text-slate-400">Total debits</p>
              <p className="text-lg font-bold text-slate-900">{formatCurrency(summary.total)}</p>
            </div>
            <div className="w-px h-8 bg-slate-200" />
            <div>
              <p className="text-xs text-slate-400">Total credits</p>
              <p className="text-lg font-bold text-slate-900">{formatCurrency(summary.total)}</p>
            </div>
            <div className="ml-auto flex items-center gap-1.5 text-xs text-green-600 font-medium">
              <CheckCircle2 className="w-4 h-4" /> Balanced
            </div>
          </div>
        )}

        {/* Journal table */}
        {grouped.length > 0 && (
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="text-left px-4 py-2.5 font-semibold text-slate-500 w-24">Date</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-slate-500 w-24">Ref</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-slate-500 w-28">Type</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-slate-500">Description</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-slate-500 hidden lg:table-cell">Debit Account</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-slate-500 hidden lg:table-cell">Credit Account</th>
                  <th className="text-right px-4 py-2.5 font-semibold text-slate-500">Amount</th>
                </tr>
              </thead>
              <tbody>
                {grouped.map(({ date, rows }) => (
                  rows.map((e, i) => (
                    <tr key={`${date}-${i}`} className="border-b border-slate-50 hover:bg-slate-50/60 transition-colors">
                      <td className="px-4 py-2.5 text-slate-500 font-mono whitespace-nowrap">
                        {i === 0 ? date : ''}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-slate-400">{e.reference}</td>
                      <td className="px-3 py-2.5">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${typeBadgeColor(e.type)}`}>
                          {e.type}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-slate-700 max-w-xs">
                        <p className="truncate">{e.description}</p>
                        {e.notes && <p className="text-slate-400 truncate">{e.notes}</p>}
                      </td>
                      <td className="px-3 py-2.5 text-slate-600 hidden lg:table-cell">
                        <span className="bg-green-50 text-green-700 px-1.5 py-0.5 rounded text-[10px] font-medium">Dr</span>
                        {' '}{e.debit_account}
                      </td>
                      <td className="px-3 py-2.5 text-slate-600 hidden lg:table-cell">
                        <span className="bg-red-50 text-red-600 px-1.5 py-0.5 rounded text-[10px] font-medium">Cr</span>
                        {' '}{e.credit_account}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono font-semibold text-slate-900">
                        {formatCurrency(e.amount)}
                      </td>
                    </tr>
                  ))
                ))}
              </tbody>
              <tfoot className="bg-slate-50 border-t border-slate-200">
                <tr>
                  <td colSpan={6} className="px-4 py-2.5 text-xs font-semibold text-slate-500">Total</td>
                  <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-900">
                    {formatCurrency(summary?.total ?? 0)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {summary?.count === 0 && (
          <div className="text-center py-12 text-slate-400 border border-dashed rounded-xl">
            <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No transactions found for this period</p>
          </div>
        )}

        {/* Account mapping reference — generated from the same code the feed uses */}
        <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 text-xs text-slate-500 space-y-3">
          <p className="font-semibold text-slate-700">Account mapping reference</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-6">
            {postingReference().map((r, i) => (
              <div key={i} className="space-y-0.5">
                <p className="font-medium text-slate-600">{r.event}</p>
                <p className="text-slate-400">{r.trigger}</p>
                <p><span className="text-green-600 font-semibold">Dr</span> {r.debit}{'  '}<span className="text-red-500 font-semibold">Cr</span> {r.credit}</p>
              </div>
            ))}
          </div>
          <p className="pt-1 text-slate-400">
            Map these account names to your chart of accounts when importing. The CSV column headers match QuickBooks and Xero journal import templates.
          </p>
        </div>

      </div>
    </div>
  )
}
