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
import { Plus, ClipboardList, X, ChevronRight, Search, MapPin, Users, Package } from 'lucide-react'
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

interface CountedItem { product_id: string; name: string; sku: string; qty: string }

function NewCountDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  // Use ?all=true to get every level of the hierarchy
  const { data: locData } = useApi<{ data: FlatLoc[] }>('/api/locations?all=true')
  const { data: prodData } = useApi<{ data: any[] }>('/api/products?limit=500')

  const [location_id, setLocation] = useState('')
  const [attendees, setAttendees]  = useState<string[]>([])
  const [attendeeInput, setAttInput] = useState('')
  const [items, setItems]          = useState<CountedItem[]>([])
  const [itemSel, setItemSel]      = useState('')
  const [itemQty, setItemQty]      = useState('')
  const [notes, setNotes]          = useState('')
  const [saving, setSaving]        = useState(false)
  const [error, setError]          = useState('')

  const flatLocs = buildFlatTree(locData?.data ?? [])
  const products = prodData?.data ?? []
  const selectedLoc = flatLocs.find(l => l.id === location_id)

  const addAttendee = () => {
    const name = attendeeInput.trim()
    if (!name || attendees.includes(name)) { setAttInput(''); return }
    setAttendees(a => [...a, name]); setAttInput('')
  }
  const removeAttendee = (n: string) => setAttendees(a => a.filter(x => x !== n))

  const addItem = () => {
    if (!itemSel) return
    const p = products.find((x: any) => x.id === itemSel)
    if (!p) return
    const qty = itemQty.trim()
    if (qty === '' || Number(qty) < 0) { setError('Enter a quantity for the item'); return }
    setItems(prev => {
      const existing = prev.find(i => i.product_id === itemSel)
      if (existing) return prev.map(i => i.product_id === itemSel ? { ...i, qty } : i)
      return [...prev, { product_id: p.id, name: p.name, sku: p.sku ?? '', qty }]
    })
    setItemSel(''); setItemQty(''); setError('')
  }
  const removeItem = (pid: string) => setItems(prev => prev.filter(i => i.product_id !== pid))

  const canSubmit = !!location_id && attendees.length > 0

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!location_id) { setError('Select a location first'); return }
    if (attendees.length === 0) { setError('Log at least one person present'); return }
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/stock-counts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location_id,
          attendees,
          notes,
          counts: items.map(i => ({ product_id: i.product_id, counted_qty: Number(i.qty) })),
        }),
      })
      if (!res.ok) { const j = await res.json(); setError(j.error ?? 'Failed'); return }
      onSaved()
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">New Stock Count</h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="w-4 h-4" /></Button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 1. Location (required, first) */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Location <span className="text-red-500">*</span>
            </label>
            <select
              className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
              value={location_id}
              onChange={e => setLocation(e.target.value)}
            >
              <option value="">— Select a location —</option>
              {flatLocs.map(l => (
                <option key={l.id} value={l.id}>
                  {' '.repeat(l.level * 4)}{LOC_TYPE_ICONS[l.type] ?? '📍'} {l.name}
                </option>
              ))}
            </select>
            {selectedLoc && (
              <p className="mt-1.5 text-xs text-slate-400 flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                Counting items stored in <strong className="text-slate-600">{selectedLoc.name}</strong>
              </p>
            )}
          </div>

          {/* 2. People present (required) */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              People Present <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Users className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <Input
                  value={attendeeInput}
                  onChange={e => setAttInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addAttendee() } }}
                  placeholder="Add a name and press Enter"
                  className="pl-8"
                />
              </div>
              <Button type="button" variant="outline" onClick={addAttendee}>Add</Button>
            </div>
            {attendees.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {attendees.map(n => (
                  <span key={n} className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 text-xs font-medium px-2 py-1 rounded-full">
                    {n}
                    <button type="button" onClick={() => removeAttendee(n)} className="hover:text-indigo-900">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* 3. Count items: pick an item, enter the quantity */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Count Items <span className="text-slate-400 font-normal">(optional — you can also count later)</span>
            </label>
            <div className="flex gap-2">
              <select
                className="flex-1 border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                value={itemSel}
                onChange={e => setItemSel(e.target.value)}
              >
                <option value="">— Choose an item —</option>
                {products.map((p: any) => (
                  <option key={p.id} value={p.id}>{p.name}{p.sku ? ` (${p.sku})` : ''}</option>
                ))}
              </select>
              <Input
                type="text"
                inputMode="numeric"
                value={itemQty}
                onChange={e => setItemQty(e.target.value.replace(/[^\d.]/g, ''))}
                placeholder="Qty"
                className="w-24"
                disabled={!itemSel}
              />
              <Button type="button" variant="outline" onClick={addItem} disabled={!itemSel}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>

            {items.length > 0 && (
              <div className="mt-2 space-y-1.5">
                {items.map(i => (
                  <div key={i.product_id} className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                    <Package className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-800 truncate">{i.name}</p>
                      {i.sku && <p className="text-xs text-slate-400 font-mono">{i.sku}</p>}
                    </div>
                    <span className="text-sm font-semibold text-slate-900 tabular-nums">{i.qty}</span>
                    <button type="button" onClick={() => removeItem(i.product_id)}
                      className="text-slate-400 hover:text-red-500">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes…" />
          </div>

          {error && <p className="text-red-500 text-xs">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving || !canSubmit}>{saving ? 'Creating…' : 'Create Count'}</Button>
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
