'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { X, Loader2, Truck, AlertCircle } from 'lucide-react'

/**
 * Confirm an in-transit delivery. The receiver enters how many actually arrived
 * (GRN-style) — any shortfall stays in transit to be received later.
 */
export function ReceiveDeliveryDialog({
  transfer,
  onClose,
  onDone,
}: {
  transfer: any
  onClose: () => void
  onDone: () => void
}) {
  const outstanding = Number(transfer?.quantity ?? 0) - Number(transfer?.quantity_received ?? 0)
  const [qty, setQty]       = useState(String(outstanding || 1))
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  const receive = async () => {
    const q = Number(qty)
    if (!Number.isFinite(q) || q < 1) { setError('Enter a quantity of at least 1'); return }
    if (q > outstanding) { setError(`Only ${outstanding} still in transit`); return }

    setSaving(true); setError('')
    try {
      const res = await fetch(`/api/transfers/${transfer.id}/receive`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ quantity_received: q }),
      })
      const j = await res.json()
      if (!res.ok) { setError(j.error ?? 'Could not receive the delivery'); setSaving(false); return }
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
            <Truck className="w-5 h-5 text-indigo-600" />
            <h3 className="font-semibold text-slate-900">Receive delivery</h3>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
            <p className="font-medium text-slate-900 text-sm">{transfer?.product?.name}</p>
            <p className="text-xs text-slate-500 mt-0.5">
              {transfer?.from_location?.name} → <span className="font-medium">{transfer?.to_location?.name}</span>
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              {outstanding} {transfer?.product?.unit_of_measure} in transit
            </p>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Quantity received</label>
            <Input type="number" min="1" max={outstanding} value={qty} onChange={e => setQty(e.target.value)} className="max-w-[8rem]" />
            {Number(qty) < outstanding && Number(qty) > 0 && (
              <p className="text-xs text-amber-600 mt-1">
                Short by {outstanding - Number(qty)} — the rest stays in transit.
              </p>
            )}
          </div>

          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 text-sm text-red-700">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /> {error}
            </div>
          )}
        </div>

        <div className="flex gap-2 justify-end px-5 py-4 border-t border-slate-100">
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button size="sm" onClick={receive} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Truck className="w-4 h-4" />}
            Confirm receipt
          </Button>
        </div>
      </div>
    </div>
  )
}
