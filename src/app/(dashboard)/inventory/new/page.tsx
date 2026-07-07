'use client'

import { useState, useRef } from 'react'
import { useApi } from '@/lib/use-api'
import { Topbar } from '@/components/layout/topbar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useRouter } from 'next/navigation'
import { Plus, X, Tag, Loader2, CheckCircle2 } from 'lucide-react'

// ── Common attribute shortcuts ────────────────────────────────────────────────
const QUICK_ATTRS = [
  'Size', 'Color', 'Brand', 'Flavor', 'Variant',
  'Weight', 'Volume', 'Material', 'Style', 'Grade',
]

interface AttrRow { key: string; value: string }

function AttributeBuilder({
  attrs, onChange,
}: {
  attrs: AttrRow[]
  onChange: (attrs: AttrRow[]) => void
}) {
  const addAttr = (key = '') =>
    onChange([...attrs, { key, value: '' }])

  const removeAttr = (i: number) =>
    onChange(attrs.filter((_, idx) => idx !== i))

  const updateAttr = (i: number, field: 'key' | 'value', val: string) => {
    const next = [...attrs]
    next[i] = { ...next[i], [field]: val }
    onChange(next)
  }

  // Keys already added (to dim quick-add buttons)
  const usedKeys = new Set(attrs.map(a => a.key.toLowerCase()))

  return (
    <div className="space-y-3">
      {/* Quick-add chips */}
      <div className="flex flex-wrap gap-1.5">
        {QUICK_ATTRS.map(attr => (
          <button
            key={attr}
            type="button"
            onClick={() => addAttr(attr)}
            className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border transition-colors ${
              usedKeys.has(attr.toLowerCase())
                ? 'border-indigo-300 bg-indigo-50 text-indigo-600'
                : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-600'
            }`}
          >
            <Tag className="w-3 h-3" />
            {attr}
          </button>
        ))}
        <button
          type="button"
          onClick={() => addAttr('')}
          className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border border-dashed border-slate-300 text-slate-400 hover:border-slate-400 hover:text-slate-600 transition-colors"
        >
          <Plus className="w-3 h-3" /> Custom
        </button>
      </div>

      {/* Attribute rows */}
      {attrs.length > 0 && (
        <div className="space-y-2">
          {attrs.map((attr, i) => (
            <div key={i} className="flex gap-2 items-center">
              <Input
                placeholder="Attribute (e.g. Size)"
                value={attr.key}
                onChange={e => updateAttr(i, 'key', e.target.value)}
                className="flex-1"
              />
              <span className="text-slate-300 font-medium">:</span>
              <Input
                placeholder="Value (e.g. Medium)"
                value={attr.value}
                onChange={e => updateAttr(i, 'value', e.target.value)}
                className="flex-1"
              />
              <button
                type="button"
                onClick={() => removeAttr(i)}
                className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors flex-shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {attrs.length === 0 && (
        <p className="text-xs text-slate-400">
          Click a tag above to add an attribute, or use Custom for anything else.
        </p>
      )}
    </div>
  )
}

// ── Category selector with inline create ─────────────────────────────────────
function CategorySelector({
  value, onChange, categories, onCategoryCreated,
}: {
  value:              string
  onChange:           (id: string) => void
  categories:         any[]
  onCategoryCreated:  (cat: { id: string; name: string }) => void
}) {
  const [adding,    setAdding]    = useState(false)
  const [newName,   setNewName]   = useState('')
  const [saving,    setSaving]    = useState(false)
  const [saveError, setSaveError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const openAdd = () => {
    setAdding(true)
    setNewName('')
    setSaveError('')
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  const cancelAdd = () => { setAdding(false); setNewName(''); setSaveError('') }

  const createCategory = async () => {
    const name = newName.trim()
    if (!name) { setSaveError('Name is required'); return }
    setSaving(true); setSaveError('')
    const res  = await fetch('/api/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, type: 'inventory' }),
    })
    const json = await res.json()
    setSaving(false)
    if (!res.ok) { setSaveError(json.error ?? 'Failed to create'); return }
    onCategoryCreated(json.data)
    onChange(json.data.id)
    setAdding(false)
    setNewName('')
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          className="flex-1 h-10 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">— No category —</option>
          {categories.map((c: any) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        {!adding && (
          <button
            type="button"
            onClick={openAdd}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-slate-300 text-slate-500 hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 text-xs font-medium transition-colors whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" /> New
          </button>
        )}
      </div>

      {/* Inline add form */}
      {adding && (
        <div className="flex gap-2 items-center p-2.5 bg-indigo-50 border border-indigo-100 rounded-lg">
          <input
            ref={inputRef}
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); createCategory() } if (e.key === 'Escape') cancelAdd() }}
            placeholder="Category name…"
            className="flex-1 bg-white border border-slate-200 rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            type="button"
            onClick={createCategory}
            disabled={saving}
            className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
            {saving ? 'Saving…' : 'Add'}
          </button>
          <button type="button" onClick={cancelAdd} className="text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {saveError && <p className="text-xs text-red-600">{saveError}</p>}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function NewProductPage() {
  const router = useRouter()
  // Prefill from a global-catalog scan (/inventory/new?barcode=&name=)
  const [{ prefillBarcode, prefillName }] = useState(() => {
    if (typeof window === 'undefined') return { prefillBarcode: '', prefillName: '' }
    const p = new URLSearchParams(window.location.search)
    return { prefillBarcode: p.get('barcode') ?? '', prefillName: p.get('name') ?? '' }
  })
  const [submitted,      setSubmitted]      = useState(false)
  const [attrs,          setAttrs]          = useState<AttrRow[]>([])
  const [trackExpiry,    setTrackExpiry]    = useState(false)
  const [errorMsg,       setErrorMsg]       = useState('')
  const [categoryId,     setCategoryId]     = useState('')
  const [initQty,        setInitQty]        = useState('')
  const [initCost,       setInitCost]       = useState('')
  const [initLocationId, setInitLocationId] = useState('')

  const { data: catData } = useApi<{ data: any[] }>('/api/categories?type=inventory')
  const { data: locData } = useApi<{ data: any[] }>('/api/locations')
  const [extraCats, setExtraCats] = useState<{ id: string; name: string }[]>([])
  const categories = [...(catData?.data ?? []), ...extraCats].filter(
    (c, i, arr) => arr.findIndex(x => x.id === c.id) === i
  )
  const locations = locData?.data ?? []

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const fd = new FormData(form)

    const attributesObj: Record<string, string> = {}
    attrs.forEach(({ key, value }) => {
      if (key.trim()) attributesObj[key.trim()] = value.trim()
    })

    const body = {
      sku:             fd.get('sku'),
      barcode:         fd.get('barcode') || undefined,
      name:            fd.get('name'),
      category_id:     categoryId || undefined,
      unit_of_measure: fd.get('unit_of_measure') || 'pc',
      cost_method:     fd.get('cost_method'),
      reorder_point:   Number(fd.get('reorder_point')) || 0,
      attributes:      attributesObj,
      track_expiry:    trackExpiry,
    }

    const res = await fetch('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await res.json()
    if (!res.ok) { setErrorMsg(json.error ?? 'Failed to create item'); return }

    // Record initial stock if provided
    const qty = parseInt(initQty)
    if (qty > 0 && initLocationId) {
      const stockRes = await fetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transaction_type: 'adjustment',
          product_id:       json.data.id,
          quantity:         qty,
          unit_cost:        parseFloat(initCost) || 0,
          to_location_id:   initLocationId,
          reference_no:     'Opening stock',
        }),
      })
      if (!stockRes.ok) {
        const sj = await stockRes.json()
        setErrorMsg(`Item created but stock entry failed: ${sj.error ?? 'unknown error'}`)
        return
      }
    }

    setSubmitted(true)
    setTimeout(() => router.push('/inventory'), 1200)
  }

  return (
    <div>
      <Topbar title="Add Item" />
      <div className="p-6 max-w-2xl">
        <Card>
          <CardHeader><CardTitle>New Inventory Item</CardTitle></CardHeader>
          <CardContent>
            {submitted ? (
              <p className="text-green-600 font-medium text-center py-6">✓ Item created successfully</p>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">

                {/* ── Basic info ── */}
                <section className="space-y-3">
                  <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Basic Info</h3>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-sm font-medium text-slate-700 block mb-1">SKU <span className="text-red-500">*</span></label>
                      <Input name="sku" placeholder="PRD-001" required />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-slate-700 block mb-1">Barcode</label>
                      <Input name="barcode" placeholder="Scan or enter barcode" defaultValue={prefillBarcode} />
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-slate-700 block mb-1">Item Name <span className="text-red-500">*</span></label>
                    <Input name="name" placeholder="e.g. Ergonomic Office Chair" required defaultValue={prefillName} />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-sm font-medium text-slate-700 block mb-1">Category</label>
                      <CategorySelector
                        value={categoryId}
                        onChange={setCategoryId}
                        categories={categories}
                        onCategoryCreated={cat => setExtraCats(prev => [...prev, cat])}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-slate-700 block mb-1">Unit of Measure</label>
                      <Input name="unit_of_measure" placeholder="pc, kg, box, bottle…" defaultValue="pc" />
                    </div>
                  </div>
                </section>

                {/* ── Variations / Attributes ── */}
                <section className="space-y-3">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Variations & Attributes</h3>
                    <p className="text-xs text-slate-400 mt-0.5">Describe this item's variant — size, color, flavor, brand, etc.</p>
                  </div>
                  <AttributeBuilder attrs={attrs} onChange={setAttrs} />
                </section>

                {/* ── Costing & stock ── */}
                <section className="space-y-3">
                  <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Costing & Stock</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-sm font-medium text-slate-700 block mb-1">Cost Method</label>
                      <select
                        name="cost_method"
                        className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="average">Weighted Average</option>
                        <option value="fifo">FIFO</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-slate-700 block mb-1">Reorder Point</label>
                      <Input name="reorder_point" type="number" min="0" defaultValue="0" />
                    </div>
                  </div>
                </section>

                {/* ── Expiration tracking ── */}
                <section>
                  <label className="flex items-start gap-3 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={trackExpiry}
                      onChange={e => setTrackExpiry(e.target.checked)}
                      className="mt-0.5 w-4 h-4 rounded accent-indigo-600"
                    />
                    <div>
                      <p className="text-sm font-medium text-slate-700 group-hover:text-slate-900">Track expiration dates</p>
                      <p className="text-xs text-slate-400">
                        When enabled, each purchase batch can record an expiration date.
                        Batches nearing expiry will be flagged in the inventory.
                      </p>
                    </div>
                  </label>
                </section>

                {/* ── Initial Stock ── */}
                <section className="space-y-3">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Initial Stock</h3>
                    <p className="text-xs text-slate-400 mt-0.5">Optional — set a starting quantity so the item appears in your inventory list right away.</p>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-sm font-medium text-slate-700 block mb-1">Quantity</label>
                      <Input
                        type="number" min="0" placeholder="0"
                        value={initQty}
                        onChange={e => setInitQty(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-slate-700 block mb-1">Unit Cost</label>
                      <Input
                        type="number" min="0" step="0.01" placeholder="0.00"
                        value={initCost}
                        onChange={e => setInitCost(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-slate-700 block mb-1">Location</label>
                      <select
                        value={initLocationId}
                        onChange={e => setInitLocationId(e.target.value)}
                        className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="">— Select location —</option>
                        {locations.map((l: any) => (
                          <option key={l.id} value={l.id}>{l.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </section>

                {errorMsg && (
                  <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{errorMsg}</p>
                )}

                <div className="flex gap-2 pt-2 border-t border-slate-100">
                  <Button type="submit">Create Item</Button>
                  <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
