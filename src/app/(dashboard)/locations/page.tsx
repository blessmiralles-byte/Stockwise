'use client'

import { useState } from 'react'
import { Topbar } from '@/components/layout/topbar'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CardSkeleton } from '@/components/ui/skeleton'
import { useApi } from '@/lib/use-api'
import { formatCurrency } from '@/lib/utils'
import { cn } from '@/lib/utils'
import {
  Search, Plus, MapPin, Package, DollarSign,
  ChevronRight, ChevronDown, Layers, BookOpen, Archive,
  X, Loader2, AlertCircle, Pencil, Trash2, CheckCircle2,
} from 'lucide-react'

// ── Config ────────────────────────────────────────────────────────────────────
const LOCATION_TYPES = ['warehouse', 'office', 'store', 'room', 'shelf', 'other'] as const
type LocationType = typeof LOCATION_TYPES[number]

const typeIcons: Record<string, any> = {
  warehouse: Archive,
  office:    BookOpen,
  store:     Package,
  room:      Layers,
  shelf:     Layers,
  other:     MapPin,
}
const typeColors: Record<string, string> = {
  warehouse: 'bg-blue-50 text-blue-600',
  office:    'bg-purple-50 text-purple-600',
  store:     'bg-green-50 text-green-600',
  room:      'bg-orange-50 text-orange-600',
  shelf:     'bg-slate-50 text-slate-500',
  other:     'bg-slate-50 text-slate-500',
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface Loc {
  id: string; name: string; code: string
  address?: string; type: string; level: number
  parent_id: string | null; items?: number; value?: number
}

// ── Tree helpers ──────────────────────────────────────────────────────────────
function buildTree(locs: Loc[]) {
  const children: Record<string, Loc[]> = {}
  locs.forEach(l => {
    const key = l.parent_id ?? '__root__'
    if (!children[key]) children[key] = []
    children[key].push(l)
  })
  return children
}

// ── Add / Edit Dialog ─────────────────────────────────────────────────────────
function LocationDialog({
  editing,
  allLocs,
  onClose,
  onSaved,
}: {
  editing:  Loc | null          // null = add mode
  allLocs:  Loc[]
  onClose:  () => void
  onSaved:  () => void
}) {
  const isEdit = !!editing

  const [name,     setName]     = useState(editing?.name     ?? '')
  const [code,     setCode]     = useState(editing?.code     ?? '')
  const [type,     setType]     = useState<LocationType>((editing?.type as LocationType) ?? 'warehouse')
  const [address,  setAddress]  = useState(editing?.address  ?? '')
  const [parentId, setParentId] = useState(editing?.parent_id ?? '')
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')

  // Auto-suggest a code when name changes in add mode
  const handleNameChange = (v: string) => {
    setName(v)
    if (!isEdit && !code) {
      setCode(v.toUpperCase().replace(/[^A-Z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 12))
    }
  }

  // Possible parents: all locs except self and descendants
  const validParents = allLocs.filter(l => l.id !== editing?.id)

  const save = async () => {
    if (!name.trim()) { setError('Name is required'); return }
    if (!code.trim()) { setError('Code is required'); return }

    setSaving(true); setError('')

    const body = {
      name:      name.trim(),
      code:      code.trim(),
      type,
      address:   address.trim() || undefined,
      parent_id: parentId || null,
    }

    const url    = isEdit ? `/api/locations/${editing!.id}` : '/api/locations'
    const method = isEdit ? 'PATCH' : 'POST'

    const res  = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await res.json()
    setSaving(false)

    if (!res.ok) { setError(json.error ?? 'Failed to save'); return }
    onSaved()
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-900">
            {isEdit ? 'Edit Location' : 'Add Location'}
          </h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="w-4 h-4" /></Button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Name <span className="text-red-500">*</span>
            </label>
            <Input
              value={name}
              onChange={e => handleNameChange(e.target.value)}
              placeholder="e.g. Main Warehouse, Shelf A1"
              autoFocus
            />
          </div>

          {/* Code + Type */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Code <span className="text-red-500">*</span>
              </label>
              <Input
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase())}
                placeholder="e.g. WH-MAIN"
                className="font-mono"
                maxLength={20}
              />
              <p className="text-[10px] text-slate-400 mt-1">Used for barcode scanning</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Type</label>
              <select
                value={type}
                onChange={e => setType(e.target.value as LocationType)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white capitalize"
              >
                {LOCATION_TYPES.map(t => (
                  <option key={t} value={t} className="capitalize">{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Parent */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Parent Location <span className="text-slate-400 font-normal">(optional — leave blank for top-level)</span>
            </label>
            <select
              value={parentId}
              onChange={e => setParentId(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            >
              <option value="">— Top-level location —</option>
              {validParents.map(l => (
                <option key={l.id} value={l.id}>
                  {'  '.repeat(l.level)}{l.name} ({l.code})
                </option>
              ))}
            </select>
          </div>

          {/* Address (top-level only hint) */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Address <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <Input
              value={address}
              onChange={e => setAddress(e.target.value)}
              placeholder="Street address or site description"
            />
          </div>

          {error && (
            <p className="text-xs text-red-600 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-6 pb-5">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving} className="gap-2">
            {saving
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Saving…</>
              : <><CheckCircle2 className="w-3.5 h-3.5" />{isEdit ? 'Save Changes' : 'Add Location'}</>
            }
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Location row ──────────────────────────────────────────────────────────────
function LocationRow({
  loc, children, depth, search,
  onEdit, onDelete,
}: {
  loc:      Loc
  children: Record<string, Loc[]>
  depth:    number
  search:   string
  onEdit:   (loc: Loc) => void
  onDelete: (loc: Loc) => void
}) {
  const [open, setOpen] = useState(depth === 0)
  const kids = children[loc.id] ?? []
  const hasKids = kids.length > 0
  const Icon = typeIcons[loc.type] ?? MapPin
  const colorClass = typeColors[loc.type] ?? 'bg-slate-50 text-slate-500'

  const matchesSearch = search === '' ||
    loc.name.toLowerCase().includes(search.toLowerCase()) ||
    loc.code.toLowerCase().includes(search.toLowerCase())

  const childMatches = kids.some(k =>
    k.name.toLowerCase().includes(search.toLowerCase()) ||
    k.code.toLowerCase().includes(search.toLowerCase())
  )

  if (!matchesSearch && !childMatches) return null

  return (
    <div>
      <div
        className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors rounded-lg group"
        style={{ paddingLeft: `${16 + depth * 24}px` }}
      >
        {/* Expand/collapse */}
        <div
          className="w-4 flex-shrink-0 cursor-pointer"
          onClick={() => hasKids && setOpen(o => !o)}
        >
          {hasKids
            ? open
              ? <ChevronDown  className="w-4 h-4 text-slate-400" />
              : <ChevronRight className="w-4 h-4 text-slate-400" />
            : null
          }
        </div>

        {/* Icon */}
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${colorClass}`}>
          <Icon className="w-4 h-4" />
        </div>

        {/* Name + code */}
        <div
          className="flex-1 min-w-0 cursor-pointer"
          onClick={() => hasKids && setOpen(o => !o)}
        >
          <div className="flex items-center gap-2">
            <p className="font-medium text-slate-900 text-sm">{loc.name}</p>
            <span className="text-xs font-mono text-slate-400 hidden md:inline">{loc.code}</span>
            <span className={`text-xs px-1.5 py-0.5 rounded capitalize hidden sm:inline ${colorClass}`}>
              {loc.type}
            </span>
          </div>
          {loc.address && depth === 0 && (
            <p className="text-xs text-slate-400 truncate">{loc.address}</p>
          )}
        </div>

        {/* Stats */}
        {depth === 0 && loc.items !== undefined && (
          <div className="hidden md:flex items-center gap-6 flex-shrink-0">
            <div className="text-right">
              <p className="text-xs text-slate-400">Items</p>
              <p className="font-semibold text-sm text-slate-900">{loc.items}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-400">Value</p>
              <p className="font-semibold text-sm text-slate-900">{formatCurrency(loc.value ?? 0)}</p>
            </div>
          </div>
        )}

        {/* Sub-item badge */}
        {hasKids && (
          <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full flex-shrink-0">
            {kids.length} {depth === 0 ? 'sub-locations' : 'children'}
          </span>
        )}

        {/* Action buttons (appear on hover) */}
        <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          <button
            onClick={() => onEdit(loc)}
            className="p-1.5 rounded-md text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
            title="Edit"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onDelete(loc)}
            className="p-1.5 rounded-md text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
            title="Delete"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Children */}
      {open && hasKids && (
        <div className="border-l-2 border-slate-100 ml-8">
          {kids.map(child => (
            <LocationRow
              key={child.id}
              loc={child}
              children={children}
              depth={depth + 1}
              search={search}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Delete confirm ────────────────────────────────────────────────────────────
function DeleteConfirm({ loc, onClose, onDeleted }: { loc: Loc; onClose: () => void; onDeleted: () => void }) {
  const [deleting, setDeleting] = useState(false)
  const [error,    setError]    = useState('')

  const del = async () => {
    setDeleting(true); setError('')
    const res  = await fetch(`/api/locations/${loc.id}`, { method: 'DELETE' })
    const json = await res.json()
    setDeleting(false)
    if (!res.ok) { setError(json.error ?? 'Failed to delete'); return }
    onDeleted()
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
        <h3 className="font-semibold text-slate-900">Delete location?</h3>
        <p className="text-sm text-slate-600">
          <strong>{loc.name}</strong> ({loc.code}) will be deactivated.
          This cannot be undone if the location has associated records.
        </p>
        {error && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 flex items-start gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" /> {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={del}
            disabled={deleting}
            className="gap-2 bg-red-600 hover:bg-red-700 text-white"
          >
            {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            {deleting ? 'Deleting…' : 'Delete'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function LocationsPage() {
  const [search,    setSearch]    = useState('')
  const [showAdd,   setShowAdd]   = useState(false)
  const [editing,   setEditing]   = useState<Loc | null>(null)
  const [deleting,  setDeleting]  = useState<Loc | null>(null)

  const { data, loading, error, refetch } = useApi<{ data: Loc[] }>('/api/locations?all=true')
  const allLocs = data?.data ?? []

  const { data: statsData, refetch: refetchStats } = useApi<{ data: Loc[] }>('/api/locations')
  const statsById = Object.fromEntries((statsData?.data ?? []).map(l => [l.id, l]))

  const locsWithStats = allLocs.map(l =>
    l.parent_id === null ? { ...l, ...statsById[l.id] } : l
  )

  const tree  = buildTree(locsWithStats)
  const roots = (tree['__root__'] ?? []).sort((a, b) => a.name.localeCompare(b.name))

  const handleSaved = () => {
    setShowAdd(false)
    setEditing(null)
    refetch()
    refetchStats()
  }

  const handleDeleted = () => {
    setDeleting(null)
    refetch()
    refetchStats()
  }

  return (
    <div>
      <Topbar title="Locations" />
      <div className="p-6 space-y-4">

        <div className="flex items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search locations…"
              className="pl-9"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <Button className="gap-2" onClick={() => setShowAdd(true)}>
            <Plus className="w-4 h-4" /> Add Location
          </Button>
        </div>

        {error && <p className="text-red-500 text-sm">{error}</p>}

        <Card>
          <CardContent className="p-2">
            {loading
              ? <div className="space-y-2 p-2">{Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)}</div>
              : roots.length === 0
                ? (
                  <div className="text-center py-12 text-slate-400">
                    <MapPin className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No locations yet</p>
                    <button
                      className="mt-3 text-sm text-indigo-500 hover:underline"
                      onClick={() => setShowAdd(true)}
                    >
                      + Add your first location
                    </button>
                  </div>
                )
                : roots.map(root => (
                  <LocationRow
                    key={root.id}
                    loc={root}
                    children={tree}
                    depth={0}
                    search={search}
                    onEdit={setEditing}
                    onDelete={setDeleting}
                  />
                ))
            }
          </CardContent>
        </Card>

        <p className="text-xs text-slate-400 flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5" />
          Tip: nest locations by selecting a Parent — e.g. Shelf A1 → Zone A → Main Warehouse
        </p>
      </div>

      {/* Add dialog */}
      {showAdd && (
        <LocationDialog
          editing={null}
          allLocs={allLocs}
          onClose={() => setShowAdd(false)}
          onSaved={handleSaved}
        />
      )}

      {/* Edit dialog */}
      {editing && (
        <LocationDialog
          editing={editing}
          allLocs={allLocs}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
        />
      )}

      {/* Delete confirm */}
      {deleting && (
        <DeleteConfirm
          loc={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  )
}
