'use client'

import { useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Topbar } from '@/components/layout/topbar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useApi } from '@/lib/use-api'
import { cn } from '@/lib/utils'
import {
  MapPin, Tag, Briefcase, Hash,
  Plus, Pencil, Trash2, Loader2, AlertCircle, CheckCircle2,
  X, Archive, BookOpen, Package, Layers, ChevronRight, ChevronDown,
  ToggleLeft, ToggleRight, Info,
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
// 1. LOCATIONS TAB
// ─────────────────────────────────────────────────────────────────────────────
const LOC_TYPES = ['warehouse', 'office', 'store', 'room', 'shelf', 'other'] as const
const locIcon: Record<string, any> = { warehouse: Archive, office: BookOpen, store: Package, room: Layers, shelf: Layers, other: MapPin }
const locColor: Record<string, string> = {
  warehouse: 'bg-blue-50 text-blue-600', office: 'bg-purple-50 text-purple-600',
  store: 'bg-green-50 text-green-600',   room: 'bg-orange-50 text-orange-600',
  shelf: 'bg-slate-100 text-slate-500',  other: 'bg-slate-100 text-slate-500',
}

interface Loc { id: string; name: string; code: string; type: string; level: number; parent_id: string | null; address?: string }

function LocationsTab() {
  const { data, loading, refetch } = useApi<{ data: Loc[] }>('/api/locations?all=true')
  const allLocs = data?.data ?? []

  const [editingId, setEditingId]  = useState<string | null>(null)
  const [showForm,  setShowForm]   = useState(false)
  const [form,      setForm]       = useState({ name: '', code: '', type: 'warehouse', address: '', parent_id: '' })
  const [saving,    setSaving]     = useState(false)
  const [error,     setError]      = useState('')
  const [deleting,  setDeleting]   = useState<string | null>(null)
  const [deleteErr, setDeleteErr]  = useState<Record<string, string>>({})

  const openAdd = () => { setEditingId(null); setForm({ name: '', code: '', type: 'warehouse', address: '', parent_id: '' }); setError(''); setShowForm(true) }
  const openEdit = (l: Loc) => { setEditingId(l.id); setForm({ name: l.name, code: l.code, type: l.type, address: l.address ?? '', parent_id: l.parent_id ?? '' }); setError(''); setShowForm(true) }
  const cancel = () => { setShowForm(false); setEditingId(null); setError('') }

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
    const res = await fetch(`/api/locations/${id}`, { method: 'DELETE' })
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

      <Button size="sm" className="gap-1.5" onClick={openAdd}><Plus className="w-3.5 h-3.5" /> Add Location</Button>

      {/* Form */}
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

      {/* Tree list */}
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

  const openAdd = () => { setEditId(null); setName(''); setType('inventory'); setError(''); setShowForm(true) }
  const openEdit = (c: any) => { setEditId(c.id); setName(c.name); setType(c.type); setError(''); setShowForm(true) }
  const cancel = () => { setShowForm(false); setEditId(null); setError('') }

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

      <div className="flex items-center gap-3">
        <Button size="sm" className="gap-1.5" onClick={openAdd}><Plus className="w-3.5 h-3.5" /> Add Category</Button>
        <div className="flex rounded-lg border border-slate-200 overflow-hidden">
          {(['all', 'inventory', 'fixed_asset'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} className={cn('px-3 py-1.5 text-xs font-medium transition-colors capitalize', filter === f ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50')}>
              {f === 'all' ? 'All' : f === 'inventory' ? 'Products' : 'Assets'}
            </button>
          ))}
        </div>
      </div>

      {/* Form */}
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

      {/* List */}
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

  const openAdd = () => { setEditId(null); setCode(''); setName(''); setError(''); setShowForm(true) }
  const openEdit = (c: any) => { setEditId(c.id); setCode(c.code); setName(c.name); setError(''); setShowForm(true) }
  const cancel = () => { setShowForm(false); setEditId(null); setError('') }

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

      <Button size="sm" className="gap-1.5" onClick={openAdd}><Plus className="w-3.5 h-3.5" /> Add Cost Center</Button>

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
                  <button onClick={() => toggle(c)} className={cn('p-1.5 rounded text-xs font-medium transition-colors', c.is_active ? 'text-green-600 hover:text-red-500 hover:bg-red-50' : 'text-slate-400 hover:text-green-600 hover:bg-green-50')}>
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

      <Button size="sm" className="gap-1.5" onClick={openAdd} disabled={tablesMissing}><Plus className="w-3.5 h-3.5" /> Add Job Code</Button>

      {showForm && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-4">
          <p className="text-xs font-semibold text-slate-700">{editId ? 'Edit Job Code' : 'New Job Code'}</p>

          {/* Job identity */}
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

          {/* Billing */}
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

          {/* Contact */}
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
// Page
// ─────────────────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'locations',   label: 'Locations',    icon: MapPin     },
  { id: 'categories',  label: 'Categories',   icon: Tag        },
  { id: 'cost-centers',label: 'Cost Centers', icon: Briefcase  },
  { id: 'job-codes',   label: 'Job Codes',    icon: Hash       },
]

function SetupInner() {
  const searchParams = useSearchParams()
  const tabParam = searchParams.get('tab') ?? ''
  const [active, setActive] = useState(TABS.some(t => t.id === tabParam) ? tabParam : 'locations')

  return (
    <div>
      <Topbar title="Setup" />
      <div className="p-6 max-w-3xl">

        {/* Tab bar */}
        <div className="flex gap-1 mb-6 border-b border-slate-100">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setActive(t.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px',
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

        {active === 'locations'    && <LocationsTab />}
        {active === 'categories'   && <CategoriesTab />}
        {active === 'cost-centers' && <CostCentersTab />}
        {active === 'job-codes'    && <JobCodesTab />}
      </div>
    </div>
  )
}

export default function SetupPage() {
  return <Suspense><SetupInner /></Suspense>
}
