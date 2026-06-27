'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  ArrowRightLeft, PackagePlus, Boxes, Plus, X, Check,
  ChevronRight, Loader2, Search, AlertCircle, Clock,
  CheckCircle2, XCircle, RotateCcw, Minus,
  CalendarDays, FileText, MapPin, User, Tag, Briefcase,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────
type ReqType   = 'checkout' | 'new_asset' | 'inventory'
type ReqStatus = 'pending' | 'approved' | 'rejected' | 'checked_out' | 'returned' | 'fulfilled'

interface ReqItem {
  id?: string
  item_type: 'asset' | 'product' | 'new'
  asset_id?: string
  product_id?: string
  asset?: { id: string; asset_tag: string; name: string; status: string }
  product?: { id: string; sku: string; name: string; unit_of_measure: string }
  quantity: number
  unit_cost?: number
  notes?: string
  returned_at?: string
}

interface Requisition {
  id: string
  req_number: string
  type: ReqType
  status: ReqStatus
  job_reference?: string
  job_code?: string
  notes?: string
  reject_reason?: string
  required_by?: string
  approved_at?: string
  fulfilled_at?: string
  created_at: string
  location?: { id: string; name: string; code: string }
  cost_center?: { id: string; code: string; name: string }
  requested_by?: { id: string; full_name: string; role: string }
  approved_by?: { id: string; full_name: string }
  items: ReqItem[]
}

// ── Config ───────────────────────────────────────────────────────────────────
const TYPE_CFG: Record<ReqType, { label: string; icon: React.ElementType; color: string; bg: string; desc: string }> = {
  checkout:  { label: 'Checkout',    icon: ArrowRightLeft, color: 'text-cyan-700',   bg: 'bg-cyan-50 ring-cyan-200',   desc: 'Borrow shared tools or equipment for a job' },
  new_asset: { label: 'New Asset',   icon: PackagePlus,    color: 'text-violet-700', bg: 'bg-violet-50 ring-violet-200', desc: 'Request procurement to purchase a new asset' },
  inventory: { label: 'Inventory',   icon: Boxes,          color: 'text-amber-700',  bg: 'bg-amber-50 ring-amber-200', desc: 'Request materials or consumables for a job' },
}

const STATUS_CFG: Record<ReqStatus, { label: string; color: string }> = {
  pending:     { label: 'Pending Approval', color: 'bg-amber-100 text-amber-800'   },
  approved:    { label: 'Approved',         color: 'bg-blue-100 text-blue-800'     },
  checked_out: { label: 'Checked Out',      color: 'bg-indigo-100 text-indigo-800' },
  returned:    { label: 'Returned',         color: 'bg-green-100 text-green-800'   },
  fulfilled:   { label: 'Fulfilled',        color: 'bg-emerald-100 text-emerald-800' },
  rejected:    { label: 'Rejected',         color: 'bg-red-100 text-red-800'       },
}

const STATUS_FILTERS = [
  { value: 'all',       label: 'All'        },
  { value: 'pending',   label: 'Pending'    },
  { value: 'active',    label: 'Active'     },
  { value: 'completed', label: 'Completed'  },
  { value: 'rejected',  label: 'Rejected'   },
]

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(d?: string) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function itemLabel(item: ReqItem): string {
  if (item.item_type === 'asset'   && item.asset)   return `${item.asset.name} (${item.asset.asset_tag})`
  if (item.item_type === 'product' && item.product) return `${item.product.name}`
  return item.notes ?? 'Item'
}

function itemQty(item: ReqItem): string {
  if (item.item_type === 'asset') return `×${item.quantity}`
  return `${item.quantity}${item.product?.unit_of_measure ? ' ' + item.product.unit_of_measure : ''}`
}

// ── Product search inline ──────────────────────────────────────────────────────
function ProductSearch({ onSelect }: { onSelect: (p: any) => void }) {
  const [q, setQ]         = useState('')
  const [results, setRes] = useState<any[]>([])
  const [busy, setBusy]   = useState(false)

  const search = async (val: string) => {
    setQ(val)
    if (val.length < 2) { setRes([]); return }
    setBusy(true)
    try {
      const r = await fetch(`/api/products?q=${encodeURIComponent(val)}`)
      setRes((await r.json()).data ?? [])
    } finally { setBusy(false) }
  }

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        <input
          value={q}
          onChange={e => search(e.target.value)}
          placeholder="Search by name or SKU…"
          className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        {busy && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-slate-400" />}
      </div>
      {results.length > 0 && (
        <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
          {results.map(p => (
            <button key={p.id} type="button"
              onClick={() => { onSelect(p); setQ(''); setRes([]) }}
              className="w-full text-left px-3 py-2.5 hover:bg-indigo-50 transition-colors border-b border-slate-50 last:border-0">
              <p className="text-sm font-medium text-slate-900">{p.name}</p>
              <p className="text-xs text-slate-400 font-mono">{p.sku} · {p.unit_of_measure}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Asset search inline ────────────────────────────────────────────────────────
function AssetSearch({ onSelect }: { onSelect: (a: any) => void }) {
  const [q, setQ]         = useState('')
  const [results, setRes] = useState<any[]>([])
  const [busy, setBusy]   = useState(false)

  const search = async (val: string) => {
    setQ(val)
    if (val.length < 2) { setRes([]); return }
    setBusy(true)
    try {
      const r = await fetch(`/api/assets?q=${encodeURIComponent(val)}`)
      const all = (await r.json()).data ?? []
      setRes(all.filter((a: any) => a.status !== 'disposed'))
    } finally { setBusy(false) }
  }

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        <input
          value={q}
          onChange={e => search(e.target.value)}
          placeholder="Search assets by name or tag…"
          className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        {busy && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-slate-400" />}
      </div>
      {results.length > 0 && (
        <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
          {results.map(a => (
            <button key={a.id} type="button"
              onClick={() => { onSelect(a); setQ(''); setRes([]) }}
              className="w-full text-left px-3 py-2.5 hover:bg-indigo-50 transition-colors border-b border-slate-50 last:border-0">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-slate-900">{a.name}</p>
                <span className={cn('text-xs px-1.5 py-0.5 rounded-full font-medium',
                  a.status === 'active'      ? 'bg-green-100 text-green-700' :
                  a.status === 'maintenance' ? 'bg-amber-100 text-amber-700' :
                  'bg-slate-100 text-slate-600')}>
                  {a.status}
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono">{a.asset_tag}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── New Request Dialog ─────────────────────────────────────────────────────────
function NewRequestDialog({
  open, onClose, onCreated, profile,
}: {
  open: boolean
  onClose: () => void
  onCreated: () => void
  profile: any
}) {
  const [step, setStep]             = useState<1 | 2 | 3 | 4>(1)
  const [type, setType]             = useState<ReqType | null>(null)
  const [items, setItems]           = useState<(ReqItem & { available?: number })[]>([])
  const [newItemQty, setNewItemQty] = useState(1)
  const [newItemCost, setNewItemCost] = useState('')
  const [newItemDesc, setNewItemDesc] = useState('')
  const [jobRef, setJobRef]         = useState('')
  const [requiredBy, setRequiredBy] = useState('')
  const [notes, setNotes]           = useState('')
  const [locations, setLocations]   = useState<any[]>([])
  const [locationId, setLocationId] = useState('')
  const [costCenterId, setCcId]       = useState('')
  const [jobCode, setJobCode]         = useState('')
  const [costCenters, setCCs]         = useState<any[]>([])
  const [submitting, setSubmitting]   = useState(false)
  const [error, setError]             = useState('')
  const [stockWarning, setStockWarning] = useState<{ name: string; requested: number; available: number } | null>(null)

  useEffect(() => {
    if (open) {
      if (type === 'inventory') {
        fetch('/api/locations').then(r => r.json()).then(j => setLocations(j.data ?? []))
      }
      fetch('/api/cost-centers').then(r => r.json()).then(j => setCCs(j.data ?? []))
    }
  }, [open, type])

  const reset = () => {
    setStep(1); setType(null); setItems([])
    setNewItemQty(1); setNewItemCost(''); setNewItemDesc('')
    setJobRef(''); setRequiredBy(''); setNotes('')
    setLocationId(''); setCcId(''); setJobCode(''); setError('')
    setStockWarning(null)
  }

  const close = () => { reset(); onClose() }

  const addProduct = async (p: any) => {
    if (items.find(i => i.product_id === p.id)) return
    let available: number | undefined
    try {
      const r = await fetch(`/api/inventory?product_id=${p.id}`)
      const j = await r.json()
      const rows = j.data ?? []
      available = rows.reduce((s: number, b: any) => s + (b.quantity ?? 0), 0)
    } catch { /* ignore */ }
    setItems(prev => [...prev, {
      item_type: 'product', product_id: p.id, product: p, quantity: 1, available,
    }])
  }

  const addAsset = (a: any) => {
    if (items.find(i => i.asset_id === a.id)) return
    setItems(prev => [...prev, {
      item_type: 'asset', asset_id: a.id, asset: a, quantity: 1,
    }])
  }

  const addNewItem = () => {
    if (!newItemDesc.trim()) return
    setItems(prev => [...prev, {
      item_type: 'new',
      quantity:  newItemQty,
      unit_cost: newItemCost ? Number(newItemCost) : undefined,
      notes:     newItemDesc.trim(),
    }])
    setNewItemDesc(''); setNewItemQty(1); setNewItemCost('')
  }

  const removeItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx))

  const updateQty = (idx: number, qty: number) => {
    const item = items[idx]
    const safeQty = Math.max(1, qty)
    if (item.item_type === 'product' && item.available !== undefined && safeQty > item.available) {
      setStockWarning({
        name: item.product?.name ?? 'Item',
        requested: safeQty,
        available: item.available,
      })
      return
    }
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, quantity: safeQty } : it))
  }

  const hasStockIssues = items.some(item =>
    item.item_type === 'product' && item.available !== undefined && item.quantity > item.available
  )

  // Cost center + job code are mandatory on every requisition
  const detailsComplete = !!costCenterId && !!jobCode.trim()

  const submit = async () => {
    if (!type || items.length === 0) return
    if (!detailsComplete) { setError('Cost center and job code are required'); return }
    setSubmitting(true); setError('')
    try {
      const body: Record<string, any> = { type, items }
      if (jobRef.trim())      body.job_reference  = jobRef.trim()
      if (jobCode.trim())     body.job_code       = jobCode.trim()
      if (requiredBy)         body.required_by    = requiredBy
      if (notes.trim())       body.notes          = notes.trim()
      if (locationId)         body.location_id    = locationId
      if (costCenterId)       body.cost_center_id = costCenterId

      const res  = await fetch('/api/requisitions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Failed to submit'); return }
      onCreated()
      close()
    } catch { setError('Network error — please try again.')
    } finally { setSubmitting(false) }
  }

  if (!open) return null

  const TOTAL_STEPS = 4

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-semibold text-slate-900">New Requisition</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Step {step} of {TOTAL_STEPS} — {step === 1 ? 'Type' : step === 2 ? 'Items' : step === 3 ? 'Details' : 'Review'}
            </p>
          </div>
          <button onClick={close} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Step dots */}
        <div className="flex gap-1.5 px-6 pt-3 pb-1">
          {[1, 2, 3, 4].map(s => (
            <div key={s} className={cn('h-1 flex-1 rounded-full transition-colors',
              s < step ? 'bg-indigo-500' : s === step ? 'bg-indigo-400' : 'bg-slate-200')} />
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">

          {/* Step 1: Type selection */}
          {step === 1 && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-slate-700 mb-3">What are you requesting?</p>
              {(Object.keys(TYPE_CFG) as ReqType[]).map(t => {
                const cfg = TYPE_CFG[t]
                const Icon = cfg.icon
                return (
                  <button key={t} type="button"
                    onClick={() => setType(t)}
                    className={cn(
                      'w-full flex items-start gap-4 p-4 rounded-xl border-2 text-left transition-all',
                      type === t
                        ? 'border-indigo-500 bg-indigo-50'
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    )}>
                    <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ring-1', cfg.bg)}>
                      <Icon className={cn('w-5 h-5', cfg.color)} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{cfg.label}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{cfg.desc}</p>
                    </div>
                    {type === t && <Check className="w-4 h-4 text-indigo-600 ml-auto flex-shrink-0 mt-0.5" />}
                  </button>
                )
              })}
            </div>
          )}

          {/* Step 2: Items */}
          {step === 2 && type && (
            <div className="space-y-4">
              <p className="text-sm font-medium text-slate-700">
                {type === 'checkout'  && 'Which assets do you need?'}
                {type === 'new_asset' && 'What do you want to purchase?'}
                {type === 'inventory' && 'Which inventory items do you need?'}
              </p>

              {/* Search / add */}
              {type === 'checkout'  && <AssetSearch   onSelect={addAsset}   />}
              {type === 'inventory' && <ProductSearch onSelect={addProduct} />}

              {type === 'new_asset' && (
                <div className="space-y-2">
                  <input
                    value={newItemDesc}
                    onChange={e => setNewItemDesc(e.target.value)}
                    placeholder="Item description (e.g. Dewalt 20V Drill Press)"
                    className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <div className="flex gap-2">
                    <input
                      type="number" min="1" value={newItemQty}
                      onChange={e => setNewItemQty(Math.max(1, Number(e.target.value)))}
                      placeholder="Qty"
                      className="w-24 px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <input
                      type="number" min="0" value={newItemCost}
                      onChange={e => setNewItemCost(e.target.value)}
                      placeholder="Est. cost (optional)"
                      className="flex-1 px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <button type="button" onClick={addNewItem}
                      disabled={!newItemDesc.trim()}
                      className="px-3 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-40 transition-colors flex items-center gap-1.5">
                      <Plus className="w-4 h-4" /> Add
                    </button>
                  </div>
                </div>
              )}

              {/* Items list */}
              {items.length > 0 && (
                <div className="mt-3 space-y-2">
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Added items</p>
                  {items.map((item, idx) => (
                    <div key={idx} className={cn(
                      'flex items-center gap-3 p-3 rounded-lg border',
                      item.item_type === 'product' && item.available !== undefined && item.quantity > item.available
                        ? 'bg-red-50 border-red-200'
                        : 'bg-slate-50 border-slate-200'
                    )}>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">{itemLabel(item)}</p>
                        {item.item_type === 'product' && item.available !== undefined && (
                          <p className={cn('text-xs font-mono', item.quantity > item.available ? 'text-red-500 font-semibold' : 'text-slate-400')}>
                            Stock: {item.available} {item.product?.unit_of_measure ?? ''}
                          </p>
                        )}
                        {item.item_type === 'asset' && item.asset && (
                          <p className="text-xs text-slate-400 font-mono">{item.asset.asset_tag}</p>
                        )}
                        {item.item_type === 'new' && item.unit_cost && (
                          <p className="text-xs text-slate-400">~${Number(item.unit_cost).toLocaleString()} each</p>
                        )}
                      </div>
                      {item.item_type !== 'asset' && (
                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={e => {
                            const val = Number(e.target.value)
                            if (val >= 1) updateQty(idx, val)
                          }}
                          className={cn(
                            'w-16 text-center text-sm font-semibold rounded-lg border py-1.5 focus:outline-none focus:ring-2',
                            item.item_type === 'product' && item.available !== undefined && item.quantity > item.available
                              ? 'border-red-300 text-red-600 focus:ring-red-400'
                              : 'border-slate-300 text-slate-900 focus:ring-indigo-500'
                          )}
                        />
                      )}
                      <button type="button" onClick={() => removeItem(idx)}
                        className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {items.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-6 border border-dashed border-slate-200 rounded-lg">
                  No items added yet
                </p>
              )}
            </div>
          )}

          {/* Step 3: Details */}
          {step === 3 && type && (
            <div className="space-y-4">
              {/* Cost Center */}
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1.5">
                  Cost Center <span className="text-red-500">*</span>
                </label>
                <select
                  value={costCenterId}
                  onChange={e => setCcId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                  <option value="">— Select a cost center —</option>
                  {costCenters.filter(c => c.is_active).map(c => (
                    <option key={c.id} value={c.id}>{c.code} — {c.name}</option>
                  ))}
                </select>
              </div>

              {/* Job Code */}
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1.5">
                  Job Code <span className="text-red-500">*</span>
                </label>
                <input
                  value={jobCode}
                  onChange={e => setJobCode(e.target.value)}
                  placeholder="e.g. JOB-2026-0042"
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1.5">Job Reference <span className="text-slate-400 font-normal">(optional)</span></label>
                <input
                  value={jobRef}
                  onChange={e => setJobRef(e.target.value)}
                  placeholder="e.g. Work order or project reference"
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1.5">Needed By <span className="text-slate-400 font-normal">(optional)</span></label>
                <input
                  type="date"
                  value={requiredBy}
                  onChange={e => setRequiredBy(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {type === 'inventory' && (
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1.5">Pull From Location <span className="text-slate-400 font-normal">(optional)</span></label>
                  <select
                    value={locationId}
                    onChange={e => setLocationId(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                    <option value="">Any location (auto-detect)</option>
                    {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
              )}

              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1.5">Reason / Notes <span className="text-slate-400 font-normal">(optional)</span></label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Why do you need this? Any special requirements?"
                  rows={3}
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              </div>
            </div>
          )}

          {/* Step 4: Review before submit */}
          {step === 4 && type && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
                <AlertCircle className="w-4 h-4 text-indigo-600 flex-shrink-0" />
                <p className="text-sm text-indigo-800 font-medium">Please review before submitting</p>
              </div>

              {/* Type */}
              <div className="bg-white rounded-lg border border-slate-200 divide-y divide-slate-100">
                <div className="flex items-center gap-3 px-4 py-3">
                  {(() => { const Icon = TYPE_CFG[type].icon; return <Icon className={cn('w-4 h-4', TYPE_CFG[type].color)} /> })()}
                  <div>
                    <p className="text-xs text-slate-400">Request Type</p>
                    <p className="text-sm font-semibold text-slate-900">{TYPE_CFG[type].label}</p>
                  </div>
                </div>

                {/* Items */}
                <div className="px-4 py-3">
                  <p className="text-xs text-slate-400 mb-2">Items ({items.length})</p>
                  {items.map((item, i) => (
                    <div key={i} className="flex items-center justify-between py-1.5">
                      <span className="text-sm text-slate-700">{itemLabel(item)}</span>
                      <span className="text-sm font-semibold text-slate-900 tabular-nums">{itemQty(item)}</span>
                    </div>
                  ))}
                </div>

                {/* Details */}
                {(locationId || costCenterId || jobCode || jobRef || requiredBy || notes) && (
                  <div className="px-4 py-3 space-y-1.5">
                    <p className="text-xs text-slate-400 mb-1">Details</p>
                    {locationId && (
                      <div className="flex items-center gap-1.5 text-xs text-slate-600">
                        <MapPin className="w-3 h-3" />
                        {locations.find(l => l.id === locationId)?.name ?? 'Selected location'}
                      </div>
                    )}
                    {costCenterId && (
                      <div className="flex items-center gap-1.5 text-xs text-slate-600">
                        <Briefcase className="w-3 h-3" />
                        {costCenters.find(c => c.id === costCenterId)?.code ?? 'Cost center'}
                      </div>
                    )}
                    {jobCode && (
                      <div className="flex items-center gap-1.5 text-xs text-slate-600">
                        <Tag className="w-3 h-3" />{jobCode}
                      </div>
                    )}
                    {jobRef && (
                      <div className="flex items-center gap-1.5 text-xs text-slate-600">
                        <Tag className="w-3 h-3 opacity-60" />{jobRef}
                      </div>
                    )}
                    {requiredBy && (
                      <div className="flex items-center gap-1.5 text-xs text-slate-600">
                        <CalendarDays className="w-3 h-3" />Needed by {fmt(requiredBy)}
                      </div>
                    )}
                    {notes && (
                      <div className="flex items-start gap-1.5 text-xs text-slate-600">
                        <FileText className="w-3 h-3 mt-0.5" />{notes}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {!detailsComplete && (
                <p className="text-xs text-slate-400">
                  Cost center and job code are required to continue.
                </p>
              )}

              {error && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50/50 rounded-b-2xl">
          <button
            onClick={() => step > 1 ? setStep(s => (s - 1) as 1 | 2 | 3 | 4) : close()}
            className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors">
            {step === 1 ? 'Cancel' : '← Back'}
          </button>

          {step < TOTAL_STEPS ? (
            <button
              onClick={() => setStep(s => (s + 1) as 2 | 3 | 4)}
              disabled={step === 1 ? !type : step === 2 ? (items.length === 0 || hasStockIssues) : step === 3 ? !detailsComplete : false}
              className="px-5 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 transition-colors flex items-center gap-2">
              {step === 3 ? 'Review' : 'Next'} <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button onClick={submit} disabled={submitting}
              className="px-5 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors flex items-center gap-2">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Submit Request
            </button>
          )}
        </div>
      </div>

      {/* Stock warning popup */}
      {stockWarning && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-xs p-5">
            <div className="flex items-center gap-2 mb-3">
              <AlertCircle className="w-5 h-5 text-amber-500" />
              <h3 className="text-sm font-semibold text-slate-900">Insufficient Stock</h3>
            </div>
            <p className="text-sm text-slate-600 mb-1">
              <span className="font-semibold">{stockWarning.name}</span>
            </p>
            <p className="text-sm text-slate-600 mb-4">
              Requested: <span className="font-semibold text-red-600">{stockWarning.requested}</span>
              {' · '}Available: <span className="font-semibold text-slate-900">{stockWarning.available}</span>
            </p>
            <button
              onClick={() => setStockWarning(null)}
              className="w-full px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 transition-colors">
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Reject Dialog ─────────────────────────────────────────────────────────────
function RejectDialog({
  req, onClose, onDone,
}: { req: Requisition; onClose: () => void; onDone: () => void }) {
  const [reason, setReason]     = useState('')
  const [submitting, setSub]    = useState(false)

  const submit = async () => {
    setSub(true)
    await fetch(`/api/requisitions/${req.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reject', reject_reason: reason.trim() || undefined }),
    })
    setSub(false)
    onDone()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <h3 className="text-base font-semibold text-slate-900 mb-1">Reject Requisition</h3>
        <p className="text-sm text-slate-500 mb-4">{req.req_number}</p>
        <textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="Reason for rejection (optional)"
          rows={3}
          className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none mb-4"
        />
        <div className="flex gap-3">
          <button onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          <button onClick={submit} disabled={submitting}
            className="flex-1 px-4 py-2.5 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition-colors flex items-center justify-center gap-2">
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
            Reject
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Requisition Card ──────────────────────────────────────────────────────────
function ReqCard({
  req, userId, role, onAction,
}: {
  req: Requisition
  userId: string
  role: string
  onAction: (id: string, action: string) => Promise<void>
}) {
  const [expanded, setExpanded] = useState(false)
  const [busy, setBusy]         = useState<string | null>(null)

  const typeCfg   = TYPE_CFG[req.type]
  const statusCfg = STATUS_CFG[req.status]
  const TypeIcon  = typeCfg.icon

  const isRequester = req.requested_by?.id === userId
  const isOwner     = role === 'owner' || role === 'admin'
  const isOps       = isOwner || role === 'operations' || role === 'manager'
  const isProc      = isOwner || role === 'procurement'

  const canApproveThis = req.type === 'new_asset' ? isProc : isOps
  const canReturn      = req.status === 'checked_out' && (isRequester || isOps)
  const canFulfill     = req.type === 'new_asset' && req.status === 'approved' && isProc

  const act = async (action: string) => {
    setBusy(action)
    await onAction(req.id, action)
    setBusy(null)
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden hover:border-slate-300 transition-colors">
      <div className="p-4">
        {/* Top row */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5">
            <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ring-1', typeCfg.bg)}>
              <TypeIcon className={cn('w-4 h-4', typeCfg.color)} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-900 font-mono">{req.req_number}</span>
                <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', statusCfg.color)}>
                  {statusCfg.label}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">{typeCfg.label}</p>
            </div>
          </div>
          <span className="text-xs text-slate-400 flex-shrink-0">{fmt(req.created_at)}</span>
        </div>

        {/* Items preview */}
        <div className="space-y-1 mb-3">
          {req.items.slice(0, expanded ? undefined : 2).map((item, i) => (
            <div key={i} className="flex items-center justify-between text-sm">
              <span className="text-slate-700 truncate flex-1">{itemLabel(item)}</span>
              <span className="text-slate-400 text-xs ml-2 flex-shrink-0">{itemQty(item)}</span>
            </div>
          ))}
          {!expanded && req.items.length > 2 && (
            <button onClick={() => setExpanded(true)}
              className="text-xs text-indigo-600 hover:underline">
              +{req.items.length - 2} more items
            </button>
          )}
        </div>

        {/* Meta */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3">
          {req.requested_by && (
            <span className="text-xs text-slate-500 flex items-center gap-1">
              <User className="w-3 h-3" />{req.requested_by.full_name || 'Unknown'}
            </span>
          )}
          {req.cost_center && (
            <span className="text-xs text-slate-500 flex items-center gap-1">
              <Briefcase className="w-3 h-3" />{req.cost_center.code}
            </span>
          )}
          {req.job_code && (
            <span className="text-xs text-slate-500 flex items-center gap-1">
              <Tag className="w-3 h-3" />{req.job_code}
            </span>
          )}
          {req.job_reference && (
            <span className="text-xs text-slate-500 flex items-center gap-1">
              <Tag className="w-3 h-3 opacity-60" />{req.job_reference}
            </span>
          )}
          {req.required_by && (
            <span className="text-xs text-slate-500 flex items-center gap-1">
              <CalendarDays className="w-3 h-3" />Needed {fmt(req.required_by)}
            </span>
          )}
          {req.location && (
            <span className="text-xs text-slate-500 flex items-center gap-1">
              <MapPin className="w-3 h-3" />{req.location.name}
            </span>
          )}
        </div>

        {/* Reject reason */}
        {req.status === 'rejected' && req.reject_reason && (
          <div className="flex items-start gap-2 p-2 bg-red-50 rounded-lg mb-3">
            <AlertCircle className="w-3.5 h-3.5 text-red-500 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-red-700">{req.reject_reason}</p>
          </div>
        )}

        {/* Notes */}
        {req.notes && expanded && (
          <div className="flex items-start gap-2 p-2 bg-slate-50 rounded-lg mb-3">
            <FileText className="w-3.5 h-3.5 text-slate-400 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-slate-600">{req.notes}</p>
          </div>
        )}

        {/* Action buttons */}
        {(req.status === 'pending' && canApproveThis) && (
          <div className="flex gap-2 pt-2 border-t border-slate-100">
            <button onClick={() => act('reject')} disabled={!!busy}
              className="flex-1 px-3 py-2 rounded-lg border border-red-200 text-red-700 text-xs font-semibold hover:bg-red-50 transition-colors flex items-center justify-center gap-1.5">
              {busy === 'reject' ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
              Reject
            </button>
            <button onClick={() => act('approve')} disabled={!!busy}
              className="flex-1 px-3 py-2 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition-colors flex items-center justify-center gap-1.5">
              {busy === 'approve' ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              Approve
            </button>
          </div>
        )}

        {canReturn && (
          <div className="pt-2 border-t border-slate-100">
            <button onClick={() => act('return')} disabled={!!busy}
              className="w-full px-3 py-2 rounded-lg bg-green-600 text-white text-xs font-semibold hover:bg-green-700 transition-colors flex items-center justify-center gap-1.5">
              {busy === 'return' ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
              Mark as Returned
            </button>
          </div>
        )}

        {canFulfill && (
          <div className="pt-2 border-t border-slate-100">
            <button onClick={() => act('fulfill')} disabled={!!busy}
              className="w-full px-3 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition-colors flex items-center justify-center gap-1.5">
              {busy === 'fulfill' ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              Mark as Fulfilled (PO Created)
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function RequisitionsPage() {
  const [reqs, setReqs]           = useState<Requisition[]>([])
  const [loading, setLoading]     = useState(true)
  const [profile, setProfile]     = useState<any>(null)
  const [statusFilter, setStatus] = useState('all')
  const [typeFilter, setTypeF]    = useState<string>('all')
  const [showNew, setShowNew]     = useState(false)
  const [rejectTarget, setReject] = useState<Requisition | null>(null)
  const [mineOnly, setMineOnly]   = useState(false)

  const fetchReqs = useCallback(async () => {
    const params = new URLSearchParams()
    if (mineOnly) params.set('mine', 'true')
    if (typeFilter !== 'all') params.set('type', typeFilter)
    const res  = await fetch(`/api/requisitions?${params}`)
    const json = await res.json()
    let data: Requisition[] = json.data ?? []

    if (statusFilter !== 'all') {
      if (statusFilter === 'active')    data = data.filter(r => ['approved', 'checked_out'].includes(r.status))
      else if (statusFilter === 'completed') data = data.filter(r => ['fulfilled', 'returned'].includes(r.status))
      else data = data.filter(r => r.status === statusFilter)
    }
    setReqs(data)
    setLoading(false)
  }, [statusFilter, typeFilter, mineOnly])

  useEffect(() => {
    fetch('/api/user/profile').then(r => r.json()).then(setProfile)
    fetchReqs()
  }, [fetchReqs])

  const canSeeAll = profile && ['owner', 'admin', 'operations', 'procurement', 'finance', 'manager'].includes(profile.role)

  const handleAction = async (id: string, action: string) => {
    if (action === 'reject') {
      const req = reqs.find(r => r.id === id)
      if (req) { setReject(req); return }
    }
    await fetch(`/api/requisitions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
    fetchReqs()
  }

  // Counts for filter badges
  const pendingCount = reqs.filter(r => r.status === 'pending').length

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Requisitions</h1>
          <p className="text-sm text-slate-500 mt-0.5">Asset checkout, inventory requests, and new purchase requests</p>
        </div>
        <button onClick={() => setShowNew(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors shadow-sm shadow-indigo-200">
          <Plus className="w-4 h-4" />
          New Request
        </button>
      </div>

      {/* Pending banner for approvers */}
      {canSeeAll && pendingCount > 0 && statusFilter === 'all' && !loading && (
        <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl mb-4">
          <Clock className="w-4 h-4 text-amber-600 flex-shrink-0" />
          <p className="text-sm text-amber-800">
            <span className="font-semibold">{pendingCount} requisition{pendingCount !== 1 ? 's' : ''}</span> awaiting your approval
          </p>
          <button onClick={() => setStatus('pending')}
            className="ml-auto text-xs font-semibold text-amber-700 hover:text-amber-900 underline">
            View
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        {/* Status tabs */}
        <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
          {STATUS_FILTERS.map(f => (
            <button key={f.value} onClick={() => setStatus(f.value)}
              className={cn(
                'px-3 py-1.5 rounded-md text-xs font-semibold transition-all',
                statusFilter === f.value
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              )}>
              {f.label}
            </button>
          ))}
        </div>

        {/* Type filter */}
        <select value={typeFilter} onChange={e => setTypeF(e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400">
          <option value="all">All Types</option>
          <option value="checkout">Checkout</option>
          <option value="new_asset">New Asset</option>
          <option value="inventory">Inventory</option>
        </select>

        {/* Mine only toggle */}
        {canSeeAll && (
          <button onClick={() => setMineOnly(m => !m)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all',
              mineOnly
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'border-slate-200 text-slate-500 hover:border-slate-300'
            )}>
            My Requests Only
          </button>
        )}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
        </div>
      ) : reqs.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm font-medium">No requisitions found</p>
          <p className="text-xs mt-1">Submit a new request to get started</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reqs.map(req => (
            <ReqCard
              key={req.id}
              req={req}
              userId={profile?.id ?? ''}
              role={profile?.role ?? 'viewer'}
              onAction={handleAction}
            />
          ))}
        </div>
      )}

      {/* Dialogs */}
      <NewRequestDialog
        open={showNew}
        onClose={() => setShowNew(false)}
        onCreated={fetchReqs}
        profile={profile}
      />

      {rejectTarget && (
        <RejectDialog
          req={rejectTarget}
          onClose={() => setReject(null)}
          onDone={fetchReqs}
        />
      )}
    </div>
  )
}
