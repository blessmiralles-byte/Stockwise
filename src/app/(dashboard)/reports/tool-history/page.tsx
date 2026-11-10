'use client'

import { useState, useMemo } from 'react'
import { Topbar } from '@/components/layout/topbar'
import { ExportButtons } from '@/components/reports/export-buttons'
import { Card, CardContent } from '@/components/ui/card'
import { useApi } from '@/lib/use-api'
import { formatDate } from '@/lib/utils'
import { Search, History, AlertTriangle } from 'lucide-react'

interface Checkout {
  id:               string
  status:           'pending' | 'out' | 'returned' | 'rejected'
  holder_name?:     string
  job_code?:        string | null
  job_reference?:   string | null
  due_at?:          string | null
  checked_out_at?:  string
  returned_at?:     string | null
  return_condition?: 'good' | 'damaged' | null
  return_note?:     string | null
  asset?:           { id: string; asset_tag?: string; name?: string } | null
  holder?:          { id: string; name?: string; employee_no?: string } | null
  requester?:       { id: string; full_name?: string } | null
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10)

/** How the checkout ended, in a word — the column people scan. */
function outcome(c: Checkout): { label: string; tone: string } {
  if (c.status === 'out')      return { label: 'Still out',         tone: 'text-indigo-700' }
  if (c.status === 'pending')  return { label: 'Awaiting approval', tone: 'text-amber-700' }
  if (c.status === 'rejected') return { label: 'Not approved',      tone: 'text-slate-400' }
  if (c.return_condition === 'damaged') return { label: 'Returned damaged', tone: 'text-red-700' }
  const late = c.due_at && c.returned_at && new Date(c.returned_at).getTime() > new Date(c.due_at).getTime()
  return late ? { label: 'Returned late', tone: 'text-amber-700' } : { label: 'Returned', tone: 'text-slate-600' }
}

export default function ToolHistoryReport() {
  // Default to the last 90 days: long enough to answer "who had it last",
  // short enough to stay quick as the log grows.
  const [from, setFrom] = useState(() => isoDay(new Date(Date.now() - 90 * 86_400_000)))
  const [to, setTo]     = useState(() => isoDay(new Date()))
  const [q, setQ]       = useState('')

  const { data, loading } = useApi<{ data: Checkout[]; truncated?: boolean }>(
    `/api/assets/checkouts?status=all&from=${from}&to=${to}`,
  )
  const all = data?.data ?? []

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return all
    return all.filter(c =>
      (c.asset?.name ?? '').toLowerCase().includes(s) ||
      (c.asset?.asset_tag ?? '').toLowerCase().includes(s) ||
      (c.holder_name ?? '').toLowerCase().includes(s) ||
      (c.holder?.employee_no ?? '').toLowerCase().includes(s) ||
      (c.requester?.full_name ?? '').toLowerCase().includes(s) ||
      (c.job_code ?? '').toLowerCase().includes(s) ||
      (c.job_reference ?? '').toLowerCase().includes(s)
    )
  }, [all, q])

  const damaged = rows.filter(c => c.return_condition === 'damaged').length

  const buildSheets = () => {
    const header = ['Tool', 'Asset Tag', 'Held By', 'Employee No', 'Issued By', 'Job', 'Out', 'Due', 'Returned', 'Outcome', 'Note']
    const body = rows.map(c => [
      c.asset?.name ?? '',
      c.asset?.asset_tag ?? '',
      c.holder_name ?? '',
      c.holder?.employee_no ?? '',
      c.requester?.full_name ?? '',
      c.job_code || c.job_reference || '',
      c.checked_out_at ? formatDate(c.checked_out_at) : '',
      c.due_at ? formatDate(c.due_at) : '',
      c.returned_at ? formatDate(c.returned_at) : '',
      outcome(c).label,
      c.return_note ?? '',
    ])
    return [{
      name: 'Tool history',
      rows: [header, ...body],
      notes: [`Tool custody history — ${from} to ${to}${q.trim() ? ` — matching "${q.trim()}"` : ''} — ${rows.length} check-outs`],
    }]
  }

  return (
    <div>
      <Topbar title="Tool History" />
      <div className="p-6 space-y-4 max-w-5xl">
        <div className="flex flex-wrap items-end gap-3">
          <div className="relative flex-1 min-w-56 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search a tool, tag, person, or job…"
              className="w-full pl-9 pr-3 h-10 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <label className="text-xs text-slate-500">
            From
            <input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)}
              className="block mt-1 h-10 px-3 rounded-lg border border-slate-200 text-sm text-slate-700" />
          </label>
          <label className="text-xs text-slate-500">
            To
            <input type="date" value={to} min={from} onChange={e => setTo(e.target.value)}
              className="block mt-1 h-10 px-3 rounded-lg border border-slate-200 text-sm text-slate-700" />
          </label>
          <div className="flex-1" />
          <ExportButtons filename="Tool history" build={buildSheets} disabled={rows.length === 0} />
        </div>

        <div className="flex flex-wrap gap-2 text-sm">
          <span className="inline-flex items-center gap-2 font-medium text-slate-700 bg-slate-100 rounded-lg px-3 py-1.5">
            <History className="w-4 h-4 text-slate-500" /> {rows.length} check-out{rows.length !== 1 ? 's' : ''}
          </span>
          {damaged > 0 && (
            <span className="inline-flex items-center gap-2 font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
              <AlertTriangle className="w-4 h-4" /> {damaged} returned damaged
            </span>
          )}
        </div>

        {data?.truncated && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Showing the most recent 1,000 check-outs in this period. Narrow the dates to see the rest.
          </p>
        )}

        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-4 space-y-2">{[1, 2, 3, 4].map(i => <div key={i} className="h-12 bg-slate-100 rounded-lg animate-pulse" />)}</div>
            ) : rows.length === 0 ? (
              <div className="text-center py-14 text-slate-400">
                <History className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p>{all.length === 0 ? 'No tools were checked out in this period.' : 'Nothing matches your search.'}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-slate-500">
                      <th className="px-4 py-3 font-medium">Tool</th>
                      <th className="px-4 py-3 font-medium">Held by</th>
                      <th className="px-4 py-3 font-medium hidden md:table-cell">Job</th>
                      <th className="px-4 py-3 font-medium">Out</th>
                      <th className="px-4 py-3 font-medium hidden sm:table-cell">Returned</th>
                      <th className="px-4 py-3 font-medium">Outcome</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(c => {
                      const o = outcome(c)
                      const by = (c.requester?.full_name ?? '').trim()
                      const issuedByOther = by && by.toLowerCase() !== (c.holder_name ?? '').trim().toLowerCase()
                      return (
                        <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50/50 align-top">
                          <td className="px-4 py-3">
                            <p className="font-medium text-slate-900">{c.asset?.name ?? 'Unknown tool'}</p>
                            {c.asset?.asset_tag && <p className="text-xs text-slate-400 font-mono">{c.asset.asset_tag}</p>}
                          </td>
                          <td className="px-4 py-3 text-slate-700">
                            {c.holder_name || <span className="text-slate-400">—</span>}
                            {c.holder?.employee_no && <span className="ml-2 text-xs font-mono text-indigo-600">{c.holder.employee_no}</span>}
                            {issuedByOther && <p className="text-xs text-slate-400">issued by {by}</p>}
                          </td>
                          <td className="px-4 py-3 hidden md:table-cell text-slate-600">{c.job_code || c.job_reference || <span className="text-slate-300">—</span>}</td>
                          <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{c.checked_out_at ? formatDate(c.checked_out_at) : '—'}</td>
                          <td className="px-4 py-3 hidden sm:table-cell text-slate-500 whitespace-nowrap">{c.returned_at ? formatDate(c.returned_at) : '—'}</td>
                          <td className="px-4 py-3">
                            <span className={`font-medium ${o.tone}`}>{o.label}</span>
                            {c.return_note && <p className="text-xs text-slate-500 mt-0.5">{c.return_note}</p>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
