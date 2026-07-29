'use client'

import { useState, useMemo } from 'react'
import { Topbar } from '@/components/layout/topbar'
import { Card, CardContent } from '@/components/ui/card'
import { useApi } from '@/lib/use-api'
import { formatDate } from '@/lib/utils'
import { Search, User, Wrench, AlertTriangle, Download } from 'lucide-react'

interface Checkout {
  id:              string
  holder_name?:    string
  job_code?:       string
  job_reference?:  string
  due_at?:         string | null
  checked_out_at?: string
  asset?:          { id: string; asset_tag?: string; name?: string }
  holder?:         { id: string; name?: string; employee_no?: string } | null
}

const isOverdue = (c: Checkout) => !!c.due_at && new Date(c.due_at).getTime() < Date.now()

export default function ToolsByCrewReport() {
  const { data, loading } = useApi<{ data: Checkout[] }>('/api/assets/checkouts?status=out')
  const [name, setName] = useState('')
  const all = data?.data ?? []

  // Roster of crew who currently hold tools, with a count + employee no each.
  const crew = useMemo(() => {
    const m = new Map<string, { count: number; employee_no?: string }>()
    for (const c of all) {
      const h = (c.holder_name ?? '').trim()
      if (!h) continue
      const cur = m.get(h) ?? { count: 0 }
      cur.count++
      if (!cur.employee_no && c.holder?.employee_no) cur.employee_no = c.holder.employee_no
      m.set(h, cur)
    }
    return [...m.entries()]
      .map(([n, v]) => ({ name: n, count: v.count, employee_no: v.employee_no }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [all])

  const s = name.trim().toLowerCase()
  const matched = useMemo(
    () => (s
      ? all.filter(c =>
          (c.holder_name ?? '').toLowerCase().includes(s) ||
          (c.holder?.employee_no ?? '').toLowerCase().includes(s))
      : []),
    [all, s],
  )
  const overdueCount = matched.filter(isOverdue).length

  const exportCsv = () => {
    const header = ['Assigned To', 'Employee No', 'Tool', 'Asset Tag', 'Job', 'Checked Out', 'Due', 'Status']
    const body = matched.map(c => [
      c.holder_name ?? '',
      c.holder?.employee_no ?? '',
      c.asset?.name ?? '',
      c.asset?.asset_tag ?? '',
      c.job_code || c.job_reference || '',
      c.checked_out_at ? formatDate(c.checked_out_at) : '',
      c.due_at ? formatDate(c.due_at) : '',
      isOverdue(c) ? 'OVERDUE' : 'Out',
    ])
    const csv = [header, ...body]
      .map(r => r.map(f => `"${String(f).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `tools-for-${name.trim().replace(/\s+/g, '-').toLowerCase() || 'crew'}-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <Topbar title="Tools by Crew Member" />
      <div className="p-6 space-y-4 max-w-3xl">
        <p className="text-sm text-slate-500">
          Type a crew member&apos;s name to see every tool currently assigned to them.
        </p>

        {/* Name input */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Crew member's name or employee no…"
            className="w-full pl-9 pr-3 h-11 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {/* Roster chips (when nothing typed yet) */}
        {!s && (
          loading ? (
            <div className="flex gap-2 flex-wrap">{[1, 2, 3].map(i => <div key={i} className="h-8 w-28 bg-slate-100 rounded-full animate-pulse" />)}</div>
          ) : crew.length === 0 ? (
            <div className="text-center py-14 text-slate-400">
              <Wrench className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>No tools are checked out to anyone right now.</p>
            </div>
          ) : (
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Crew currently holding tools</p>
              <div className="flex gap-2 flex-wrap">
                {crew.map(c => (
                  <button
                    key={c.name}
                    onClick={() => setName(c.name)}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-slate-200 bg-white text-sm text-slate-700 hover:border-indigo-300 hover:bg-indigo-50 transition-colors"
                  >
                    <User className="w-3.5 h-3.5 text-slate-400" />
                    {c.name}
                    {c.employee_no && <span className="text-xs font-mono text-slate-400">{c.employee_no}</span>}
                    <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 rounded-full px-1.5">{c.count}</span>
                  </button>
                ))}
              </div>
            </div>
          )
        )}

        {/* Results for the typed name */}
        {s && (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <div className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg px-3 py-1.5">
                <User className="w-4 h-4 text-slate-500" />
                {matched.length} tool{matched.length !== 1 ? 's' : ''} assigned to &ldquo;{name.trim()}&rdquo;
                {matched.find(c => c.holder?.employee_no)?.holder?.employee_no && (
                  <span className="text-xs font-mono text-indigo-600">
                    {matched.find(c => c.holder?.employee_no)!.holder!.employee_no}
                  </span>
                )}
              </div>
              {overdueCount > 0 && (
                <div className="inline-flex items-center gap-2 text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
                  <AlertTriangle className="w-4 h-4" /> {overdueCount} overdue
                </div>
              )}
              <div className="flex-1" />
              {matched.length > 0 && (
                <button
                  onClick={exportCsv}
                  className="inline-flex items-center gap-2 text-sm font-medium px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                >
                  <Download className="w-4 h-4" /> Export CSV
                </button>
              )}
            </div>

            <Card>
              <CardContent className="p-0">
                {matched.length === 0 ? (
                  <div className="text-center py-14 text-slate-400">
                    <Wrench className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p>No tools checked out to anyone matching &ldquo;{name.trim()}&rdquo;.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-50">
                    {matched.map(c => {
                      const overdue = isOverdue(c)
                      return (
                        <div key={c.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50/50">
                          <div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center flex-shrink-0">
                            <Wrench className="w-4 h-4 text-indigo-500" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-slate-900 truncate">{c.asset?.name ?? 'Unknown tool'}</p>
                            <p className="text-xs text-slate-400">
                              {c.asset?.asset_tag && <span className="font-mono">{c.asset.asset_tag}</span>}
                              {(c.job_code || c.job_reference) && <span> · {c.job_code || c.job_reference}</span>}
                              {c.checked_out_at && <span> · out {formatDate(c.checked_out_at)}</span>}
                            </p>
                          </div>
                          {c.due_at && (
                            <span className={overdue
                              ? 'inline-flex items-center gap-1 text-xs font-medium text-red-600 flex-shrink-0'
                              : 'text-xs text-slate-500 flex-shrink-0'}>
                              {overdue && <AlertTriangle className="w-3.5 h-3.5" />}
                              due {formatDate(c.due_at)}
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  )
}
