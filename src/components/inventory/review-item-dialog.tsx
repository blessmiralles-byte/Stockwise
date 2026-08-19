'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { LocationSelect } from '@/components/ui/location-select'
import { BarcodeScanner } from '@/components/scanner/barcode-scanner'
import { X, Loader2, CheckCircle2, AlertCircle, ScanBarcode } from 'lucide-react'

const UNITS = ['pcs', 'kg', 'g', 'lbs', 'oz', 'liters', 'ml', 'meters', 'ft', 'box', 'pack', 'roll', 'set', 'pair']

export interface ReviewProduct {
  id: string
  name?: string
  sku?: string
  barcode?: string
  unit_of_measure?: string
  cost_method?: string
  reorder_point?: number
  category?: { id?: string; name?: string } | null
}

/**
 * Review & approve an item that was auto-created during receiving / the field
 * "Add Item" flow (needs_review = true). Lets a manager confirm the catalog
 * details, optionally record opening stock at a unit cost (which gives the item
 * its price/value), and clear the review flag.
 */
export function ReviewItemDialog({
  product,
  onClose,
  onDone,
}: {
  product: ReviewProduct
  onClose: () => void
  onDone: () => void
}) {
  const [name, setName]           = useState(product.name ?? '')
  const [categoryId, setCategory] = useState(product.category?.id ?? '')
  const [unit, setUnit]           = useState(product.unit_of_measure ?? 'pcs')
  const [costMethod, setCostMethod] = useState(product.cost_method ?? 'average')
  const [reorder, setReorder]     = useState(String(product.reorder_point ?? ''))
  const [barcode, setBarcode]     = useState(product.barcode ?? '')

  // Optional opening stock — this is how a brand-new item gets a price/value.
  const [qty, setQty]             = useState('')
  const [unitCost, setUnitCost]   = useState('')
  const [locationId, setLocationId] = useState('')

  const [categories, setCategories] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const [scanning, setScanning] = useState(false)

  useEffect(() => {
    fetch('/api/categories')
      .then(r => r.json())
      .then(j => setCategories((j.data ?? []).filter((c: any) => c.type !== 'asset')))
      .catch(() => {})
  }, [])

  const wantsOpening = Number(qty) > 0

  const approve = async () => {
    if (!name.trim()) { setError('Item name is required'); return }
    if (wantsOpening && !locationId) { setError('Choose a location for the opening stock'); return }
    setSaving(true); setError('')

    try {
      // 1. Save catalog details + clear the review flag
      const pRes = await fetch(`/api/products/${product.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:            name.trim(),
          category_id:     categoryId || null,
          unit_of_measure: unit,
          cost_method:     costMethod,
          reorder_point:   reorder ? Number(reorder) : 0,
          barcode:         barcode.trim() || null,
          needs_review:    false,
        }),
      })
      const pJson = await pRes.json()
      if (!pRes.ok) { setError(pJson.error ?? 'Failed to save item'); setSaving(false); return }

      // 2. Optional opening stock → sets quantity + unit cost (the price)
      if (wantsOpening) {
        const iRes = await fetch('/api/inventory', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            transaction_type: 'purchase',
            product_id:       product.id,
            quantity:         Number(qty),
            unit_cost:        Number(unitCost) || 0,
            to_location_id:   locationId,
            reference_no:     'Opening stock',
            notes:            'Opening balance recorded during item review',
          }),
        })
        const iJson = await iRes.json()
        if (!iRes.ok) {
          setError(`Item approved, but opening stock failed: ${iJson.error ?? 'unknown error'}`)
          setSaving(false)
          return
        }
      }

      onDone()
    } catch {
      setError('Network error — please try again.')
      setSaving(false)
    }
  }

  return (
    <>
    {scanning && (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onClick={() => setScanning(false)}>
        <div className="w-full max-w-sm rounded-2xl bg-white p-4" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-slate-800">Scan barcode</p>
            <button onClick={() => setScanning(false)} aria-label="Close scanner" className="text-slate-400 hover:text-slate-600">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-900">
            <BarcodeScanner
              id="review-barcode-scanner"
              className="p-3"
              onScan={code => { setBarcode(code); setScanning(false) }}
            />
          </div>
          <p className="mt-2 text-center text-[11px] text-slate-400">Point the rear camera at the barcode</p>
        </div>
      </div>
    )}
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl">
          <div>
            <h3 className="font-semibold text-slate-900">Review item</h3>
            <p className="text-xs text-slate-400 font-mono">{product.sku}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Details */}
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Item name *</label>
            <Input value={name} onChange={e => setName(e.target.value)} autoFocus />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Category</label>
              <select
                value={categoryId}
                onChange={e => setCategory(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">— None —</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Unit</label>
              <select
                value={unit}
                onChange={e => setUnit(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Costing</label>
              <select
                value={costMethod}
                onChange={e => setCostMethod(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="average">Weighted average</option>
                <option value="fifo">FIFO</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Reorder at</label>
              <Input type="number" min="0" value={reorder} onChange={e => setReorder(e.target.value)} placeholder="0" />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-medium text-slate-600 block mb-1">Barcode</label>
              <div className="flex gap-2">
                <Input value={barcode} onChange={e => setBarcode(e.target.value)} className="font-mono flex-1" placeholder="Type or scan" />
                <Button type="button" variant="outline" size="sm" className="gap-1.5 flex-shrink-0" onClick={() => setScanning(true)}>
                  <ScanBarcode className="w-3.5 h-3.5" /> Scan
                </Button>
              </div>
            </div>
          </div>

          {/* Opening stock (optional) */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-3">
            <div>
              <p className="text-xs font-semibold text-slate-700">Opening stock &amp; price <span className="font-normal text-slate-400">(optional)</span></p>
              <p className="text-xs text-slate-400 mt-0.5">Record what you have on hand and its unit cost to set the item&apos;s value.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Quantity</label>
                <Input type="number" min="0" value={qty} onChange={e => setQty(e.target.value)} placeholder="0" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Unit cost</label>
                <Input type="number" min="0" step="0.01" value={unitCost} onChange={e => setUnitCost(e.target.value)} placeholder="0.00" />
              </div>
            </div>
            {wantsOpening && (
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Location *</label>
                <LocationSelect value={locationId} onChange={id => setLocationId(id)} />
              </div>
            )}
          </div>

          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 text-sm text-red-700">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /> {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 justify-end px-5 py-4 border-t border-slate-100 sticky bottom-0 bg-white rounded-b-2xl">
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button size="sm" onClick={approve} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            Approve item
          </Button>
        </div>
      </div>
    </div>
    </>
  )
}
