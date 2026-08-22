'use client'

import { useState } from 'react'
import { Topbar } from '@/components/layout/topbar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useApi } from '@/lib/use-api'
import { Supplier } from '@/types'
import { Search, Plus, Building, Phone, Mail, Clock, Pencil, X, Check } from 'lucide-react'

// ── Create / Edit Form ────────────────────────────────────────────────────────
function SupplierForm({
  initial,
  onClose,
  onSaved,
}: {
  initial?: Supplier
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    name:          initial?.name ?? '',
    contact_name:  initial?.contact_name ?? '',
    email:         initial?.email ?? '',
    phone:         initial?.phone ?? '',
    lead_time_days: initial?.lead_time_days ?? 7,
    payment_terms: initial?.payment_terms ?? '',
    notes:         initial?.notes ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  const isEdit = !!initial

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) { setError('Name is required'); return }
    setSaving(true)
    setError('')
    try {
      const res = await fetch(
        isEdit ? `/api/suppliers/${initial!.id}` : '/api/suppliers',
        {
          method:  isEdit ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(form),
        }
      )
      if (!res.ok) {
        const j = await res.json()
        setError(j.error ?? 'Failed to save')
        return
      }
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  const field = (label: string, key: keyof typeof form, type = 'text') => (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      <Input
        type={type}
        value={String(form[key])}
        onChange={e => setForm(f => ({ ...f, [key]: type === 'number' ? Number(e.target.value) : e.target.value }))}
      />
    </div>
  )

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base">{isEdit ? 'Edit Vendor' : 'New Vendor'}</CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="w-4 h-4" /></Button>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-3">
            {field('Vendor Name *', 'name')}
            <div className="grid grid-cols-2 gap-3">
              {field('Contact Name', 'contact_name')}
              {field('Email', 'email', 'email')}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {field('Phone', 'phone')}
              {field('Lead Time (days)', 'lead_time_days', 'number')}
            </div>
            {field('Payment Terms', 'payment_terms')}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
              <textarea
                className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
                rows={3}
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              />
            </div>
            {error && <p className="text-red-500 text-xs">{error}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? 'Saving…' : (isEdit ? 'Save Changes' : 'Create Vendor')}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function SuppliersPage() {
  const [search, setSearch]         = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [showForm, setShowForm]     = useState(false)
  const [editing, setEditing]       = useState<Supplier | null>(null)

  const url = `/api/suppliers?active=${!showInactive}`
  const { data, loading, error, refetch } = useApi<{ data: Supplier[] }>(url)
  const suppliers = data?.data ?? []

  const filtered = suppliers.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    (s.contact_name ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (s.email ?? '').toLowerCase().includes(search.toLowerCase())
  )

  function handleSaved() {
    setShowForm(false)
    setEditing(null)
    refetch()
  }

  async function toggleActive(s: Supplier) {
    await fetch(`/api/suppliers/${s.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !s.is_active }),
    })
    refetch()
  }

  return (
    <div>
      <Topbar title="Vendors" />
      <div className="p-6 space-y-4">

        {/* Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-1">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input placeholder="Search vendors…" className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <Button
              size="sm" variant={showInactive ? 'default' : 'outline'}
              onClick={() => setShowInactive(v => !v)}
              className="text-xs"
            >
              {showInactive ? 'Showing All' : 'Active Only'}
            </Button>
          </div>
          <Button onClick={() => setShowForm(true)} className="gap-2">
            <Plus className="w-4 h-4" /> Add Vendor
          </Button>
        </div>

        {error && <p className="text-red-500 text-sm">{error}</p>}

        {/* Supplier cards */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-40 rounded-xl bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <Building className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">No vendors yet</p>
            <p className="text-xs mt-1">Add your first vendor to link it to products and purchase orders.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map(s => (
              <Card key={s.id} className={`hover:shadow-md transition-shadow ${!s.is_active ? 'opacity-60' : ''}`}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center flex-shrink-0">
                        <Building className="w-4 h-4 text-indigo-600" />
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900 text-sm leading-tight">{s.name}</p>
                        {s.contact_name && <p className="text-xs text-slate-400">{s.contact_name}</p>}
                      </div>
                    </div>
                    <Badge variant={s.is_active ? 'success' : 'secondary'}>
                      {s.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>

                  <div className="space-y-1.5 mb-4">
                    {s.email && (
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <Mail className="w-3.5 h-3.5" />{s.email}
                      </div>
                    )}
                    {s.phone && (
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <Phone className="w-3.5 h-3.5" />{s.phone}
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <Clock className="w-3.5 h-3.5" />
                      <span><strong>{s.lead_time_days}d</strong> lead time</span>
                      {s.payment_terms && <span className="text-slate-300">·</span>}
                      {s.payment_terms && <span>{s.payment_terms}</span>}
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 border-t border-slate-50 pt-3">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(s)} className="gap-1 text-xs h-7">
                      <Pencil className="w-3 h-3" /> Edit
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => toggleActive(s)} className="gap-1 text-xs h-7">
                      {s.is_active
                        ? <><X className="w-3 h-3" /> Deactivate</>
                        : <><Check className="w-3 h-3" /> Activate</>
                      }
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {(showForm || editing) && (
        <SupplierForm
          initial={editing ?? undefined}
          onClose={() => { setShowForm(false); setEditing(null) }}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}
