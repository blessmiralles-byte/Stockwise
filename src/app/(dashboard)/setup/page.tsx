'use client'

import { useState, useCallback, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Topbar } from '@/components/layout/topbar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useApi } from '@/lib/use-api'
import { cn } from '@/lib/utils'
import { GettingStartedGuide } from '@/components/onboarding/getting-started-guide'
import {
  MapPin, Tag, Briefcase, Hash,
  Plus, Pencil, Trash2, Loader2, AlertCircle, CheckCircle2,
  X, Archive, BookOpen, Package, Layers, Info,
  ToggleLeft, ToggleRight, Upload, Download, FileSpreadsheet,
  ChevronDown, ChevronRight, Sparkles, Truck, Boxes, Building2,
} from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────────

function SectionHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      {description && <p className="text-xs text-slate-500 mt-0.5">{description}</p>}
    </div>
  )
}

function ErrorBanner({ msg }: { msg: string }) {
  return (
    <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 flex items-center gap-1.5">
      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {msg}
    </p>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Inline import panel (reusable per tab)
// ─────────────────────────────────────────────────────────────────────────────
interface ImportConfig {
  entity:   string
  label:    string
  required: string[]
  columns:  string[]
}

function ImportPanel({ config, onImported }: { config: ImportConfig; onImported: () => void }) {
  const [open,    setOpen]    = useState(false)
  const [file,    setFile]    = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [result,  setResult]  = useState<any>(null)
  const [error,   setError]   = useState('')
  const [errExp,  setErrExp]  = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const reset = () => { setFile(null); setResult(null); setError('') }

  const handleImport = useCallback(async () => {
    if (!file) return
    setLoading(true); setError(''); setResult(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res  = await fetch(`/api/import/${config.entity}`, { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok && !json.imported && !json.errors) { setError(json.error ?? 'Import failed'); return }
      setResult(json)
      if (json.imported > 0) { setFile(null); onImported() }
    } catch { setError('Network error — please try again.') }
    finally  { setLoading(false) }
  }, [file, config.entity, onImported])

  if (!open) {
    return (
      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setOpen(true)}>
        <Upload className="w-3.5 h-3.5" /> Import from CSV/Excel
      </Button>
    )
  }

  return (
    <div className="border border-indigo-200 bg-indigo-50/30 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-indigo-800 flex items-center gap-1.5">
          <Upload className="w-3.5 h-3.5" /> Bulk Import — {config.label}
        </p>
        <button onClick={() => { setOpen(false); reset() }} className="text-slate-400 hover:text-slate-600">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Template download */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => { window.location.href = `/api/import/${config.entity}` }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
        >
          <Download className="w-3.5 h-3.5" /> Download template
        </button>
        <p className="text-xs text-slate-400">
          Required columns: <span className="font-mono text-red-600">{config.required.join(', ')}</span>
        </p>
      </div>

      {/* Drop zone */}
      {file ? (
        <div className="flex items-center justify-between px-4 py-3 bg-white border-2 border-indigo-200 rounded-xl">
          <div className="flex items-center gap-3">
            <FileSpreadsheet className="w-5 h-5 text-indigo-600 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-indigo-900">{file.name}</p>
              <p className="text-xs text-indigo-500">{(file.size / 1024).toFixed(1)} KB</p>
            </div>
          </div>
          <button onClick={reset} className="p-1.5 rounded-lg hover:bg-indigo-100 transition-colors">
            <X className="w-4 h-4 text-indigo-500" />
          </button>
        </div>
      ) : (
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) setFile(f) }}
          onClick={() => inputRef.current?.click()}
          className={cn(
            'border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors',
            dragging ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 bg-white hover:border-indigo-300 hover:bg-slate-50'
          )}
        >
          <Upload className="w-6 h-6 mx-auto mb-2 text-slate-400" />
          <p className="text-xs font-medium text-slate-700">Drop file here or click to browse</p>
          <p className="text-xs text-slate-400 mt-0.5">CSV, XLSX, XLS — max 5 MB, 1 000 rows</p>
          <input ref={inputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) setFile(f) }} />
        </div>
      )}

      {file && (
        <Button size="sm" onClick={handleImport} disabled={loading} className="gap-1.5">
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
          {loading ? 'Importing…' : `Import ${config.label}`}
        </Button>
      )}

      {error && <ErrorBanner msg={error} />}

      {result && !loading && (
        <div className="space-y-2">
          <div className={cn('flex items-start gap-2 p-3 rounded-lg border text-xs',
            result.imported > 0 ? 'bg-green-50 border-green-200 text-green-800' : 'bg-amber-50 border-amber-200 text-amber-800'
          )}>
            {result.imported > 0
              ? <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5 text-green-600" />
              : <AlertCircle  className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-600" />}
            <div>
              <p className="font-semibold">
                {result.imported > 0 ? `${result.imported} records imported` : 'No records imported'}
              </p>
              {result.skipped > 0 && <p>{result.skipped} rows skipped</p>}
            </div>
          </div>
          {result.errors?.length > 0 && (
            <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
              <button onClick={() => setErrExp(e => !e)}
                className="w-full flex items-center justify-between px-3 py-2 hover:bg-slate-50 text-left">
                <p className="text-xs font-semibold text-red-700">{result.errors.length} errors</p>
                {errExp ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
              </button>
              {errExp && (
                <div className="px-3 pb-2 space-y-1 max-h-36 overflow-y-auto">
                  {result.errors.map((e: string, i: number) => (
                    <p key={i} className="text-xs text-red-700 bg-red-50 px-2 py-1 rounded">{e}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. LOCATIONS TAB
// ─────────────────────────────────────────────────────────────────────────────
const LOC_TYPES = ['building', 'floor', 'warehouse', 'office', 'store', 'room', 'shelf', 'vehicle', 'other'] as const
const locIcon: Record<string, any> = { building: Building2, floor: Layers, warehouse: Archive, office: BookOpen, store: Package, room: Layers, shelf: Layers, vehicle: Truck, other: MapPin }
const locColor: Record<string, string> = {
  building: 'bg-indigo-50 text-indigo-600', floor: 'bg-cyan-50 text-cyan-600',
  warehouse: 'bg-blue-50 text-blue-600', office: 'bg-purple-50 text-purple-600',
  store: 'bg-green-50 text-green-600',   room: 'bg-orange-50 text-orange-600',
  shelf: 'bg-slate-100 text-slate-500',  vehicle: 'bg-amber-50 text-amber-600',
  other: 'bg-slate-100 text-slate-500',
}

interface Loc { id: string; name: string; code: string; type: string; level: number; parent_id: string | null; address?: string }

function LocationsTab() {
  const { data, loading, refetch } = useApi<{ data: Loc[] }>('/api/locations?all=true')
  const allLocs = data?.data ?? []

  const [editingId, setEditingId] = useState<string | null>(null)
  const [showForm,  setShowForm]  = useState(false)
  const [form,      setForm]      = useState({ name: '', code: '', type: 'warehouse', address: '', parent_id: '' })
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState('')
  const [deleting,  setDeleting]  = useState<string | null>(null)
  const [deleteErr, setDeleteErr] = useState<Record<string, string>>({})

  const openAdd  = () => { setEditingId(null); setForm({ name: '', code: '', type: 'warehouse', address: '', parent_id: '' }); setError(''); setShowForm(true) }
  const openEdit = (l: Loc) => { setEditingId(l.id); setForm({ name: l.name, code: l.code, type: l.type, address: l.address ?? '', parent_id: l.parent_id ?? '' }); setError(''); setShowForm(true) }
  const cancel   = () => { setShowForm(false); setEditingId(null); setError('') }

  const handleNameChange = (v: string) => {
    setForm(f => ({ ...f, name: v, code: editingId ? f.code : v.toUpperCase().replace(/[^A-Z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/, '').slice(0, 12) }))
  }

  const save = async () => {
    if (!form.name.trim()) { setError('Name is required'); return }
    if (!form.code.trim()) { setError('Code is required'); return }
    setSaving(true); setError('')
    const url = editingId ? `/api/locations/${editingId}` : '/api/locations'
    const res = await fetch(url, { method: editingId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, code: form.code.toUpperCase(), parent_id: form.parent_id || null }) })
    const json = await res.json()
    setSaving(false)
    if (!res.ok) { setError(json.error ?? 'Failed to save'); return }
    setShowForm(false); setEditingId(null); refetch()
  }

  const del = async (id: string) => {
    setDeleting(id); setDeleteErr(e => ({ ...e, [id]: '' }))
    const res  = await fetch(`/api/locations/${id}`, { method: 'DELETE' })
    const json = await res.json()
    setDeleting(null)
    if (!res.ok) { setDeleteErr(e => ({ ...e, [id]: json.error ?? 'Failed' })); return }
    refetch()
  }

  const tree: Record<string, Loc[]> = {}
  allLocs.forEach(l => { const k = l.parent_id ?? '__root__'; if (!tree[k]) tree[k] = []; tree[k].push(l) })

  const renderRows = (parentId: string | null, depth: number): React.ReactNode => {
    const kids = tree[parentId ?? '__root__'] ?? []
    return kids.sort((a, b) => a.name.localeCompare(b.name)).map(l => {
      const Icon = locIcon[l.type] ?? MapPin
      const cc   = locColor[l.type] ?? locColor.other
      return (
        <div key={l.id}>
          <div className={cn('flex items-center gap-3 py-2.5 pr-3 rounded-lg hover:bg-slate-50 group', editingId === l.id && 'bg-indigo-50')} style={{ paddingLeft: `${12 + depth * 20}px` }}>
            <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0', cc)}>
              <Icon className="w-3.5 h-3.5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900">{l.name}</p>
              <p className="text-xs text-slate-400 font-mono">{l.code} · {l.type}</p>
              {deleteErr[l.id] && <p className="text-xs text-red-600 mt-0.5">{deleteErr[l.id]}</p>}
            </div>
            <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={() => openEdit(l)} className="p-1.5 rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"><Pencil className="w-3.5 h-3.5" /></button>
              <button onClick={() => del(l.id)} disabled={deleting === l.id} className="p-1.5 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 disabled:opacity-40">
                {deleting === l.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
          {renderRows(l.id, depth + 1)}
        </div>
      )
    })
  }

  return (
    <div className="space-y-4">
      <SectionHeader title="Locations" description="Warehouses, offices, rooms, and shelves. Nest them by selecting a parent." />
      <div className="flex gap-2">
        <Button size="sm" className="gap-1.5" onClick={openAdd}><Plus className="w-3.5 h-3.5" /> Add Location</Button>
        <ImportPanel config={{ entity: 'locations', label: 'Locations', required: ['name', 'code'], columns: ['name', 'code', 'type', 'address'] }} onImported={refetch} />
      </div>
      {showForm && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold text-slate-700">{editingId ? 'Edit Location' : 'New Location'}</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs font-medium text-slate-600 block mb-1">Name *</label>
              <Input value={form.name} onChange={e => handleNameChange(e.target.value)} placeholder="e.g. Main Warehouse" autoFocus />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Code *</label>
              <Input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="WH-MAIN" className="font-mono" maxLength={20} />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Type</label>
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                {LOC_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-xs font-medium text-slate-600 block mb-1">Parent Location <span className="font-normal text-slate-400">(optional)</span></label>
              <select value={form.parent_id} onChange={e => setForm(f => ({ ...f, parent_id: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                <option value="">— Top-level —</option>
                {allLocs.filter(l => l.id !== editingId).map(l => <option key={l.id} value={l.id}>{'  '.repeat(l.level)}{l.name} ({l.code})</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-xs font-medium text-slate-600 block mb-1">Address <span className="font-normal text-slate-400">(optional)</span></label>
              <Input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="Street address or site description" />
            </div>
          </div>
          {error && <ErrorBanner msg={error} />}
          <div className="flex gap-2 justify-end pt-1">
            <Button variant="outline" size="sm" onClick={cancel}>Cancel</Button>
            <Button size="sm" onClick={save} disabled={saving} className="gap-1.5">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              {editingId ? 'Save Changes' : 'Add Location'}
            </Button>
          </div>
        </div>
      )}
      <div className="border border-slate-100 rounded-xl overflow-hidden">
        {loading ? (
          <div className="space-y-1 p-3">{[1,2,3].map(i => <div key={i} className="h-10 bg-slate-100 rounded-lg animate-pulse" />)}</div>
        ) : allLocs.length === 0 ? (
          <div className="text-center py-10 text-slate-400"><MapPin className="w-8 h-8 mx-auto mb-2 opacity-30" /><p className="text-sm">No locations yet</p></div>
        ) : (
          <div className="p-2">{renderRows(null, 0)}</div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. CATEGORIES TAB
// ─────────────────────────────────────────────────────────────────────────────
const CAT_TYPES = [
  { value: 'inventory',   label: 'Product / Inventory' },
  { value: 'fixed_asset', label: 'Fixed Asset' },
  { value: 'both',        label: 'Both' },
]

function CategoriesTab() {
  const { data, loading, refetch } = useApi<{ data: any[] }>('/api/categories')
  const categories = data?.data ?? []

  const [showForm, setShowForm] = useState(false)
  const [editId,   setEditId]   = useState<string | null>(null)
  const [name,     setName]     = useState('')
  const [type,     setType]     = useState('inventory')
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')
  const [filter,   setFilter]   = useState<'all' | 'inventory' | 'fixed_asset'>('all')

  const openAdd  = () => { setEditId(null); setName(''); setType('inventory'); setError(''); setShowForm(true) }
  const openEdit = (c: any) => { setEditId(c.id); setName(c.name); setType(c.type); setError(''); setShowForm(true) }
  const cancel   = () => { setShowForm(false); setEditId(null); setError('') }

  const save = async () => {
    if (!name.trim()) { setError('Name is required'); return }
    setSaving(true); setError('')
    const url = editId ? `/api/categories/${editId}` : '/api/categories'
    const res = await fetch(url, { method: editId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim(), type }) })
    const json = await res.json()
    setSaving(false)
    if (!res.ok) { setError(json.error ?? 'Failed to save'); return }
    setShowForm(false); setEditId(null); refetch()
  }

  const del = async (id: string) => {
    if (!confirm('Delete this category? Items using it will become uncategorised.')) return
    await fetch(`/api/categories/${id}`, { method: 'DELETE' })
    refetch()
  }

  const filtered = categories.filter(c => filter === 'all' || c.type === filter || c.type === 'both')

  return (
    <div className="space-y-4">
      <SectionHeader title="Categories" description="Organise products and assets into categories for filtering and reports." />
      <div className="flex items-center gap-2 flex-wrap">
        <Button size="sm" className="gap-1.5" onClick={openAdd}><Plus className="w-3.5 h-3.5" /> Add Category</Button>
        <ImportPanel config={{ entity: 'categories', label: 'Categories', required: ['name'], columns: ['name', 'type'] }} onImported={refetch} />
        <div className="flex rounded-lg border border-slate-200 overflow-hidden">
          {(['all', 'inventory', 'fixed_asset'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} className={cn('px-3 py-1.5 text-xs font-medium transition-colors capitalize', filter === f ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50')}>
              {f === 'all' ? 'All' : f === 'inventory' ? 'Products' : 'Assets'}
            </button>
          ))}
        </div>
      </div>
      {showForm && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold text-slate-700">{editId ? 'Edit Category' : 'New Category'}</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Name *</label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Electronics, Furniture…" autoFocus />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Applies to</label>
              <select value={type} onChange={e => setType(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                {CAT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>
          {error && <ErrorBanner msg={error} />}
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={cancel}>Cancel</Button>
            <Button size="sm" onClick={save} disabled={saving} className="gap-1.5">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              {editId ? 'Save Changes' : 'Add Category'}
            </Button>
          </div>
        </div>
      )}
      <div className="border border-slate-100 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-3 space-y-2">{[1,2,3,4].map(i => <div key={i} className="h-10 bg-slate-100 rounded-lg animate-pulse" />)}</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-10 text-slate-400"><Tag className="w-8 h-8 mx-auto mb-2 opacity-30" /><p className="text-sm">No categories yet</p></div>
        ) : (
          <div className="divide-y divide-slate-50">
            {filtered.map((c: any) => (
              <div key={c.id} className={cn('flex items-center gap-3 px-4 py-3 hover:bg-slate-50 group', editId === c.id && 'bg-indigo-50')}>
                <div className="w-7 h-7 rounded-lg bg-indigo-50 flex items-center justify-center flex-shrink-0"><Tag className="w-3.5 h-3.5 text-indigo-500" /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900">{c.name}</p>
                  <p className="text-xs text-slate-400">{CAT_TYPES.find(t => t.value === c.type)?.label ?? c.type}</p>
                </div>
                <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => openEdit(c)} className="p-1.5 rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"><Pencil className="w-3.5 h-3.5" /></button>
                  <button onClick={() => del(c.id)} className="p-1.5 rounded text-slate-400 hover:text-red-500 hover:bg-red-50"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. COST CENTERS TAB
// ─────────────────────────────────────────────────────────────────────────────
function CostCentersTab() {
  const { data, loading, refetch } = useApi<{ data: any[] }>('/api/cost-centers')
  const centers = data?.data ?? []

  const [showForm, setShowForm] = useState(false)
  const [editId,   setEditId]   = useState<string | null>(null)
  const [code,     setCode]     = useState('')
  const [name,     setName]     = useState('')
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')

  const openAdd  = () => { setEditId(null); setCode(''); setName(''); setError(''); setShowForm(true) }
  const openEdit = (c: any) => { setEditId(c.id); setCode(c.code); setName(c.name); setError(''); setShowForm(true) }
  const cancel   = () => { setShowForm(false); setEditId(null); setError('') }

  const save = async () => {
    if (!code.trim()) { setError('Code is required'); return }
    if (!name.trim()) { setError('Name is required'); return }
    setSaving(true); setError('')
    const url = editId ? `/api/cost-centers/${editId}` : '/api/cost-centers'
    const res = await fetch(url, { method: editId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: code.trim().toUpperCase(), name: name.trim() }) })
    const json = await res.json()
    setSaving(false)
    if (!res.ok) { setError(json.error ?? 'Failed to save'); return }
    setShowForm(false); setEditId(null); refetch()
  }

  const toggle = async (c: any) => {
    await fetch(`/api/cost-centers/${c.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_active: !c.is_active }) })
    refetch()
  }

  return (
    <div className="space-y-4">
      <SectionHeader title="Cost Centers" description="Assign costs and expenses to departments or projects for reporting." />
      <div className="flex gap-2">
        <Button size="sm" className="gap-1.5" onClick={openAdd}><Plus className="w-3.5 h-3.5" /> Add Cost Center</Button>
        <ImportPanel config={{ entity: 'cost_centers', label: 'Cost Centers', required: ['code', 'name'], columns: ['code', 'name'] }} onImported={refetch} />
      </div>
      {showForm && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold text-slate-700">{editId ? 'Edit Cost Center' : 'New Cost Center'}</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Code *</label>
              <Input value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="e.g. OPS, MKT" className="font-mono" maxLength={10} autoFocus />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Name *</label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Operations" />
            </div>
          </div>
          {error && <ErrorBanner msg={error} />}
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={cancel}>Cancel</Button>
            <Button size="sm" onClick={save} disabled={saving} className="gap-1.5">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              {editId ? 'Save Changes' : 'Add Cost Center'}
            </Button>
          </div>
        </div>
      )}
      <div className="border border-slate-100 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-3 space-y-2">{[1,2,3].map(i => <div key={i} className="h-10 bg-slate-100 rounded-lg animate-pulse" />)}</div>
        ) : centers.length === 0 ? (
          <div className="text-center py-10 text-slate-400"><Briefcase className="w-8 h-8 mx-auto mb-2 opacity-30" /><p className="text-sm">No cost centers yet</p></div>
        ) : (
          <div className="divide-y divide-slate-50">
            {centers.map((c: any) => (
              <div key={c.id} className={cn('flex items-center gap-3 px-4 py-3 hover:bg-slate-50 group', !c.is_active && 'opacity-50', editId === c.id && 'bg-indigo-50')}>
                <span className="text-xs font-mono font-bold text-indigo-700 w-16 flex-shrink-0">{c.code}</span>
                <p className="flex-1 text-sm text-slate-800">{c.name}</p>
                <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => openEdit(c)} className="p-1.5 rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"><Pencil className="w-3.5 h-3.5" /></button>
                  <button onClick={() => toggle(c)} className={cn('p-1.5 rounded transition-colors', c.is_active ? 'text-green-600 hover:text-red-500 hover:bg-red-50' : 'text-slate-400 hover:text-green-600 hover:bg-green-50')}>
                    {c.is_active ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. JOB CODES TAB
// ─────────────────────────────────────────────────────────────────────────────
function JobCodesTab() {
  const { data, loading, error: loadErr, refetch } = useApi<{ data: any[] }>('/api/job-codes')
  const jobs = (data?.data ?? []).filter((j: any) => j.is_active !== false)

  const blank = { code: '', name: '', desc: '', billing_entity: '', address: '', contact_name: '', contact_phone: '', contact_email: '' }
  const [showForm, setShowForm] = useState(false)
  const [editId,   setEditId]   = useState<string | null>(null)
  const [form,     setForm]     = useState(blank)
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')

  const f = (k: keyof typeof blank) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(v => ({ ...v, [k]: e.target.value }))

  const openAdd  = () => { setEditId(null); setForm(blank); setError(''); setShowForm(true) }
  const openEdit = (j: any) => {
    setEditId(j.id)
    setForm({ code: j.code, name: j.name, desc: j.description ?? '', billing_entity: j.billing_entity ?? '', address: j.address ?? '', contact_name: j.contact_name ?? '', contact_phone: j.contact_phone ?? '', contact_email: j.contact_email ?? '' })
    setError(''); setShowForm(true)
  }
  const cancel = () => { setShowForm(false); setEditId(null); setError('') }

  const save = async () => {
    if (!form.code.trim()) { setError('Code is required'); return }
    if (!form.name.trim()) { setError('Name is required'); return }
    setSaving(true); setError('')
    const url = editId ? `/api/job-codes/${editId}` : '/api/job-codes'
    const res = await fetch(url, {
      method: editId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: form.code.trim(), name: form.name.trim(),
        description:    form.desc.trim()           || undefined,
        billing_entity: form.billing_entity.trim() || undefined,
        address:        form.address.trim()        || undefined,
        contact_name:   form.contact_name.trim()   || undefined,
        contact_phone:  form.contact_phone.trim()  || undefined,
        contact_email:  form.contact_email.trim()  || undefined,
      }),
    })
    const json = await res.json()
    setSaving(false)
    if (!res.ok) { setError(json.error ?? 'Failed to save'); return }
    setShowForm(false); setEditId(null); refetch()
  }

  const del = async (id: string) => {
    await fetch(`/api/job-codes/${id}`, { method: 'DELETE' })
    refetch()
  }

  const tablesMissing = loadErr?.includes('503') || loadErr?.includes('not found')

  return (
    <div className="space-y-4">
      <SectionHeader title="Job Codes" description="Tag purchase orders and transactions to specific projects or jobs for cost tracking." />

      {tablesMissing && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
          <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">One-time setup required</p>
            <p className="text-xs mt-1">Run <code className="bg-amber-100 px-1 rounded">scripts/migrate-job-codes.sql</code> then <code className="bg-amber-100 px-1 rounded">scripts/migrate-job-codes-billing.sql</code> in Supabase.</p>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <Button size="sm" className="gap-1.5" onClick={openAdd} disabled={tablesMissing}><Plus className="w-3.5 h-3.5" /> Add Job Code</Button>
        <ImportPanel config={{ entity: 'job_codes', label: 'Job Codes', required: ['code', 'name'], columns: ['code', 'name', 'description', 'billing_entity', 'contact_name', 'contact_phone', 'contact_email'] }} onImported={refetch} />
      </div>

      {showForm && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-4">
          <p className="text-xs font-semibold text-slate-700">{editId ? 'Edit Job Code' : 'New Job Code'}</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Code *</label>
              <Input value={form.code} onChange={f('code')} onBlur={e => setForm(v => ({ ...v, code: e.target.value.toUpperCase() }))} placeholder="JOB-001" className="font-mono" autoFocus />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Name *</label>
              <Input value={form.name} onChange={f('name')} placeholder="e.g. Building Renovation" />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-medium text-slate-600 block mb-1">Description <span className="font-normal text-slate-400">(optional)</span></label>
              <Input value={form.desc} onChange={f('desc')} placeholder="Brief description of this job or project" />
            </div>
          </div>
          <div className="border-t border-slate-200 pt-3 space-y-3">
            <p className="text-xs font-semibold text-slate-600">Billing Details</p>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Entity to Bill</label>
              <Input value={form.billing_entity} onChange={f('billing_entity')} placeholder="e.g. ABC Corporation Pte Ltd" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Billing Address</label>
              <Input value={form.address} onChange={f('address')} placeholder="Street, City, Country" />
            </div>
          </div>
          <div className="border-t border-slate-200 pt-3 space-y-3">
            <p className="text-xs font-semibold text-slate-600">Contact Person</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Name</label>
                <Input value={form.contact_name} onChange={f('contact_name')} placeholder="Full name" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Phone</label>
                <Input value={form.contact_phone} onChange={f('contact_phone')} placeholder="+65 9123 4567" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Email</label>
                <Input type="email" value={form.contact_email} onChange={f('contact_email')} placeholder="contact@client.com" />
              </div>
            </div>
          </div>
          {error && <ErrorBanner msg={error} />}
          <div className="flex gap-2 justify-end pt-1">
            <Button variant="outline" size="sm" onClick={cancel}>Cancel</Button>
            <Button size="sm" onClick={save} disabled={saving} className="gap-1.5">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              {editId ? 'Save Changes' : 'Add Job Code'}
            </Button>
          </div>
        </div>
      )}

      <div className="border border-slate-100 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-3 space-y-2">{[1,2,3].map(i => <div key={i} className="h-10 bg-slate-100 rounded-lg animate-pulse" />)}</div>
        ) : jobs.length === 0 && !tablesMissing ? (
          <div className="text-center py-10 text-slate-400"><Hash className="w-8 h-8 mx-auto mb-2 opacity-30" /><p className="text-sm">No job codes yet</p></div>
        ) : (
          <div className="divide-y divide-slate-50">
            {jobs.map((j: any) => (
              <div key={j.id} className={cn('flex items-center gap-3 px-4 py-3 hover:bg-slate-50 group', editId === j.id && 'bg-indigo-50')}>
                <span className="text-xs font-mono font-bold text-indigo-700 w-24 flex-shrink-0">{j.code}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900">{j.name}</p>
                  <div className="flex items-center gap-3 mt-0.5">
                    {j.billing_entity && <p className="text-xs text-slate-500 truncate">{j.billing_entity}</p>}
                    {j.contact_name   && <p className="text-xs text-slate-400 truncate">· {j.contact_name}</p>}
                    {j.description && !j.billing_entity && <p className="text-xs text-slate-400 truncate">{j.description}</p>}
                  </div>
                </div>
                <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => openEdit(j)} className="p-1.5 rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"><Pencil className="w-3.5 h-3.5" /></button>
                  <button onClick={() => del(j.id)} className="p-1.5 rounded text-slate-400 hover:text-red-500 hover:bg-red-50"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. VENDORS TAB
// ─────────────────────────────────────────────────────────────────────────────
function VendorsTab() {
  const { data, loading, refetch } = useApi<{ data: any[] }>('/api/suppliers')
  const vendors = data?.data ?? []

  const blank = { name: '', contact_name: '', email: '', phone: '', address: '', payment_terms: '', lead_time_days: '', over_receipt_tolerance_pct: '', notes: '' }
  const [showForm, setShowForm] = useState(false)
  const [editId,   setEditId]   = useState<string | null>(null)
  const [form,     setForm]     = useState(blank)
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')

  const f = (k: keyof typeof blank) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(v => ({ ...v, [k]: e.target.value }))

  const openAdd  = () => { setEditId(null); setForm(blank); setError(''); setShowForm(true) }
  const openEdit = (v: any) => {
    setEditId(v.id)
    setForm({ name: v.name ?? '', contact_name: v.contact_name ?? '', email: v.email ?? '', phone: v.phone ?? '', address: v.address ?? '', payment_terms: v.payment_terms ?? '', lead_time_days: String(v.lead_time_days ?? ''), over_receipt_tolerance_pct: String(v.over_receipt_tolerance_pct ?? ''), notes: v.notes ?? '' })
    setError(''); setShowForm(true)
  }
  const cancel = () => { setShowForm(false); setEditId(null); setError('') }

  const save = async () => {
    if (!form.name.trim()) { setError('Name is required'); return }
    setSaving(true); setError('')
    const url = editId ? `/api/suppliers/${editId}` : '/api/suppliers'
    const res = await fetch(url, {
      method: editId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name.trim(),
        contact_name:   form.contact_name.trim()   || null,
        email:          form.email.trim()           || null,
        phone:          form.phone.trim()           || null,
        address:        form.address.trim()         || null,
        payment_terms:  form.payment_terms.trim()   || null,
        lead_time_days: form.lead_time_days ? Number(form.lead_time_days) : null,
        over_receipt_tolerance_pct: form.over_receipt_tolerance_pct ? Number(form.over_receipt_tolerance_pct) : 0,
        notes:          form.notes.trim()           || null,
      }),
    })
    const json = await res.json()
    setSaving(false)
    if (!res.ok) { setError(json.error ?? 'Failed to save'); return }
    setShowForm(false); setEditId(null); refetch()
  }

  const del = async (id: string) => {
    if (!confirm('Delete this vendor?')) return
    await fetch(`/api/suppliers/${id}`, { method: 'DELETE' })
    refetch()
  }

  return (
    <div className="space-y-4">
      <SectionHeader title="Vendors / Suppliers" description="Manage your suppliers and import them in bulk via CSV or Excel." />
      <div className="flex gap-2">
        <Button size="sm" className="gap-1.5" onClick={openAdd}><Plus className="w-3.5 h-3.5" /> Add Vendor</Button>
        <ImportPanel config={{ entity: 'suppliers', label: 'Vendors', required: ['name'], columns: ['name', 'contact_name', 'email', 'phone', 'address', 'payment_terms', 'lead_time_days', 'notes'] }} onImported={refetch} />
      </div>
      {showForm && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold text-slate-700">{editId ? 'Edit Vendor' : 'New Vendor'}</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs font-medium text-slate-600 block mb-1">Company Name *</label>
              <Input value={form.name} onChange={f('name')} placeholder="e.g. Acme Corp" autoFocus />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Contact Person</label>
              <Input value={form.contact_name} onChange={f('contact_name')} placeholder="Full name" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Email</label>
              <Input type="email" value={form.email} onChange={f('email')} placeholder="vendor@company.com" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Phone</label>
              <Input value={form.phone} onChange={f('phone')} placeholder="+65 9123 4567" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Payment Terms</label>
              <Input value={form.payment_terms} onChange={f('payment_terms')} placeholder="e.g. Net 30" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Lead Time (days)</label>
              <Input type="number" value={form.lead_time_days} onChange={f('lead_time_days')} placeholder="7" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Over-Receipt Tolerance (%)</label>
              <Input type="number" value={form.over_receipt_tolerance_pct} onChange={f('over_receipt_tolerance_pct')} placeholder="0" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Address</label>
              <Input value={form.address} onChange={f('address')} placeholder="Street, City" />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-medium text-slate-600 block mb-1">Notes</label>
              <Input value={form.notes} onChange={f('notes')} placeholder="Any additional info" />
            </div>
          </div>
          {error && <ErrorBanner msg={error} />}
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={cancel}>Cancel</Button>
            <Button size="sm" onClick={save} disabled={saving} className="gap-1.5">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              {editId ? 'Save Changes' : 'Add Vendor'}
            </Button>
          </div>
        </div>
      )}
      <div className="border border-slate-100 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-3 space-y-2">{[1,2,3].map(i => <div key={i} className="h-10 bg-slate-100 rounded-lg animate-pulse" />)}</div>
        ) : vendors.length === 0 ? (
          <div className="text-center py-10 text-slate-400"><Truck className="w-8 h-8 mx-auto mb-2 opacity-30" /><p className="text-sm">No vendors yet</p></div>
        ) : (
          <div className="divide-y divide-slate-50">
            {vendors.map((v: any) => (
              <div key={v.id} className={cn('flex items-center gap-3 px-4 py-3 hover:bg-slate-50 group', editId === v.id && 'bg-indigo-50')}>
                <div className="w-7 h-7 rounded-lg bg-orange-50 flex items-center justify-center flex-shrink-0"><Truck className="w-3.5 h-3.5 text-orange-500" /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900">{v.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {v.contact_name && <p className="text-xs text-slate-500">{v.contact_name}</p>}
                    {v.email && <p className="text-xs text-slate-400">· {v.email}</p>}
                    {v.payment_terms && <p className="text-xs text-slate-400">· {v.payment_terms}</p>}
                  </div>
                </div>
                <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => openEdit(v)} className="p-1.5 rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"><Pencil className="w-3.5 h-3.5" /></button>
                  <button onClick={() => del(v.id)} className="p-1.5 rounded text-slate-400 hover:text-red-500 hover:bg-red-50"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. PRODUCTS (INVENTORY) TAB
// ─────────────────────────────────────────────────────────────────────────────
function ProductsTab() {
  const { data, loading, refetch } = useApi<{ data: any[] }>('/api/products?limit=200')
  const products = data?.data ?? []

  const blank = { name: '', sku: '', barcode: '', unit_of_measure: 'pcs', reorder_point: '', description: '' }
  const [showForm, setShowForm] = useState(false)
  const [editId,   setEditId]   = useState<string | null>(null)
  const [form,     setForm]     = useState(blank)
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')

  const f = (k: keyof typeof blank) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm(v => ({ ...v, [k]: e.target.value }))

  const openAdd  = () => { setEditId(null); setForm(blank); setError(''); setShowForm(true) }
  const openEdit = (p: any) => {
    setEditId(p.id)
    setForm({ name: p.name ?? '', sku: p.sku ?? '', barcode: p.barcode ?? '', unit_of_measure: p.unit_of_measure ?? 'pcs', reorder_point: String(p.reorder_point ?? ''), description: p.description ?? '' })
    setError(''); setShowForm(true)
  }
  const cancel = () => { setShowForm(false); setEditId(null); setError('') }

  const save = async () => {
    if (!form.name.trim()) { setError('Name is required'); return }
    setSaving(true); setError('')
    const url = editId ? `/api/products/${editId}` : '/api/products'
    const res = await fetch(url, {
      method: editId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name.trim(),
        sku:             form.sku.trim()         || null,
        barcode:         form.barcode.trim()      || null,
        unit_of_measure: form.unit_of_measure,
        reorder_point:   form.reorder_point ? Number(form.reorder_point) : 0,
        description:     form.description.trim()  || null,
      }),
    })
    const json = await res.json()
    setSaving(false)
    if (!res.ok) { setError(json.error ?? 'Failed to save'); return }
    setShowForm(false); setEditId(null); refetch()
  }

  return (
    <div className="space-y-4">
      <SectionHeader title="Products / Inventory" description="Bulk-import your product catalog or add items one at a time." />
      <div className="flex gap-2">
        <Button size="sm" className="gap-1.5" onClick={openAdd}><Plus className="w-3.5 h-3.5" /> Add Product</Button>
        <ImportPanel config={{ entity: 'products', label: 'Products', required: ['name'], columns: ['name', 'sku', 'barcode', 'unit_of_measure', 'reorder_point', 'description'] }} onImported={refetch} />
      </div>
      {showForm && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold text-slate-700">{editId ? 'Edit Product' : 'New Product'}</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs font-medium text-slate-600 block mb-1">Product Name *</label>
              <Input value={form.name} onChange={f('name')} placeholder="e.g. WD-40 Spray" autoFocus />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">SKU</label>
              <Input value={form.sku} onChange={f('sku')} placeholder="WD40-350ML" className="font-mono" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Barcode</label>
              <Input value={form.barcode} onChange={f('barcode')} placeholder="4901234567890" className="font-mono" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Unit of Measure</label>
              <select value={form.unit_of_measure} onChange={f('unit_of_measure')} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                {['pcs', 'kg', 'g', 'lbs', 'oz', 'liters', 'ml', 'meters', 'ft', 'box', 'pack', 'roll', 'set', 'pair'].map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Reorder Point</label>
              <Input type="number" value={form.reorder_point} onChange={f('reorder_point')} placeholder="10" />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-medium text-slate-600 block mb-1">Description</label>
              <Input value={form.description} onChange={f('description')} placeholder="Brief product description" />
            </div>
          </div>
          {error && <ErrorBanner msg={error} />}
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={cancel}>Cancel</Button>
            <Button size="sm" onClick={save} disabled={saving} className="gap-1.5">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              {editId ? 'Save Changes' : 'Add Product'}
            </Button>
          </div>
        </div>
      )}
      <div className="border border-slate-100 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-3 space-y-2">{[1,2,3].map(i => <div key={i} className="h-10 bg-slate-100 rounded-lg animate-pulse" />)}</div>
        ) : products.length === 0 ? (
          <div className="text-center py-10 text-slate-400"><Boxes className="w-8 h-8 mx-auto mb-2 opacity-30" /><p className="text-sm">No products yet</p></div>
        ) : (
          <div className="divide-y divide-slate-50">
            {products.slice(0, 50).map((p: any) => (
              <div key={p.id} className={cn('flex items-center gap-3 px-4 py-3 hover:bg-slate-50 group', editId === p.id && 'bg-indigo-50')}>
                <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0"><Boxes className="w-3.5 h-3.5 text-blue-500" /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900">{p.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {p.sku && <p className="text-xs text-slate-500 font-mono">{p.sku}</p>}
                    {p.unit_of_measure && <p className="text-xs text-slate-400">· {p.unit_of_measure}</p>}
                    {p.reorder_point > 0 && <p className="text-xs text-slate-400">· reorder @ {p.reorder_point}</p>}
                  </div>
                </div>
                <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => openEdit(p)} className="p-1.5 rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"><Pencil className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            ))}
            {products.length > 50 && (
              <p className="text-xs text-slate-400 text-center py-2">Showing 50 of {products.length} — use Inventory page for full list</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. FIXED ASSETS TAB
// ─────────────────────────────────────────────────────────────────────────────
function AssetsTab() {
  const { data, loading, refetch } = useApi<{ data: any[] }>('/api/assets?limit=200')
  const assets = data?.data ?? []

  const blank = { name: '', asset_tag: '', serial_number: '', purchase_cost: '', purchase_date: '', useful_life_years: '', depreciation_method: 'straight_line', status: 'active', notes: '' }
  const [showForm, setShowForm] = useState(false)
  const [editId,   setEditId]   = useState<string | null>(null)
  const [form,     setForm]     = useState(blank)
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')

  const f = (k: keyof typeof blank) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm(v => ({ ...v, [k]: e.target.value }))

  const openAdd  = () => { setEditId(null); setForm(blank); setError(''); setShowForm(true) }
  const openEdit = (a: any) => {
    setEditId(a.id)
    setForm({ name: a.name ?? '', asset_tag: a.asset_tag ?? '', serial_number: a.serial_number ?? '', purchase_cost: String(a.purchase_cost ?? ''), purchase_date: a.purchase_date ?? '', useful_life_years: String(a.useful_life_years ?? ''), depreciation_method: a.depreciation_method ?? 'straight_line', status: a.status ?? 'active', notes: a.notes ?? '' })
    setError(''); setShowForm(true)
  }
  const cancel = () => { setShowForm(false); setEditId(null); setError('') }

  const save = async () => {
    if (!form.name.trim()) { setError('Name is required'); return }
    if (!form.asset_tag.trim()) { setError('Asset tag is required'); return }
    setSaving(true); setError('')
    const url = editId ? `/api/assets/${editId}` : '/api/assets'
    const res = await fetch(url, {
      method: editId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name.trim(),
        asset_tag:           form.asset_tag.trim(),
        serial_number:       form.serial_number.trim()  || null,
        purchase_cost:       form.purchase_cost ? Number(form.purchase_cost) : 0,
        purchase_date:       form.purchase_date          || null,
        useful_life_years:   form.useful_life_years ? Number(form.useful_life_years) : null,
        depreciation_method: form.depreciation_method,
        status:              form.status,
        notes:               form.notes.trim()           || null,
      }),
    })
    const json = await res.json()
    setSaving(false)
    if (!res.ok) { setError(json.error ?? 'Failed to save'); return }
    setShowForm(false); setEditId(null); refetch()
  }

  const statusColor: Record<string, string> = { active: 'text-green-600 bg-green-50', maintenance: 'text-amber-600 bg-amber-50', retired: 'text-slate-500 bg-slate-100', disposed: 'text-red-600 bg-red-50' }

  return (
    <div className="space-y-4">
      <SectionHeader title="Fixed Assets" description="Import your asset register or add assets individually." />
      <div className="flex gap-2">
        <Button size="sm" className="gap-1.5" onClick={openAdd}><Plus className="w-3.5 h-3.5" /> Add Asset</Button>
        <ImportPanel config={{ entity: 'assets', label: 'Fixed Assets', required: ['name', 'asset_tag'], columns: ['name', 'asset_tag', 'serial_number', 'purchase_cost', 'purchase_date', 'useful_life_years', 'depreciation_method', 'status', 'notes'] }} onImported={refetch} />
      </div>
      {showForm && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold text-slate-700">{editId ? 'Edit Asset' : 'New Asset'}</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs font-medium text-slate-600 block mb-1">Asset Name *</label>
              <Input value={form.name} onChange={f('name')} placeholder="e.g. Dell XPS Laptop" autoFocus />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Asset Tag *</label>
              <Input value={form.asset_tag} onChange={f('asset_tag')} placeholder="LAP-001" className="font-mono" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Serial Number</label>
              <Input value={form.serial_number} onChange={f('serial_number')} placeholder="SN12345" className="font-mono" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Purchase Cost</label>
              <Input type="number" value={form.purchase_cost} onChange={f('purchase_cost')} placeholder="1200.00" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Purchase Date</label>
              <Input type="date" value={form.purchase_date} onChange={f('purchase_date')} />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Useful Life (years)</label>
              <Input type="number" value={form.useful_life_years} onChange={f('useful_life_years')} placeholder="5" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Depreciation Method</label>
              <select value={form.depreciation_method} onChange={f('depreciation_method')} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                <option value="straight_line">Straight Line</option>
                <option value="declining_balance">Declining Balance</option>
                <option value="double_declining">Double Declining</option>
                <option value="units_of_production">Units of Production</option>
                <option value="none">None</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Status</label>
              <select value={form.status} onChange={f('status')} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                <option value="active">Active</option>
                <option value="maintenance">Maintenance</option>
                <option value="retired">Retired</option>
                <option value="disposed">Disposed</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-xs font-medium text-slate-600 block mb-1">Notes</label>
              <Input value={form.notes} onChange={f('notes')} placeholder="Any additional info" />
            </div>
          </div>
          {error && <ErrorBanner msg={error} />}
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={cancel}>Cancel</Button>
            <Button size="sm" onClick={save} disabled={saving} className="gap-1.5">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              {editId ? 'Save Changes' : 'Add Asset'}
            </Button>
          </div>
        </div>
      )}
      <div className="border border-slate-100 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-3 space-y-2">{[1,2,3].map(i => <div key={i} className="h-10 bg-slate-100 rounded-lg animate-pulse" />)}</div>
        ) : assets.length === 0 ? (
          <div className="text-center py-10 text-slate-400"><Building2 className="w-8 h-8 mx-auto mb-2 opacity-30" /><p className="text-sm">No fixed assets yet</p></div>
        ) : (
          <div className="divide-y divide-slate-50">
            {assets.slice(0, 50).map((a: any) => (
              <div key={a.id} className={cn('flex items-center gap-3 px-4 py-3 hover:bg-slate-50 group', editId === a.id && 'bg-indigo-50')}>
                <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0"><Building2 className="w-3.5 h-3.5 text-emerald-500" /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900">{a.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className="text-xs text-slate-500 font-mono">{a.asset_tag}</p>
                    {a.purchase_cost > 0 && <p className="text-xs text-slate-400">· ${Number(a.purchase_cost).toLocaleString()}</p>}
                    <span className={cn('text-xs px-1.5 py-0.5 rounded-full font-medium', statusColor[a.status] ?? 'text-slate-500 bg-slate-100')}>{a.status}</span>
                  </div>
                </div>
                <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => openEdit(a)} className="p-1.5 rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"><Pencil className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            ))}
            {assets.length > 50 && (
              <p className="text-xs text-slate-400 text-center py-2">Showing 50 of {assets.length} — use Fixed Assets page for full list</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'start',        label: 'Start here',   icon: Sparkles   },
  { id: 'locations',    label: 'Locations',    icon: MapPin     },
  { id: 'categories',   label: 'Categories',   icon: Tag        },
  { id: 'vendors',      label: 'Vendors',      icon: Truck      },
  { id: 'products',     label: 'Products',     icon: Boxes      },
  { id: 'assets',       label: 'Fixed Assets', icon: Building2  },
  { id: 'cost-centers', label: 'Cost Centers', icon: Briefcase  },
  { id: 'job-codes',    label: 'Job Codes',    icon: Hash       },
]

function SetupInner() {
  const searchParams = useSearchParams()
  const tabParam = searchParams.get('tab') ?? ''
  const [active, setActive] = useState(TABS.some(t => t.id === tabParam) ? tabParam : 'start')
  const [bannerDismissed, setBannerDismissed] = useState(false)

  const { data: orgData } = useApi<{ data: any }>('/api/organization')
  const createdAt   = orgData?.data?.created_at ? new Date(orgData.data.created_at) : null
  const daysSince   = createdAt ? Math.floor((Date.now() - createdAt.getTime()) / 86_400_000) : 999
  const inSetupWindow = daysSince <= 30

  return (
    <div>
      <Topbar title="Setup & Import" />
      <div className="p-6 max-w-3xl">

        {/* 30-day onboarding banner */}
        {inSetupWindow && !bannerDismissed && active !== 'start' && (
          <div className="mb-6 flex items-start gap-3 p-4 bg-indigo-50 border border-indigo-100 rounded-xl">
            <Sparkles className="w-5 h-5 text-indigo-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-indigo-900">Get set up quickly — {30 - daysSince} days left in your setup window</p>
              <p className="text-xs text-indigo-600 mt-0.5">
                Use the <strong>Import from CSV/Excel</strong> button on each tab to bulk-upload your vendors, products, assets, locations, categories, and more.
              </p>
            </div>
            <button onClick={() => setBannerDismissed(true)} className="text-indigo-400 hover:text-indigo-600 flex-shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Tab bar */}
        <div className="flex gap-1 mb-6 border-b border-slate-100 overflow-x-auto">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setActive(t.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap',
                active === t.id
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              )}
            >
              <t.icon className="w-4 h-4" />
              {t.label}
            </button>
          ))}
        </div>

        {active === 'start'        && <GettingStartedGuide />}
        {active === 'locations'    && <LocationsTab />}
        {active === 'categories'   && <CategoriesTab />}
        {active === 'vendors'      && <VendorsTab />}
        {active === 'products'     && <ProductsTab />}
        {active === 'assets'       && <AssetsTab />}
        {active === 'cost-centers' && <CostCentersTab />}
        {active === 'job-codes'    && <JobCodesTab />}
      </div>
    </div>
  )
}

export default function SetupPage() {
  return <Suspense><SetupInner /></Suspense>
}
