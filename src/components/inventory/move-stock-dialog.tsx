'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { LocationSelect } from '@/components/ui/location-select'
import { X, Loader2, ArrowLeftRight, AlertCircle } from 'lucide-react'

/**
 * Move stock from one location to another — a transfer pre-filled with the item
 * and its current location. Works across floors / rooms / buildings since it's
 * just from_location → to_location.
 */
export function MoveStockDialog({
  balance,
  onClose,
  onDone,
}: {
  balance: any
  onClose: () => void
  onDone: () => void
}) {
  const available = Number(balance?.quantity ?? 0)
  const fromId    = balance?.location?.id ?? null
  const fromName  = balance?.location?.name ?? 'current location'

  const [toLocation, setToLocation] = useState('')
  const [toPath, setToPath]         = useState('')
  const [qty, setQty]               = useState(String(available || 1))
  const [inTransit, setInTransit]   = useState(false)
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState('')

  const move = async () => {
    const q = Number(qty)
    if (!toLocation)          { setError('Choose a destination location'); return }
    if (toLocation === fromId){ setError('Destination must be different from the current location'); return }
    if (!Number.isFinite(q) || q < 1) { setError('Enter a quantity of at least 1'); return }
    if (q > available)        { setError(`Only ${available} in stock at ${fromName}`); return }

    setSaving(true); setError('')
    try {
      // In transit → ship to the holding location; the destination confirms on
      // arrival. Otherwise it's an instant transfer (same building).
      const url  = inTransit ? '/api/transfers' : '/api/inventory'
      const body = inTransit
        ? { product_id: balance.product.id, from_location_id: fromId, to_location_id: toLocation, quantity: q, notes: 'Stock move (in transit)' }
        : { transaction_type: 'transfer', product_id: balance.product.id, from_location_id: fromId, to_location_id: toLocation, quantity: q, notes: 'Stock move' }

      const res = await fetch(url, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      })
      const j = await res.json()
      if (!res.ok) { setError(j.error ?? 'Could not move the stock'); setSaving(false); return }
      onDone()
    } catch {
      setError('Network error — please try again.')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <ArrowLeftRight className="w-5 h-5 text-indigo-600" />
            <h3 className="font-semibold text-slate-900">Move stock</h3>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
            <p className="font-medium text-slate-900 text-sm">{balance?.product?.name}</p>
            <p className="text-xs text-slate-500 mt-0.5">
              {available} {balance?.product?.unit_of_measure} at <span className="font-medium">{fromName}</span>
            </p>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Move to</label>
            <LocationSelect value={toLocation} onChange={(id, path) => { setToLocation(id); setToPath(path) }} />
            {toPath && <p className="text-xs text-slate-400 mt-1">{toPath}</p>}
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Quantity</label>
            <Input type="number" min="1" max={available} value={qty} onChange={e => setQty(e.target.value)} className="max-w-[8rem]" />
          </div>

          <label className="flex items-start gap-2.5 cursor-pointer select-none rounded-xl border border-slate-200 p-3">
            <input
              type="checkbox"
              checked={inTransit}
              onChange={e => setInTransit(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 flex-shrink-0"
            />
            <span className="text-xs text-slate-600 leading-relaxed">
              <span className="font-medium text-slate-800">Delivered later (mark in transit)</span><br />
              Ships to a holding area until it arrives — the destination confirms the delivery. Leave
              unchecked for an instant move (e.g. same building).
            </span>
          </label>

          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 text-sm text-red-700">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /> {error}
            </div>
          )}
        </div>

        <div className="flex gap-2 justify-end px-5 py-4 border-t border-slate-100">
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button size="sm" onClick={move} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowLeftRight className="w-4 h-4" />}
            {inTransit ? 'Ship' : 'Move'}
          </Button>
        </div>
      </div>
    </div>
  )
}
