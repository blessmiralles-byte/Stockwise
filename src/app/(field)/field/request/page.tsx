'use client'

import { useState, useEffect } from 'react'
import {
  ArrowRightLeft, PackagePlus, Boxes,
  Search, Plus, Minus, X, Loader2, CheckCircle2,
  ChevronLeft, AlertCircle,
} from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

type ReqType = 'checkout' | 'new_asset' | 'inventory'
type Step    = 'type' | 'items' | 'details' | 'done'

const TYPE_CFG = [
  {
    value: 'checkout'  as ReqType,
    label: 'Checkout Tool / Asset',
    emoji: '🔧',
    icon:  ArrowRightLeft,
    color: 'border-cyan-300 bg-cyan-50',
    activeColor: 'border-cyan-500 bg-cyan-100 ring-2 ring-cyan-300',
    desc:  'Borrow equipment for a job',
  },
  {
    value: 'inventory' as ReqType,
    label: 'Request Materials',
    emoji: '📦',
    icon:  Boxes,
    color: 'border-amber-300 bg-amber-50',
    activeColor: 'border-amber-500 bg-amber-100 ring-2 ring-amber-300',
    desc:  'Get consumables / supplies for a job',
  },
  {
    value: 'new_asset' as ReqType,
    label: 'Request New Purchase',
    emoji: '🛒',
    icon:  PackagePlus,
    color: 'border-violet-300 bg-violet-50',
    activeColor: 'border-violet-500 bg-violet-100 ring-2 ring-violet-300',
    desc:  'Ask procurement to buy something new',
  },
]

interface Item {
  item_type: 'asset' | 'product' | 'new'
  asset_id?: string
  product_id?: string
  asset?: { id: string; asset_tag: string; name: string; status: string }
  product?: { id: string; sku: string; name: string; unit_of_measure: string }
  quantity: number
  unit_cost?: number
  notes?: string
}

// ── Inline search ─────────────────────────────────────────────────────────────
function InlineSearch({
  endpoint, placeholder, mapResult, onSelect,
}: {
  endpoint: string
  placeholder: string
  mapResult: (item: any) => { id: string; primary: string; secondary: string; raw: any }
  onSelect: (raw: any) => void
}) {
  const [q, setQ]         = useState('')
  const [results, setRes] = useState<any[]>([])
  const [busy, setBusy]   = useState(false)

  const search = async (val: string) => {
    setQ(val)
    if (val.length < 2) { setRes([]); return }
    setBusy(true)
    try {
      const r = await fetch(`${endpoint}?q=${encodeURIComponent(val)}`)
      setRes((await r.json()).data ?? [])
    } finally { setBusy(false) }
  }

  return (
    <div className="relative">
      <div className="relative flex items-center">
        <Search className="absolute left-4 w-5 h-5 text-gray-400 pointer-events-none" />
        <input
          value={q}
          onChange={e => search(e.target.value)}
          placeholder={placeholder}
          className="w-full h-14 pl-12 pr-10 rounded-2xl border border-gray-200 bg-white text-base focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
        />
        {busy && <Loader2 className="absolute right-4 w-4 h-4 text-gray-400 animate-spin" />}
      </div>
      {results.length > 0 && (
        <div className="absolute z-20 left-0 right-0 mt-2 bg-white border border-gray-200 rounded-2xl shadow-xl max-h-60 overflow-y-auto">
          {results.map(item => {
            const mapped = mapResult(item)
            return (
              <button key={mapped.id} type="button"
                className="w-full text-left px-4 py-3.5 hover:bg-indigo-50 active:bg-indigo-100 transition-colors border-b border-gray-50 last:border-0"
                onClick={() => { onSelect(mapped.raw); setQ(''); setRes([]) }}>
                <p className="font-medium text-gray-900">{mapped.primary}</p>
                <p className="text-sm text-gray-400 font-mono mt-0.5">{mapped.secondary}</p>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function FieldRequestPage() {
  const [step, setStep]             = useState<Step>('type')
  const [type, setType]             = useState<ReqType | null>(null)
  const [items, setItems]           = useState<Item[]>([])
  const [newDesc, setNewDesc]       = useState('')
  const [newQty, setNewQty]         = useState(1)
  const [newCost, setNewCost]       = useState('')
  const [jobRef, setJobRef]         = useState('')
  const [jobCode, setJobCode]       = useState('')
  const [costCenterId, setCcId]     = useState('')
  const [costCenters, setCCs]       = useState<any[]>([])
  const [requiredBy, setRequiredBy] = useState('')
  const [notes, setNotes]           = useState('')
  const [submitting, setSub]        = useState(false)
  const [error, setError]           = useState('')
  const [reqNumber, setReqNumber]   = useState('')

  useEffect(() => {
    fetch('/api/cost-centers').then(r => r.json()).then(j => setCCs(j.data ?? [])).catch(() => {})
  }, [])

  const detailsComplete = !!costCenterId && !!jobCode.trim()

  const addProduct = (p: any) => {
    if (items.find(i => i.product_id === p.id)) return
    setItems(prev => [...prev, { item_type: 'product', product_id: p.id, product: p, quantity: 1 }])
  }

  const addAsset = (a: any) => {
    if (items.find(i => i.asset_id === a.id)) return
    setItems(prev => [...prev, { item_type: 'asset', asset_id: a.id, asset: a, quantity: 1 }])
  }

  const addNew = () => {
    if (!newDesc.trim()) return
    setItems(prev => [...prev, {
      item_type: 'new',
      quantity:  newQty,
      unit_cost: newCost ? Number(newCost) : undefined,
      notes:     newDesc.trim(),
    }])
    setNewDesc(''); setNewQty(1); setNewCost('')
  }

  const removeItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx))

  const updateQty = (idx: number, q: number) =>
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, quantity: Math.max(1, q) } : item))

  const submit = async () => {
    if (!type || items.length === 0) return
    if (!detailsComplete) { setError('Cost center and job code are required'); return }
    setSub(true); setError('')
    try {
      const body: Record<string, any> = { type, items, cost_center_id: costCenterId, job_code: jobCode.trim() }
      if (jobRef.trim())  body.job_reference = jobRef.trim()
      if (requiredBy)     body.required_by   = requiredBy
      if (notes.trim())   body.notes         = notes.trim()

      const res  = await fetch('/api/requisitions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Failed to submit'); return }
      setReqNumber(json.data?.req_number ?? '')
      setStep('done')
    } catch { setError('Network error — please try again.')
    } finally { setSub(false) }
  }

  const reset = () => {
    setStep('type'); setType(null); setItems([])
    setNewDesc(''); setNewQty(1); setNewCost('')
    setJobRef(''); setRequiredBy(''); setNotes('')
    setError(''); setReqNumber('')
  }

  // ── Done screen ──────────────────────────────────────────────────────────
  if (step === 'done') {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-6 text-center">
        <div className="w-20 h-20 rounded-full bg-indigo-100 flex items-center justify-center mb-6">
          <CheckCircle2 className="w-10 h-10 text-indigo-600" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Submitted!</h2>
        {reqNumber && (
          <p className="text-base font-mono text-indigo-600 font-semibold mb-2">{reqNumber}</p>
        )}
        <p className="text-gray-500 mb-8 max-w-xs">
          Your request has been sent for approval. You'll be notified once it's reviewed.
        </p>
        <button onClick={reset}
          className="w-full max-w-xs h-14 rounded-2xl bg-indigo-600 text-white text-lg font-bold active:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200">
          New Request
        </button>
        <Link href="/field"
          className="mt-4 text-gray-500 text-sm font-medium">
          Back to Hub
        </Link>
      </div>
    )
  }

  const selectedTypeCfg = type ? TYPE_CFG.find(t => t.value === type) : null

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 pt-12 pb-4">
        <div className="flex items-center gap-3 mb-1">
          {step !== 'type' ? (
            <button onClick={() => setStep(step === 'details' ? 'items' : 'type')}
              className="p-2 -ml-2 rounded-xl hover:bg-gray-100 active:bg-gray-200 transition-colors">
              <ChevronLeft className="w-5 h-5 text-gray-600" />
            </button>
          ) : (
            <Link href="/field"
              className="p-2 -ml-2 rounded-xl hover:bg-gray-100 active:bg-gray-200 transition-colors">
              <ChevronLeft className="w-5 h-5 text-gray-600" />
            </Link>
          )}
          <h1 className="text-xl font-bold text-gray-900">New Request</h1>
        </div>

        {/* Progress */}
        <div className="flex gap-1.5 mt-3">
          {(['type', 'items', 'details'] as Step[]).map((s, i) => (
            <div key={s} className={cn('h-1 flex-1 rounded-full transition-colors',
              step === 'type'    && i === 0 ? 'bg-indigo-500' :
              step === 'items'   && i <= 1  ? 'bg-indigo-500' :
              step === 'details' && i <= 2  ? 'bg-indigo-500' :
              'bg-gray-200'
            )} />
          ))}
        </div>
      </div>

      <div className="px-4 py-6 space-y-4">

        {/* Step 1: Type */}
        {step === 'type' && (
          <>
            <p className="text-base font-semibold text-gray-800">What are you requesting?</p>
            <div className="space-y-3">
              {TYPE_CFG.map(t => (
                <button key={t.value} type="button"
                  onClick={() => { setType(t.value); setStep('items') }}
                  className={cn(
                    'w-full flex items-center gap-4 p-5 rounded-2xl border-2 text-left active:scale-[0.98] transition-all',
                    type === t.value ? t.activeColor : t.color
                  )}>
                  <span className="text-3xl">{t.emoji}</span>
                  <div>
                    <p className="text-base font-bold text-gray-900">{t.label}</p>
                    <p className="text-sm text-gray-600 mt-0.5">{t.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

        {/* Step 2: Items */}
        {step === 'items' && type && (
          <>
            <p className="text-base font-semibold text-gray-800">
              {type === 'checkout'  && 'Which assets do you need?'}
              {type === 'new_asset' && 'What do you want to purchase?'}
              {type === 'inventory' && 'Which materials do you need?'}
            </p>

            {type === 'checkout' && (
              <InlineSearch
                endpoint="/api/assets"
                placeholder="Search assets by name or tag…"
                mapResult={a => ({ id: a.id, primary: a.name, secondary: a.asset_tag, raw: a })}
                onSelect={addAsset}
              />
            )}

            {type === 'inventory' && (
              <InlineSearch
                endpoint="/api/products"
                placeholder="Search by name or SKU…"
                mapResult={p => ({ id: p.id, primary: p.name, secondary: `${p.sku} · ${p.unit_of_measure}`, raw: p })}
                onSelect={addProduct}
              />
            )}

            {type === 'new_asset' && (
              <div className="space-y-3">
                <input
                  value={newDesc}
                  onChange={e => setNewDesc(e.target.value)}
                  placeholder="Describe what you need (e.g. Dewalt 20V Drill Press)"
                  className="w-full h-14 px-4 rounded-2xl border border-gray-200 bg-white text-base focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                />
                <div className="flex gap-3">
                  <input type="number" min="1" value={newQty}
                    onChange={e => setNewQty(Math.max(1, Number(e.target.value)))}
                    placeholder="Qty"
                    className="w-24 h-14 px-4 rounded-2xl border border-gray-200 bg-white text-base focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm text-center font-semibold"
                  />
                  <input type="number" min="0" value={newCost}
                    onChange={e => setNewCost(e.target.value)}
                    placeholder="Est. price (optional)"
                    className="flex-1 h-14 px-4 rounded-2xl border border-gray-200 bg-white text-base focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                  />
                </div>
                <button type="button" onClick={addNew} disabled={!newDesc.trim()}
                  className="w-full h-14 rounded-2xl bg-indigo-600 text-white text-base font-bold active:bg-indigo-700 disabled:opacity-40 transition-colors flex items-center justify-center gap-2 shadow-sm">
                  <Plus className="w-5 h-5" /> Add Item
                </button>
              </div>
            )}

            {/* Items list */}
            {items.length > 0 && (
              <div className="space-y-2 mt-2">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Added items</p>
                {items.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-3 p-4 bg-white rounded-2xl border border-gray-200 shadow-sm">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 truncate">
                        {item.item_type === 'asset'   ? item.asset?.name   :
                         item.item_type === 'product' ? item.product?.name :
                         item.notes}
                      </p>
                      <p className="text-sm text-gray-400 font-mono">
                        {item.item_type === 'asset'   ? item.asset?.asset_tag :
                         item.item_type === 'product' ? item.product?.sku     :
                         item.unit_cost ? `~$${item.unit_cost} each` : ''}
                      </p>
                    </div>
                    {item.item_type !== 'asset' && (
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => updateQty(idx, item.quantity - 1)}
                          className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center active:bg-gray-200">
                          <Minus className="w-4 h-4 text-gray-600" />
                        </button>
                        <span className="w-6 text-center text-base font-bold text-gray-900">{item.quantity}</span>
                        <button type="button" onClick={() => updateQty(idx, item.quantity + 1)}
                          className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center active:bg-gray-200">
                          <Plus className="w-4 h-4 text-gray-600" />
                        </button>
                      </div>
                    )}
                    <button type="button" onClick={() => removeItem(idx)}
                      className="w-8 h-8 rounded-xl bg-red-50 flex items-center justify-center active:bg-red-100">
                      <X className="w-3.5 h-3.5 text-red-500" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {items.length === 0 && type !== 'new_asset' && (
              <div className="py-8 text-center text-gray-400">
                <p className="text-sm">Search and add items above</p>
              </div>
            )}

            {items.length > 0 && (
              <button onClick={() => setStep('details')}
                className="w-full h-14 rounded-2xl bg-indigo-600 text-white text-base font-bold active:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200 flex items-center justify-center gap-2 mt-4">
                Continue ({items.length} item{items.length !== 1 ? 's' : ''}) →
              </button>
            )}
          </>
        )}

        {/* Step 3: Details */}
        {step === 'details' && (
          <>
            <p className="text-base font-semibold text-gray-800">Details</p>

            <div className="space-y-3">
              <div>
                <label className="text-sm font-semibold text-gray-600 block mb-2">Cost Center <span className="text-red-500">*</span></label>
                <select
                  value={costCenterId}
                  onChange={e => setCcId(e.target.value)}
                  className="w-full h-14 px-4 rounded-2xl border border-gray-200 bg-white text-base focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                >
                  <option value="">— Select a cost center —</option>
                  {costCenters.filter((c: any) => c.is_active).map((c: any) => (
                    <option key={c.id} value={c.id}>{c.code} — {c.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm font-semibold text-gray-600 block mb-2">Job Code <span className="text-red-500">*</span></label>
                <input
                  value={jobCode}
                  onChange={e => setJobCode(e.target.value)}
                  placeholder="e.g. JOB-2026-0042"
                  className="w-full h-14 px-4 rounded-2xl border border-gray-200 bg-white text-base focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                />
              </div>

              <div>
                <label className="text-sm font-semibold text-gray-600 block mb-2">Job Reference <span className="font-normal text-gray-400">(optional)</span></label>
                <input
                  value={jobRef}
                  onChange={e => setJobRef(e.target.value)}
                  placeholder="Work order / project reference"
                  className="w-full h-14 px-4 rounded-2xl border border-gray-200 bg-white text-base focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                />
              </div>

              <div>
                <label className="text-sm font-semibold text-gray-600 block mb-2">Needed By <span className="font-normal text-gray-400">(optional)</span></label>
                <input
                  type="date"
                  value={requiredBy}
                  onChange={e => setRequiredBy(e.target.value)}
                  className="w-full h-14 px-4 rounded-2xl border border-gray-200 bg-white text-base focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                />
              </div>

              <div>
                <label className="text-sm font-semibold text-gray-600 block mb-2">Reason <span className="font-normal text-gray-400">(optional)</span></label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Why do you need this?"
                  rows={3}
                  className="w-full px-4 py-3.5 rounded-2xl border border-gray-200 bg-white text-base focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm resize-none"
                />
              </div>
            </div>

            {/* Summary */}
            <div className="p-4 bg-white rounded-2xl border border-gray-200 shadow-sm">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Submitting</p>
              <p className="text-sm font-semibold text-gray-800 mb-1">
                {selectedTypeCfg?.emoji} {selectedTypeCfg?.label}
              </p>
              {items.map((item, i) => (
                <p key={i} className="text-sm text-gray-600">
                  • {item.item_type === 'asset' ? item.asset?.name :
                     item.item_type === 'product' ? item.product?.name : item.notes}
                  <span className="text-gray-400"> ×{item.quantity}</span>
                </p>
              ))}
            </div>

            {error && (
              <div className="flex items-center gap-3 p-4 bg-red-50 rounded-2xl border border-red-200">
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            {!detailsComplete && (
              <p className="text-xs text-gray-400 text-center">Cost center and job code are required.</p>
            )}
            <button onClick={submit} disabled={submitting || !detailsComplete}
              className="w-full h-14 rounded-2xl bg-indigo-600 text-white text-base font-bold active:bg-indigo-700 disabled:opacity-50 transition-colors shadow-lg shadow-indigo-200 flex items-center justify-center gap-2 mt-2">
              {submitting
                ? <Loader2 className="w-5 h-5 animate-spin" />
                : <CheckCircle2 className="w-5 h-5" />
              }
              Submit Request
            </button>
          </>
        )}
      </div>
    </div>
  )
}
