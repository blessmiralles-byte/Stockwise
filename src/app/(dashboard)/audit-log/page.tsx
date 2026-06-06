'use client'

import { useState, useCallback } from 'react'
import { Topbar } from '@/components/layout/topbar'
import {
  Loader2, AlertCircle, ChevronLeft, ChevronRight,
  Shield, Search, Download,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Helpers ───────────────────────────────────────────────────────────────────
function relTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

const ACTION_COLOR: Record<string, string> = {
  'user.role_change':        'bg-purple-50 text-purple-700',
  'user.deactivate':         'bg-red-50 text-red-700',
  'user.reactivate':         'bg-green-50 text-green-700',
  'requisition.approve':     'bg-green-50 text-green-700',
  'requisition.reject':      'bg-red-50 text-red-700',
  'stock_count.approve':     'bg-teal-50 text-teal-700',
  'stock_count.create':      'bg-teal-50 text-teal-700',
  'purchase_order.cancel':   'bg-amber-50 text-amber-700',
  'asset.dispose':           'bg-orange-50 text-orange-700',
  'asset.value_change':      'bg-indigo-50 text-indigo-700',
  'asset.depreciation_run':  'bg-slate-100 text-slate-700',
  'period.close':            'bg-rose-50 text-rose-700',
  'cost_center.create':      'bg-blue-50 text-blue-700',
  'cost_center.update':      'bg-blue-50 text-blue-700',
}

// ── DiffViewer ────────────────────────────────────────────────────────────────
function DiffViewer({ old_value, new_value }: { old_value: any; new_value: any }) {
  if (!old_value && !new_value) return null

  const formatJson = (v: any) => {
    if (!v) return '—'
    try { return JSON.stringify(v, null, 2) }
    catch { return String(v) }
  }

  return (
    <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] font-mono">
      {old_value && (
        <div className="bg-red-50 border border-red-100 rounded-lg p-2 overflow-auto max-h-32">
          <p className="text-red-400 font-sans font-semibold mb-1 text-[10px] uppercase tracking-wide">Before</p>
          <pre className="text-red-800 whitespace-pre-wrap break-all">{formatJson(old_value)}</pre>
        </div>
      )}
      {new_value && (
        <div className={cn('bg-green-50 border border-green-100 rounded-lg p-2 overflow-auto max-h-32', !old_value && 'col-span-2')}>
          <p className="text-green-400 font-sans font-semibold mb-1 text-[10px] uppercase tracking-wide">After</p>
          <pre className="text-green-800 whitespace-pre-wrap break-all">{formatJson(new_value)}</pre>
        </div>
      )}
    </div>
  )
}

// ── Row ───────────────────────────────────────────────────────────────────────
function AuditRow({ entry }: { entry: any }) {
  const [expanded, setExpanded] = useState(false)
  const colorClass = ACTION_COLOR[entry.action] ?? 'bg-slate-100 text-slate-700'

  return (
    <div className="border-b border-slate-50 last:border-0">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full text-left px-5 py-3 hover:bg-slate-50/70 transition-colors">
        <div className="flex items-start gap-3">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold flex-shrink-0 mt-0.5 ${colorClass}`}>
            {entry.action}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-medium text-slate-800">
                {(entry.actor as any)?.full_name ?? 'System'}
              </span>
              {entry.table_name && (
                <span className="text-[11px] text-slate-400 font-mono">
                  {entry.table_name}{entry.record_id ? ` #${entry.record_id.slice(0, 8)}…` : ''}
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">{relTime(entry.created_at)}</p>
          </div>
          <span className="text-[11px] text-slate-400 flex-shrink-0">
            {(expanded ? '▲' : '▼')}
          </span>
        </div>
      </button>

      {expanded && (
        <div className="px-5 pb-4">
          <DiffViewer old_value={entry.old_value} new_value={entry.new_value} />
        </div>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
interface Meta { page: number; limit: number; total: number; pages: number }

export default function AuditLogPage() {
  const today    = new Date().toISOString().slice(0, 10)
  const firstDom = today.slice(0, 8) + '01'

  const [from, setFrom]       = useState(firstDom)
  const [to,   setTo]         = useState(today)
  const [action, setAction]   = useState('')
  const [page, setPage]       = useState(1)
  const [data, setData]       = useState<any[]>([])
  const [meta, setMeta]       = useState<Meta | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [queried, setQueried] = useState(false)

  const run = useCallback(async (p = 1) => {
    setLoading(true); setError(''); setPage(p)
    try {
      const params = new URLSearchParams({
        page: String(p), limit: '50',
        from, to,
        ...(action ? { action } : {}),
      })
      const res  = await fetch(`/api/audit-log?${params}`)
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Failed'); return }
      setData(json.data ?? [])
      setMeta(json.meta)
      setQueried(true)
    } catch {
      setError('Network error — please try again.')
    } finally {
      setLoading(false)
    }
  }, [from, to, action])

  const downloadCsv = () => {
    if (!data.length) return
    const rows = [
      ['Timestamp', 'Actor', 'Role', 'Action', 'Table', 'Record ID'],
      ...data.map((e: any) => [
        e.created_at,
        e.actor?.full_name ?? 'System',
        e.actor?.role ?? '',
        e.action,
        e.table_name ?? '',
        e.record_id ?? '',
      ])
    ]
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a   = document.createElement('a'); a.href = url
    a.download = `audit-log-${from}-to-${to}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  return (
    <div>
      <Topbar title="Audit Log" />
      <div className="p-6 max-w-5xl mx-auto space-y-5">

        {/* Info */}
        <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-100 rounded-xl">
          <Shield className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-blue-800 leading-relaxed">
            Tamper-evident record of all privileged operations — role changes, approvals,
            rejections, period closures, disposals, and depreciation runs. Visible to owners
            and finance roles only.
          </p>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
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
              <label className="text-xs font-medium text-slate-600 block mb-1.5">Action filter</label>
              <input
                value={action}
                onChange={e => setAction(e.target.value)}
                placeholder="e.g. requisition"
                className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-40" />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => run(1)}
                disabled={loading}
                className="flex items-center gap-2 px-5 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                Search
              </button>
              {data.length > 0 && (
                <button onClick={downloadCsv}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
                  <Download className="w-4 h-4" />
                  CSV
                </button>
              )}
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
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
          </div>
        )}

        {queried && !loading && (
          <>
            {meta && (
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-500">
                  {meta.total.toLocaleString()} entr{meta.total !== 1 ? 'ies' : 'y'} found
                </p>
                {meta.pages > 1 && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => run(page - 1)}
                      disabled={page <= 1}
                      className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 transition-colors">
                      <ChevronLeft className="w-4 h-4 text-slate-600" />
                    </button>
                    <span className="text-xs text-slate-600 tabular-nums">
                      Page {page} of {meta.pages}
                    </span>
                    <button
                      onClick={() => run(page + 1)}
                      disabled={page >= meta.pages}
                      className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 transition-colors">
                      <ChevronRight className="w-4 h-4 text-slate-600" />
                    </button>
                  </div>
                )}
              </div>
            )}

            {data.length === 0 ? (
              <div className="text-center py-16 text-slate-400 border border-dashed border-slate-200 rounded-xl">
                <Shield className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm font-medium">No audit entries in this period</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                {data.map((entry: any) => (
                  <AuditRow key={entry.id} entry={entry} />
                ))}
              </div>
            )}
          </>
        )}

        {!queried && !loading && (
          <div className="text-center py-16 text-slate-400 border border-dashed border-slate-200 rounded-xl">
            <Shield className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm font-medium">Set a date range and click Search</p>
          </div>
        )}
      </div>
    </div>
  )
}
