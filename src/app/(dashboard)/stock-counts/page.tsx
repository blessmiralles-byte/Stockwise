'use client'

import { useState } from 'react'
import { Topbar } from '@/components/layout/topbar'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TableSkeleton } from '@/components/ui/skeleton'
import { useApi } from '@/lib/use-api'
import { formatDate } from '@/lib/utils'
import { StockCount, Location } from '@/types'
import { Plus, ClipboardList, X, ChevronRight, Search, MapPin } from 'lucide-react'
import Link from 'next/link'

const STATUS_CFG: Record<string, { label: string; variant: any }> = {
  open:       { label: 'Open',       variant: 'secondary'   },
  counting:   { label: 'Counting',   variant: 'warning'     },
  reviewing:  { label: 'Reviewing',  variant: 'warning'     },
  approved:   { label: 'Approved',   variant: 'success'     },
  cancelled:  { label: 'Cancelled',  variant: 'destructive' },
}

// Location type icons for the select menu
const LOC_TYPE_ICONS: Record<string, string> = {
  warehouse: '🏭', office: '🏢', store: '🏪', room: '📦', shelf: '📋', other: '📍',
}

// Build a flat list with depth info for display in the <select>
interface FlatLoc { id: string; name: string; level: number; type: string; parent_id: string | null }
function buildFlatTree(locs: FlatLoc[]): FlatLoc[] {
  const byParent: Record<string, FlatLoc[]> = {}
  for (const l of locs) {
    const key = l.parent_id ?? '__root__'
    if (!byParent[key]) byParent[key] = []
    byParent[key].push(l)
  }
  const result: FlatLoc[] = []
  function walk(parentId: string | null) {
    const key = parentId ?? '__root__'
    for (const loc of (byParent[key] ?? []).sort((a, b) => a.name.localeCompare(b.name))) {
      result.push(loc)
      walk(loc.id)
    }
  }
  walk(null)
  return result
}

function NewCountDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  // Use ?all=true to get every level of the hierarchy
  const { data: locData } = useApi<{ data: FlatLoc[] }>('/api/locations?all=true')
  const [location_id, setLocation] = useState('')
  const [notes, setNotes]          = useState('')
  const [saving, setSaving]        = useState(false)
  const [error, setError]          = useState('')

  const flatLocs = buildFlatTree(locData?.data ?? [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/stock-counts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location_id: location_id || null, notes }),
      })
      if (!res.ok) { const j = await res.json(); setError(j.error ?? 'Failed'); return }
      onSaved()
    } finally { setSaving(false) }
  }

  const selectedLoc = flatLocs.find(l => l.id === location_id)

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">New Stock Count</h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="w-4 h-4" /></Button>
        </div>
        <p className="text-xs text-slate-500">
          A snapshot of current inventory will be taken automatically. Scope to a specific warehouse, room, or shelf — or leave blank to count everything.
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Scope (optional)
            </label>
            <select
              className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
              value={location_id}
              onChange={e => setLocation(e.target.value)}
            >
              <option value="">— All locations —</option>
              {flatLocs.map(l => (
                <option key={l.id} value={l.id}>
                  {' '.repeat(l.level * 4)}{LOC_TYPE_ICONS[l.type] ?? '📍'} {l.name}
                </option>
              ))}
            </select>
            {selectedLoc && (
              <p className="mt-1.5 text-xs text-slate-400 flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                Counting only items stored in{' '}
                <strong className="text-slate-600">{selectedLoc.name}</strong>
                {selectedLoc.level > 0 && ' and sub-locations'}
              </p>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes…" />
          </div>
          {error && <p className="text-red-500 text-xs">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Creating…' : 'Create & Snapshot'}</Button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function StockCountsPage() {
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch]             = useState('')
  const [showNew, setShowNew]           = useState(false)

  const url = statusFilter === 'all' ? '/api/stock-counts' : `/api/stock-counts?status=${statusFilter}`
  const { data, loading, error, refetch } = useApi<{ data: StockCount[] }>(url)
  const counts = data?.data ?? []

  const filtered = counts.filter(c =>
    !search ||
    c.count_number.toLowerCase().includes(search.toLowerCase()) ||
    (c.location?.name ?? '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div>
      <Topbar title="Stock Counts" />
      <div className="p-6 space-y-4">

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-1 flex-wrap">
            <div className="relative max-w-xs flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input placeholder="Search counts…" className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div className="flex flex-wrap gap-1">
              {['all', 'open', 'counting', 'reviewing', 'approved', 'cancelled'].map(s => (
                <Button key={s} size="sm" variant={statusFilter === s ? 'default' : 'outline'} onClick={() => setStatusFilter(s)} className="text-xs capitalize">
                  {s === 'all' ? 'All' : STATUS_CFG[s]?.label ?? s}
                </Button>
              ))}
            </div>
          </div>
          <Button onClick={() => setShowNew(true)} className="gap-2">
            <Plus className="w-4 h-4" /> New Count
          </Button>
        </div>

        {error && <p className="text-red-500 text-sm">{error}</p>}

        <Card>
          <CardContent className="p-0">
            {loading ? (
              <TableSkeleton rows={5} cols={5} />
            ) : filtered.length === 0 ? (
              <div className="text-center py-16 text-slate-400">
                <ClipboardList className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm font-medium">No stock counts</p>
                <p className="text-xs mt-1">Create a count to snapshot inventory and record physical quantities.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b-2 border-slate-100 bg-slate-50">
                      <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide">Count #</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide hidden md:table-cell">Location</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide hidden lg:table-cell">Created</th>
                      <th className="text-center px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide">Status</th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(c => {
                      const cfg = STATUS_CFG[c.status]
                      return (
                        <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                          <td className="px-4 py-3 font-mono text-xs font-semibold text-indigo-700">{c.count_number}</td>
                          <td className="px-4 py-3 text-slate-600 hidden md:table-cell">{c.location?.name ?? <span className="text-slate-400">All locations</span>}</td>
                          <td className="px-4 py-3 text-xs text-slate-400 hidden lg:table-cell">{formatDate(c.created_at)}</td>
                          <td className="px-4 py-3 text-center">
                            <Badge variant={cfg?.variant ?? 'secondary'}>{cfg?.label}</Badge>
                          </td>
                          <td className="px-2">
                            <Link href={`/stock-counts/${c.id}`}>
                              <Button variant="ghost" size="icon" className="w-7 h-7">
                                <ChevronRight className="w-4 h-4" />
                              </Button>
                            </Link>
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

      {showNew && (
        <NewCountDialog
          onClose={() => setShowNew(false)}
          onSaved={() => { setShowNew(false); refetch() }}
        />
      )}
    </div>
  )
}
