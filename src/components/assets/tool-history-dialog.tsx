'use client'

import { Button } from '@/components/ui/button'
import { useApi } from '@/lib/use-api'
import { formatDate } from '@/lib/utils'
import { X, History, AlertTriangle } from 'lucide-react'

interface Entry {
  id: string
  status: 'pending' | 'out' | 'returned' | 'rejected'
  holder_name?: string
  job_code?: string | null
  job_reference?: string | null
  due_at?: string | null
  reject_reason?: string | null
  checked_out_at?: string
  returned_at?: string | null
  return_condition?: 'good' | 'damaged' | null
  return_note?: string | null
  checked_out_by?: { full_name?: string } | null
  returned_by?: { full_name?: string } | null
  returned_location?: { name?: string } | null
}

const STATUS: Record<Entry['status'], { label: string; tone: string }> = {
  out:      { label: 'Out now',          tone: 'bg-indigo-50 text-indigo-700' },
  pending:  { label: 'Awaiting approval', tone: 'bg-amber-50 text-amber-700' },
  returned: { label: 'Returned',         tone: 'bg-slate-100 text-slate-600' },
  rejected: { label: 'Not approved',     tone: 'bg-slate-100 text-slate-500' },
}

/**
 * Who has had this tool — the question an owner asks when one goes missing or
 * comes back broken. Newest first.
 */
export function ToolHistoryDialog({ asset, onClose }: { asset: { id: string; name: string; asset_tag?: string }; onClose: () => void }) {
  const { data, loading, error } = useApi<{ data: Entry[] }>(`/api/assets/${asset.id}/checkouts`)
  const entries = data?.data ?? []

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <History className="w-4 h-4 text-indigo-600 flex-shrink-0" />
              <span className="truncate">Who&apos;s had it — {asset.name}</span>
            </h2>
            {asset.asset_tag && <p className="text-xs text-slate-400 font-mono mt-0.5">{asset.asset_tag}</p>}
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="w-4 h-4" /></Button>
        </div>

        <div className="p-5 overflow-y-auto">
          {loading ? (
            <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-14 bg-slate-100 rounded-lg animate-pulse" />)}</div>
          ) : error ? (
            <p className="text-sm text-red-600">Could not load the history.</p>
          ) : entries.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-8">This tool has never been checked out.</p>
          ) : (
            <ol className="space-y-3">
              {entries.map(e => {
                const s = STATUS[e.status] ?? STATUS.returned
                const job = e.job_code || e.job_reference
                const by  = e.checked_out_by?.full_name
                const issuedByOther = by && by.trim().toLowerCase() !== (e.holder_name ?? '').trim().toLowerCase()
                const late = e.status === 'returned' && e.due_at && e.returned_at
                  && new Date(e.returned_at).getTime() > new Date(e.due_at).getTime()
                return (
                  <li key={e.id} className="rounded-lg border border-slate-100 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900 text-sm">{e.holder_name || '—'}</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {e.checked_out_at ? formatDate(e.checked_out_at) : '—'}
                          {' → '}
                          {e.returned_at ? formatDate(e.returned_at) : e.status === 'out' ? 'still out' : '—'}
                          {job ? ` · ${job}` : ''}
                        </p>
                      </div>
                      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${s.tone}`}>{s.label}</span>
                    </div>

                    <div className="mt-1.5 space-y-0.5 text-xs text-slate-500">
                      {issuedByOther && <p>Issued by {by}</p>}
                      {e.status === 'out' && e.due_at && <p>Due back {formatDate(e.due_at)}</p>}
                      {e.returned_location?.name && <p>Returned to {e.returned_location.name}{e.returned_by?.full_name ? ` by ${e.returned_by.full_name}` : ''}</p>}
                      {late && <p className="text-amber-700">Came back late — was due {formatDate(e.due_at!)}</p>}
                      {e.status === 'rejected' && e.reject_reason && <p>Reason: {e.reject_reason}</p>}
                      {e.return_condition === 'damaged' && (
                        <p className="text-red-700 flex items-start gap-1">
                          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-px" />
                          Came back damaged{e.return_note ? ` — ${e.return_note}` : ''}
                        </p>
                      )}
                    </div>
                  </li>
                )
              })}
            </ol>
          )}
        </div>
      </div>
    </div>
  )
}
