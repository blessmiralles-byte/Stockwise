'use client'

import { useState, useMemo } from 'react'
import { Topbar } from '@/components/layout/topbar'
import { Card, CardContent } from '@/components/ui/card'
import { useApi } from '@/lib/use-api'
import { formatDate } from '@/lib/utils'
import { Search, Download, Wrench, AlertTriangle, PackageCheck } from 'lucide-react'

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

export default function ToolsOutReport() {
  const { data, loading } = useApi<{ data: Checkout[] }>('/api/assets/checkouts?status=out')
  const [q, setQ] = useState('')
  const all = data?.data ?? []

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return all
    return all.filter(c =>
      (c.asset?.name ?? '').toLowerCase().includes(s) ||
      (c.asset?.asset_tag ?? '').toLowerCase().includes(s) ||
      (c.holder_name ?? '').toLowerCase().includes(s) ||
      (c.holder?.employee_no ?? '').toLowerCase().includes(s) ||
      (c.job_code ?? '').toLowerCase().includes(s) ||
      (c.job_reference ?? '').toLowerCase().includes(s)
    )
  }, [all, q])

  const overdueCount = all.filter(isOverdue).length

  const exportCsv = () => {
    const header = ['Tool', 'Asset Tag', 'Assigned To', 'Employee No', 'Job', 'Checked Out', 'Due', 'Status']
    const body = rows.map(c => [
      c.asset?.name ?? '',
      c.asset?.asset_tag ?? '',
      c.holder_name ?? '',
      c.holder?.employee_no ?? '',
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
    a.download = `tools-checked-out-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <Topbar title="Tools Checked Out" />
      <div className="p-6 space-y-4 max-w-4xl">
        {/* Summary + actions */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg px-3 py-1.5">
            <PackageCheck className="w-4 h-4 text-slate-500" /> {all.length} tool{all.length !== 1 ? 's' : ''} out
          </div>
          {overdueCount > 0 && (
            <div className="inline-flex items-center gap-2 text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
              <AlertTriangle className="w-4 h-4" /> {overdueCount} overdue
            </div>
          )}
          <div className="flex-1" />
          <button
            onClick={exportCsv}
            disabled={rows.length === 0}
            className="inline-flex items-center gap-2 text-sm font-medium px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            <Download className="w-4 h-4" /> Export CSV
          </button>
        </div>

        {/* Search */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search tool, tag, crew member, or job…"
            className="w-full pl-9 pr-3 h-10 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-4 space-y-2">{[1, 2, 3, 4].map(i => <div key={i} className="h-12 bg-slate-100 rounded-lg animate-pulse" />)}</div>
            ) : rows.length === 0 ? (
              <div className="text-center py-14 text-slate-400">
                <Wrench className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p>{all.length === 0 ? 'No tools are checked out right now.' : 'No tools match your search.'}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-slate-500">
                      <th className="px-4 py-3 font-medium">Tool</th>
                      <th className="px-4 py-3 font-medium">Assigned To</th>
                      <th className="px-4 py-3 font-medium hidden md:table-cell">Job</th>
                      <th className="px-4 py-3 font-medium hidden sm:table-cell">Checked Out</th>
                      <th className="px-4 py-3 font-medium">Due</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(c => {
                      const overdue = isOverdue(c)
                      return (
                        <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                          <td className="px-4 py-3">
                            <p className="font-medium text-slate-900">{c.asset?.name ?? 'Unknown tool'}</p>
                            {c.asset?.asset_tag && <p className="text-xs text-slate-400 font-mono">{c.asset.asset_tag}</p>}
                          </td>
                          <td className="px-4 py-3 text-slate-700">
                            {c.holder_name || <span className="text-slate-400">—</span>}
                            {c.holder?.employee_no && (
                              <span className="ml-2 text-xs font-mono text-indigo-600">{c.holder.employee_no}</span>
                            )}
                          </td>
                          <td className="px-4 py-3 hidden md:table-cell text-slate-600">{c.job_code || c.job_reference || <span className="text-slate-300">—</span>}</td>
                          <td className="px-4 py-3 hidden sm:table-cell text-slate-500">{c.checked_out_at ? formatDate(c.checked_out_at) : '—'}</td>
                          <td className="px-4 py-3">
                            {c.due_at ? (
                              <span className={overdue ? 'inline-flex items-center gap-1 text-red-600 font-medium' : 'text-slate-600'}>
                                {overdue && <AlertTriangle className="w-3.5 h-3.5" />}
                                {formatDate(c.due_at)}
                              </span>
                            ) : <span className="text-slate-300">—</span>}
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
