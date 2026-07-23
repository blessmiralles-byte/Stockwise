'use client'

import { useState } from 'react'
import { BarcodeScanner } from '@/components/scanner/barcode-scanner'
import {
  ScanBarcode, Keyboard, Loader2, CheckCircle2, AlertCircle,
  ChevronLeft, PackagePlus,
} from 'lucide-react'
import Link from 'next/link'

const UNITS = ['pcs', 'kg', 'g', 'lbs', 'oz', 'liters', 'ml', 'meters', 'ft', 'box', 'pack', 'roll', 'set', 'pair']

type BarcodeMode = 'scan' | 'manual'

export default function FieldAddItemPage() {
  const [barcode, setBarcode]   = useState('')
  const [name, setName]         = useState('')
  const [unit, setUnit]         = useState('pcs')
  const [reorder, setReorder]   = useState('')
  const [mode, setMode]         = useState<BarcodeMode>('scan')
  const [checking, setChecking] = useState(false)
  const [dupWarn, setDupWarn]   = useState('')
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')
  const [done, setDone]         = useState<null | { name: string; existed: boolean }>(null)

  // Scanned a barcode → capture it, flip to the details form, and check whether
  // it's already in the catalog (still allowed — they can receive it instead).
  const handleScan = async (code: string) => {
    setBarcode(code)
    setMode('manual')
    setDupWarn('')
    setError('')
    setChecking(true)
    try {
      const r = await fetch(`/api/scan?barcode=${encodeURIComponent(code)}`)
      const j = await r.json()
      if (r.ok && j.data) {
        setName(j.data.name ?? '')
        setUnit(j.data.unit_of_measure ?? 'pcs')
        setDupWarn(`"${j.data.name}" is already in your catalog — you can receive stock for it instead.`)
      }
    } catch { /* non-fatal — worker can still fill it in */ }
    finally { setChecking(false) }
  }

  const save = async () => {
    if (!barcode.trim()) { setError('Scan or enter a barcode first'); return }
    if (!name.trim())    { setError('Enter an item name'); return }
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/products/from-barcode', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          barcode:         barcode.trim(),
          name:            name.trim(),
          unit_of_measure: unit,
          reorder_point:   reorder ? Number(reorder) : 0,
        }),
      })
      const j = await res.json()
      if (!res.ok) { setError(j.error ?? 'Failed to add item'); setSaving(false); return }
      setDone({ name: j.data?.name ?? name.trim(), existed: j.created === false })
    } catch {
      setError('Network error — please try again.')
      setSaving(false)
    }
  }

  const reset = () => {
    setBarcode(''); setName(''); setUnit('pcs'); setReorder('')
    setMode('scan'); setChecking(false); setDupWarn(''); setError(''); setDone(null); setSaving(false)
  }

  // ── Success screen ──────────────────────────────────────────────────────────
  if (done) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-6 px-6 text-center">
        <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center">
          <CheckCircle2 className="w-10 h-10 text-green-600" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            {done.existed ? 'Already in catalog' : 'Item added!'}
          </h2>
          <p className="text-gray-500 mt-1">{done.name}</p>
          {!done.existed && (
            <p className="mt-2 text-xs text-gray-400">
              Added to your inventory list — flagged for a manager to review the details.
            </p>
          )}
        </div>
        <div className="w-full max-w-xs space-y-3">
          <Link
            href="/field/log"
            className="flex items-center justify-center w-full h-14 bg-green-600 text-white rounded-2xl font-semibold text-base active:bg-green-700 transition-colors"
          >
            Receive stock for this item
          </Link>
          <button
            onClick={reset}
            className="w-full h-14 bg-indigo-600 text-white rounded-2xl font-semibold text-lg active:bg-indigo-700 transition-colors"
          >
            Add Another
          </button>
        </div>
        <Link href="/field" className="text-sm text-gray-400 hover:text-gray-600">Back to Hub</Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-10 pb-4 bg-white border-b border-gray-100">
        <Link href="/field" className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center text-gray-600 active:bg-gray-200">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <h1 className="font-bold text-gray-900 text-lg">Add Item</h1>
      </div>

      <div className="flex-1 px-4 py-5 space-y-5 pb-10">

        {/* ── Barcode capture ── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
              Barcode {!barcode && <span className="text-red-400">*</span>}
            </p>
            <div className="flex rounded-xl border border-gray-200 overflow-hidden text-xs bg-white">
              <button
                type="button"
                onClick={() => setMode('scan')}
                className={`flex items-center gap-1.5 px-3 py-1.5 transition-colors ${mode === 'scan' ? 'bg-indigo-600 text-white' : 'text-gray-500'}`}
              >
                <ScanBarcode className="w-3.5 h-3.5" /> Scan
              </button>
              <button
                type="button"
                onClick={() => setMode('manual')}
                className={`flex items-center gap-1.5 px-3 py-1.5 transition-colors ${mode === 'manual' ? 'bg-indigo-600 text-white' : 'text-gray-500'}`}
              >
                <Keyboard className="w-3.5 h-3.5" /> Type
              </button>
            </div>
          </div>

          {mode === 'scan' && !barcode ? (
            <div className="rounded-2xl overflow-hidden border border-gray-200 bg-gray-900">
              {checking ? (
                <div className="flex flex-col items-center gap-3 py-16 text-gray-400">
                  <Loader2 className="w-10 h-10 animate-spin text-indigo-400" />
                  <p className="text-sm">Checking barcode…</p>
                </div>
              ) : (
                <BarcodeScanner id="add-item-scanner" onScan={handleScan} className="p-4" />
              )}
            </div>
          ) : (
            <input
              value={barcode}
              onChange={e => setBarcode(e.target.value)}
              placeholder="Enter or scan a barcode"
              className="w-full h-14 px-4 rounded-2xl border border-gray-200 bg-white text-base font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
            />
          )}

          {dupWarn && (
            <div className="mt-2 flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5 text-xs text-amber-700">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{dupWarn}</span>
            </div>
          )}
        </div>

        {/* ── Item details ── */}
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
            Item Name <span className="text-red-400">*</span>
          </p>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. WD-40 Spray 350ml"
            className="w-full h-14 px-4 rounded-2xl border border-gray-200 bg-white text-base focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Unit</p>
            <select
              value={unit}
              onChange={e => setUnit(e.target.value)}
              className="w-full h-14 px-4 rounded-2xl border border-gray-200 bg-white text-base focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
            >
              {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
              Reorder at <span className="text-gray-300 font-normal normal-case">(optional)</span>
            </p>
            <input
              type="number"
              inputMode="numeric"
              min="0"
              value={reorder}
              onChange={e => setReorder(e.target.value)}
              placeholder="0"
              className="w-full h-14 px-4 rounded-2xl border border-gray-200 bg-white text-base focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
            />
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
            <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
          </div>
        )}

        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="w-full h-16 rounded-2xl bg-green-600 text-white font-bold text-lg active:bg-green-700 disabled:opacity-60 transition-colors flex items-center justify-center gap-3 shadow-md shadow-green-200"
        >
          {saving
            ? <><Loader2 className="w-5 h-5 animate-spin" /> Saving…</>
            : <><PackagePlus className="w-5 h-5" /> Add to Inventory</>
          }
        </button>
        <p className="text-xs text-center text-gray-400">
          New items are flagged for a manager to review the details.
        </p>
      </div>
    </div>
  )
}
