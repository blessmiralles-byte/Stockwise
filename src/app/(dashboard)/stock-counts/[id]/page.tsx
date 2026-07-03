'use client'

import { useState, use, useMemo, useRef } from 'react'
import { Topbar } from '@/components/layout/topbar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useApi } from '@/lib/use-api'
import { formatDate } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { StockCount, StockCountLine } from '@/types'
import {
  ArrowLeft, CheckCircle2, Save, AlertTriangle,
  MapPin, ChevronRight, LayoutList, Layers, Search,
  Package, Users,
} from 'lucide-react'
import Link from 'next/link'

// ── Types ─────────────────────────────────────────────────────────────────────
const STATUS_CFG: Record<string, { label: string; variant: any }> = {
  open:      { label: 'Open',      variant: 'secondary'   },
  counting:  { label: 'Counting',  variant: 'warning'     },
  reviewing: { label: 'Reviewing', variant: 'warning'     },
  approved:  { label: 'Approved',  variant: 'success'     },
  cancelled: { label: 'Cancelled', variant: 'destructive' },
}

const LOC_ICONS: Record<string, string> = {
  warehouse: '🏭', office: '🏢', store: '🏪', room: '📦', shelf: '📋', other: '📍',
}

// ── Location path helpers ─────────────────────────────────────────────────────
/** Walk up the parent chain and return ordered breadcrumb segments */
function getLocationPath(loc: any): Array<{ id: string; name: string; code: string; type: string }> {
  if (!loc) return []
  const parts: Array<{ id: string; name: string; code: string; type: string }> = []
  let cur = loc
  while (cur) {
    parts.unshift({ id: cur.id, name: cur.name, code: cur.code ?? '', type: cur.type ?? 'other' })
    cur = cur.parent ?? null
  }
  return parts
}

/** Returns a sortable string for a location — e.g. "Main Warehouse / Row 1 / Shelf A" */
function locationSortKey(loc: any): string {
  return getLocationPath(loc).map(p => p.name).join(' / ')
}

/** Returns a short display label — last segment + parent hint */
function locationLabel(loc: any): string {
  const parts = getLocationPath(loc)
  if (parts.length === 0) return 'Unknown location'
  if (parts.length === 1) return parts[0].name
  return parts.map(p => p.name).join(' › ')
}

/** Returns the icon for the leaf location type */
function locationIcon(loc: any): string {
  if (!loc) return '📍'
  return LOC_ICONS[loc.type] ?? '📍'
}

// ── Group lines by location path ──────────────────────────────────────────────
interface LocationSection {
  locationId: string
  locationSortKey: string
  pathParts: Array<{ name: string; code: string; type: string }>
  lines: (StockCountLine & { product?: any; location?: any })[]
}

function buildSections(lines: (StockCountLine & { product?: any; location?: any })[]): LocationSection[] {
  const map = new Map<string, LocationSection>()

  for (const line of lines) {
    const key = line.location_id ?? '__none__'
    if (!map.has(key)) {
      map.set(key, {
        locationId: key,
        locationSortKey: locationSortKey(line.location),
        pathParts: getLocationPath(line.location),
        lines: [],
      })
    }
    map.get(key)!.lines.push(line)
  }

  return Array.from(map.values()).sort((a, b) =>
    a.locationSortKey.localeCompare(b.locationSortKey)
  )
}

// ── Location breadcrumb chip ──────────────────────────────────────────────────
function LocationBreadcrumb({ parts }: { parts: Array<{ name: string; code: string; type: string }> }) {
  if (parts.length === 0) return <span className="text-slate-400 italic text-xs">No location</span>
  return (
    <span className="inline-flex items-center gap-1 flex-wrap">
      {parts.map((p, i) => (
        <span key={i} className="inline-flex items-center gap-1">
          {i > 0 && <ChevronRight className="w-3 h-3 text-slate-300 flex-shrink-0" />}
          <span className={cn(
            'text-xs font-medium px-1.5 py-0.5 rounded',
            i === parts.length - 1
              ? 'bg-indigo-50 text-indigo-700'
              : 'bg-slate-100 text-slate-500'
          )}>
            {LOC_ICONS[p.type] ?? '📍'} {p.name}
            {p.code && <span className="font-mono ml-1 opacity-60">{p.code}</span>}
          </span>
        </span>
      ))}
    </span>
  )
}

// ── Variance pill ─────────────────────────────────────────────────────────────
function VariancePill({ variance }: { variance: number | null }) {
  if (variance === null) return <span className="text-slate-300">—</span>
  if (variance === 0) return <span className="text-green-600 text-xs font-medium">✓ 0</span>
  return (
    <span className={cn(
      'text-xs font-bold tabular-nums',
      variance > 0 ? 'text-green-600' : 'text-red-600'
    )}>
      {variance > 0 ? '+' : ''}{variance.toLocaleString()}
    </span>
  )
}

// ── Section progress bar ──────────────────────────────────────────────────────
function SectionProgress({ total, counted, variances }: { total: number; counted: number; variances: number }) {
  const pct = total === 0 ? 0 : Math.round((counted / total) * 100)
  const done = counted === total
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all', done ? 'bg-green-500' : 'bg-indigo-500')}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-slate-500 flex-shrink-0 tabular-nums">
        {counted}/{total}
        {variances > 0 && <span className="ml-2 text-orange-500 font-semibold">{variances}△</span>}
      </span>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function StockCountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data, loading, error, refetch } = useApi<{ data: StockCount & { lines: any[]; attendee_list?: any[] } }>(`/api/stock-counts/${id}`)
  const { data: prodData } = useApi<{ data: any[] }>('/api/products?limit=500')
  const { data: profile }  = useApi<any>('/api/user/profile')

  const [counts, setCounts]       = useState<Record<string, string>>({})
  const [saving, setSaving]       = useState(false)
  const [approving, setApproving] = useState(false)
  const [saveMsg, setSaveMsg]     = useState('')
  const [viewMode, setViewMode]   = useState<'grouped' | 'flat'>('grouped')
  const [locationFilter, setLocationFilter] = useState<string>('__all__')
  const [search, setSearch]       = useState('')
  const [addSel, setAddSel]       = useState('')
  const [addQty, setAddQty]       = useState('')
  const [adding, setAdding]       = useState(false)
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const products = prodData?.data ?? []

  const sc    = data?.data
  const lines = sc?.lines ?? []

  // Seed counts from server data, and merge in any lines added since (e.g. via
  // the quick-add entry) without clobbering in-progress edits.
  if (sc && lines.length > 0) {
    const missing = lines.filter((l: any) => counts[l.id] === undefined)
    if (missing.length > 0) {
      setCounts(c => {
        const next = { ...c }
        for (const l of missing) next[l.id] = l.counted_qty !== null ? String(l.counted_qty) : ''
        return next
      })
    }
  }

  // Build sections (memo so we don't rebuild on every keystroke)
  const sections = useMemo(() => buildSections(lines), [lines])

  // Filtered sections
  const filteredSections = useMemo(() => {
    return sections
      .filter(s => locationFilter === '__all__' || s.locationId === locationFilter)
      .map(s => ({
        ...s,
        lines: s.lines.filter(l =>
          !search ||
          l.product?.name?.toLowerCase().includes(search.toLowerCase()) ||
          l.product?.sku?.toLowerCase().includes(search.toLowerCase())
        ),
      }))
      .filter(s => s.lines.length > 0)
  }, [sections, locationFilter, search])

  // Overall stats
  const totalLines    = lines.length
  const countedLines  = lines.filter(l => (counts[l.id] ?? '') !== '').length
  const variantLines  = lines.filter(l => {
    const val = counts[l.id]
    if (val === '' || val === undefined) return false
    return parseFloat(val) !== Number(l.system_qty)
  }).length

  async function saveCounts() {
    setSaving(true); setSaveMsg('')
    try {
      const payload = Object.entries(counts)
        .filter(([, v]) => v !== '')
        .map(([line_id, v]) => ({ line_id, counted_qty: parseFloat(v) }))
      const res = await fetch(`/api/stock-counts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lines: payload }),
      })
      if (res.ok) { setSaveMsg('Saved ✓'); refetch(); setTimeout(() => setSaveMsg(''), 2000) }
    } finally { setSaving(false) }
  }

  async function updateStatus(status: string) {
    await fetch(`/api/stock-counts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    refetch()
  }

  async function approve() {
    setApproving(true)
    try {
      const res = await fetch(`/api/stock-counts/${id}/approve`, { method: 'POST' })
      if (res.ok) refetch()
    } finally { setApproving(false) }
  }

  async function addCountItem() {
    if (!addSel || addQty.trim() === '' || Number(addQty) < 0) return
    setAdding(true)
    try {
      const res = await fetch(`/api/stock-counts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ add: [{ product_id: addSel, counted_qty: Number(addQty) }] }),
      })
      if (res.ok) { setAddSel(''); setAddQty(''); refetch() }
    } finally { setAdding(false) }
  }

  async function confirmCount(status: 'confirmed' | 'disputed') {
    let note: string | undefined
    if (status === 'disputed') {
      const input = window.prompt('Optionally describe the discrepancy:')
      if (input === null) return   // user cancelled — do not record a dispute
      note = input || undefined
    }
    const res = await fetch(`/api/stock-counts/${id}/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, note }),
    })
    if (res.ok) refetch()
  }

  function jumpTo(locationId: string) {
    const el = sectionRefs.current[locationId]
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setLocationFilter('__all__')
  }

  if (loading) return (
    <div><Topbar title="Stock Count" />
      <div className="p-6"><div className="h-64 bg-slate-100 rounded-xl animate-pulse" /></div>
    </div>
  )
  if (error || !sc) return (
    <div><Topbar title="Stock Count" />
      <div className="p-6 text-red-500">{error ?? 'Not found'}</div>
    </div>
  )

  const cfg        = STATUS_CFG[sc.status]
  const isEditable = sc.status === 'open' || sc.status === 'counting'
  const canReview  = sc.status === 'counting'
  const canApprove = sc.status === 'reviewing'

  const attendeeList: any[] = (sc as any).attendee_list ?? []
  const myAttendee = attendeeList.find(a => a.user_id && profile?.id && a.user_id === profile.id)
  const confirmStatusCfg: Record<string, { label: string; cls: string }> = {
    pending:      { label: 'Awaiting confirmation', cls: 'bg-amber-100 text-amber-700' },
    confirmed:    { label: 'Confirmed',              cls: 'bg-green-100 text-green-700' },
    disputed:     { label: 'Disputed',               cls: 'bg-red-100 text-red-700' },
    not_required: { label: 'Recorded',               cls: 'bg-slate-100 text-slate-500' },
  }

  return (
    <div>
      <Topbar title={sc.count_number} />
      <div className="p-6 space-y-5 max-w-5xl">

        <Link href="/stock-counts" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-indigo-600">
          <ArrowLeft className="w-4 h-4" /> All Stock Counts
        </Link>

        {/* ── Header card ── */}
        <Card>
          <CardContent className="p-5">
            <div className="flex items-start justify-between flex-wrap gap-4">
              <div>
                <h1 className="text-xl font-bold text-slate-900">{sc.count_number}</h1>
                <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                  <Badge variant={cfg?.variant ?? 'secondary'}>{cfg?.label}</Badge>
                  {sc.location ? (
                    <LocationBreadcrumb parts={getLocationPath(sc.location)} />
                  ) : (
                    <span className="text-sm text-slate-400 flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5" /> All locations
                    </span>
                  )}
                  <span className="text-xs text-slate-400">Created {formatDate(sc.created_at)}</span>
                  {sc.approved_at && <span className="text-xs text-slate-400">Approved {formatDate(sc.approved_at)}</span>}
                </div>

                {sc.attendees && (
                  <p className="mt-1.5 text-xs text-slate-500 flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-slate-400">Present:</span> {sc.attendees}
                  </p>
                )}

                {/* Overall progress */}
                <div className="mt-3 flex items-center gap-6">
                  <div className="flex gap-4 text-sm">
                    <span><strong className="text-slate-900">{totalLines}</strong> <span className="text-slate-400">lines</span></span>
                    <span><strong className="text-slate-900">{countedLines}</strong> <span className="text-slate-400">counted</span></span>
                    <span><strong className={variantLines > 0 ? 'text-orange-600' : 'text-slate-900'}>{variantLines}</strong> <span className="text-slate-400">variances</span></span>
                    <span><strong className="text-slate-900">{sections.length}</strong> <span className="text-slate-400">locations</span></span>
                  </div>
                </div>
                <div className="mt-2 w-64">
                  <SectionProgress total={totalLines} counted={countedLines} variances={variantLines} />
                </div>
              </div>

              <div className="flex gap-2 flex-wrap">
                {isEditable && (
                  <>
                    {sc.status === 'open' && (
                      <Button size="sm" variant="outline" onClick={() => updateStatus('counting')}>
                        Start Counting
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={saveCounts} disabled={saving} className="gap-1">
                      <Save className="w-3.5 h-3.5" /> {saveMsg || (saving ? 'Saving…' : 'Save Counts')}
                    </Button>
                  </>
                )}
                {canReview && (
                  <Button size="sm" onClick={() => updateStatus('reviewing')} className="gap-1">
                    Submit for Review
                  </Button>
                )}
                {canApprove && (
                  <Button size="sm" onClick={approve} disabled={approving} className="gap-1 bg-green-600 hover:bg-green-700">
                    <CheckCircle2 className="w-3.5 h-3.5" /> {approving ? 'Approving…' : 'Approve & Post Adjustments'}
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Attendees & confirmations ── */}
        {attendeeList.length > 0 && (
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                  <Users className="w-4 h-4 text-slate-400" /> People Present
                </p>
                {myAttendee?.confirmation_status === 'pending' && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="gap-1 text-red-600 border-red-200 hover:bg-red-50"
                      onClick={() => confirmCount('disputed')}>
                      Dispute
                    </Button>
                    <Button size="sm" className="gap-1 bg-green-600 hover:bg-green-700"
                      onClick={() => confirmCount('confirmed')}>
                      <CheckCircle2 className="w-3.5 h-3.5" /> Confirm my count
                    </Button>
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {attendeeList.map(a => {
                  const cfg = confirmStatusCfg[a.confirmation_status] ?? confirmStatusCfg.not_required
                  return (
                    <div key={a.id} className="inline-flex items-center gap-2 border border-slate-200 rounded-lg px-2.5 py-1.5">
                      <span className="text-sm text-slate-700">{a.name}</span>
                      {a.is_external && <span className="text-[10px] uppercase tracking-wide text-slate-400">auditor</span>}
                      <span className={cn('text-[11px] font-medium px-1.5 py-0.5 rounded-full', cfg.cls)}>{cfg.label}</span>
                    </div>
                  )
                })}
              </div>
              {attendeeList.some(a => a.confirmation_status === 'pending') && (
                <p className="text-xs text-slate-400 mt-2">
                  Team members are notified on their mobile app to confirm when the count is submitted for review.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── Active counting: add an item + its counted quantity ── */}
        {isEditable && (
          <Card>
            <CardContent className="p-4">
              <p className="text-sm font-semibold text-slate-800 mb-2 flex items-center gap-2">
                <Package className="w-4 h-4 text-slate-400" /> Count an Item
              </p>
              <div className="flex flex-wrap gap-2">
                <select
                  className="flex-1 min-w-48 border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                  value={addSel}
                  onChange={e => setAddSel(e.target.value)}
                >
                  <option value="">— Choose an item —</option>
                  {products.map((p: any) => (
                    <option key={p.id} value={p.id}>{p.name}{p.sku ? ` (${p.sku})` : ''}</option>
                  ))}
                </select>
                <Input
                  type="text"
                  inputMode="numeric"
                  value={addQty}
                  onChange={e => setAddQty(e.target.value.replace(/[^\d.]/g, ''))}
                  placeholder="Counted qty"
                  className="w-32"
                  disabled={!addSel}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCountItem() } }}
                />
                <Button onClick={addCountItem} disabled={!addSel || addQty.trim() === '' || adding} className="gap-1">
                  {adding ? 'Adding…' : 'Add'}
                </Button>
              </div>
              <p className="text-xs text-slate-400 mt-2">
                Add each item as you count it. New items not in the snapshot are added and flagged as a variance.
              </p>
            </CardContent>
          </Card>
        )}

        {/* ── Variance warning ── */}
        {variantLines > 0 && (
          <div className="flex items-start gap-2 bg-orange-50 border border-orange-200 rounded-lg px-4 py-3 text-sm">
            <AlertTriangle className="w-4 h-4 text-orange-500 flex-shrink-0 mt-0.5" />
            <p className="text-orange-800">
              <strong>{variantLines} items</strong> have variances. Approving will post adjustment transactions to reconcile system quantities.
            </p>
          </div>
        )}

        {/* ── Toolbar: search + location filter + view toggle ── */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search item name or SKU…"
              className="pl-9 h-9"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {/* Location filter */}
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-slate-400 flex-shrink-0" />
            <select
              value={locationFilter}
              onChange={e => setLocationFilter(e.target.value)}
              className="h-9 border border-slate-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            >
              <option value="__all__">All locations ({sections.length})</option>
              {sections.map(s => (
                <option key={s.locationId} value={s.locationId}>
                  {s.pathParts.map(p => p.name).join(' › ')}
                </option>
              ))}
            </select>
          </div>

          {/* View toggle */}
          <div className="flex rounded-lg border border-slate-200 overflow-hidden">
            <button
              onClick={() => setViewMode('grouped')}
              className={cn('flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors',
                viewMode === 'grouped' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50')}
              title="Group by location"
            >
              <Layers className="w-3.5 h-3.5" /> Grouped
            </button>
            <button
              onClick={() => setViewMode('flat')}
              className={cn('flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors',
                viewMode === 'flat' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50')}
              title="Flat list"
            >
              <LayoutList className="w-3.5 h-3.5" /> Flat
            </button>
          </div>
        </div>

        {/* ── Location jump pills (grouped mode, all-locations view) ── */}
        {viewMode === 'grouped' && locationFilter === '__all__' && sections.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {sections.map(s => {
              const sectionCounted = s.lines.filter(l => (counts[l.id] ?? '') !== '').length
              const done = sectionCounted === s.lines.length
              const icon = LOC_ICONS[s.pathParts[s.pathParts.length - 1]?.type ?? 'other'] ?? '📍'
              return (
                <button
                  key={s.locationId}
                  onClick={() => jumpTo(s.locationId)}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
                    done
                      ? 'bg-green-50 text-green-700 border-green-200'
                      : sectionCounted > 0
                      ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  )}
                >
                  {done && <CheckCircle2 className="w-3 h-3" />}
                  {icon} {s.pathParts[s.pathParts.length - 1]?.name ?? 'Location'}
                  <span className="text-slate-400 font-normal">{sectionCounted}/{s.lines.length}</span>
                </button>
              )
            })}
          </div>
        )}

        {/* ── GROUPED VIEW ── */}
        {viewMode === 'grouped' && (
          <div className="space-y-4">
            {filteredSections.length === 0 && (
              <div className="text-center py-12 text-slate-400">
                <Package className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No items match</p>
              </div>
            )}
            {filteredSections.map(section => {
              const sectionCounted  = section.lines.filter(l => (counts[l.id] ?? '') !== '').length
              const sectionVariances = section.lines.filter(l => {
                const val = counts[l.id]
                if (!val) return false
                return parseFloat(val) !== Number(l.system_qty)
              }).length
              const leafPart = section.pathParts[section.pathParts.length - 1]

              return (
                <div
                  key={section.locationId}
                  ref={el => { sectionRefs.current[section.locationId] = el }}
                >
                  {/* Section header */}
                  <div className="flex items-center justify-between mb-2 px-1">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <span className="text-lg leading-none flex-shrink-0">
                        {LOC_ICONS[leafPart?.type ?? 'other'] ?? '📍'}
                      </span>
                      <div className="min-w-0">
                        <LocationBreadcrumb parts={section.pathParts} />
                      </div>
                    </div>
                    <div className="flex-shrink-0 ml-4 w-48">
                      <SectionProgress
                        total={section.lines.length}
                        counted={sectionCounted}
                        variances={sectionVariances}
                      />
                    </div>
                  </div>

                  {/* Lines table for this section */}
                  <Card>
                    <CardContent className="p-0">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 border-b border-slate-100">
                          <tr>
                            <th className="text-left px-4 py-2.5 font-semibold text-slate-500 text-xs uppercase">Product</th>
                            <th className="text-right px-4 py-2.5 font-semibold text-slate-500 text-xs uppercase w-24">System</th>
                            <th className="text-right px-4 py-2.5 font-semibold text-slate-500 text-xs uppercase w-28">Counted</th>
                            <th className="text-right px-4 py-2.5 font-semibold text-slate-500 text-xs uppercase w-20">Variance</th>
                          </tr>
                        </thead>
                        <tbody>
                          {section.lines.map(l => {
                            const inputVal = counts[l.id] ?? ''
                            const parsed   = inputVal === '' ? null : parseFloat(inputVal)
                            const variance = parsed !== null ? parsed - Number(l.system_qty) : null
                            const hasVar   = variance !== null && variance !== 0

                            return (
                              <tr key={l.id} className={cn('border-b border-slate-50 last:border-0', hasVar && 'bg-orange-50/40')}>
                                <td className="px-4 py-2.5">
                                  <p className="font-medium text-slate-900 text-sm">{l.product?.name}</p>
                                  <p className="text-xs text-slate-400 font-mono">{l.product?.sku} · {l.product?.unit_of_measure}</p>
                                </td>
                                <td className="px-4 py-2.5 text-right tabular-nums text-slate-700 font-medium">
                                  {Number(l.system_qty).toLocaleString()}
                                </td>
                                <td className="px-4 py-2.5 text-right">
                                  {isEditable ? (
                                    <Input
                                      type="number" min={0} step="0.01"
                                      value={inputVal}
                                      onChange={e => setCounts(c => ({ ...c, [l.id]: e.target.value }))}
                                      className="h-7 w-24 text-right ml-auto"
                                      placeholder="—"
                                    />
                                  ) : (
                                    <span className="tabular-nums font-medium">
                                      {l.counted_qty !== null ? Number(l.counted_qty).toLocaleString() : <span className="text-slate-300">—</span>}
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-2.5 text-right">
                                  <VariancePill variance={variance} />
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </CardContent>
                  </Card>
                </div>
              )
            })}
          </div>
        )}

        {/* ── FLAT VIEW ── */}
        {viewMode === 'flat' && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">All Count Lines</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr>
                      <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase">Product</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase">Location</th>
                      <th className="text-right px-4 py-3 font-semibold text-slate-500 text-xs uppercase">System</th>
                      <th className="text-right px-4 py-3 font-semibold text-slate-500 text-xs uppercase">Counted</th>
                      <th className="text-right px-4 py-3 font-semibold text-slate-500 text-xs uppercase">Variance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines
                      .filter(l =>
                        !search ||
                        l.product?.name?.toLowerCase().includes(search.toLowerCase()) ||
                        l.product?.sku?.toLowerCase().includes(search.toLowerCase())
                      )
                      .filter(l => locationFilter === '__all__' || l.location_id === locationFilter)
                      .map(l => {
                        const inputVal = counts[l.id] ?? ''
                        const parsed   = inputVal === '' ? null : parseFloat(inputVal)
                        const variance = parsed !== null ? parsed - Number(l.system_qty) : null
                        const hasVar   = variance !== null && variance !== 0
                        return (
                          <tr key={l.id} className={cn('border-b border-slate-50', hasVar && 'bg-orange-50/30')}>
                            <td className="px-4 py-3">
                              <p className="font-medium text-slate-900">{l.product?.name}</p>
                              <p className="text-xs text-slate-400 font-mono">{l.product?.sku} · {l.product?.unit_of_measure}</p>
                            </td>
                            <td className="px-4 py-3">
                              <LocationBreadcrumb parts={getLocationPath(l.location)} />
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums font-medium">{Number(l.system_qty).toLocaleString()}</td>
                            <td className="px-4 py-3 text-right">
                              {isEditable ? (
                                <Input
                                  type="number" min={0} step="0.01"
                                  value={inputVal}
                                  onChange={e => setCounts(c => ({ ...c, [l.id]: e.target.value }))}
                                  className="h-7 w-24 text-right ml-auto"
                                  placeholder="—"
                                />
                              ) : (
                                <span className="tabular-nums font-medium">
                                  {l.counted_qty !== null ? Number(l.counted_qty).toLocaleString() : <span className="text-slate-300">—</span>}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <VariancePill variance={variance} />
                            </td>
                          </tr>
                        )
                      })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {isEditable && (
          <div className="flex justify-end">
            <Button onClick={saveCounts} disabled={saving} className="gap-2">
              <Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save All Counts'}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
