'use client'

import { useState, useCallback } from 'react'
import { BarcodeScanner } from '@/components/scanner/barcode-scanner'
import { LocationSelect } from '@/components/ui/location-select'
import {
  ScanBarcode, Search, X, Loader2, CheckCircle2,
  AlertCircle, Minus, Plus, Keyboard, ChevronLeft,
} from 'lucide-react'
import Link from 'next/link'

// ── Type config ───────────────────────────────────────────────────────────────
const LOG_TYPES = [
  { value: 'consumption', label: 'Issue to Job',  emoji: '⚙️',  needsFrom: true,  needsJob: true  },
  { value: 'purchase',    label: 'Receive Goods', emoji: '📦',  needsFrom: false, needsJob: false },
  { value: 'transfer',    label: 'Transfer',      emoji: '🔄',  needsFrom: true,  needsJob: false },
  { value: 'adjustment',  label: 'Adjust Stock',  emoji: '✏️', needsFrom: false, needsJob: false },
]

// ── Product search inline ─────────────────────────────────────────────────────
function ItemSearch({ onSelect }: { onSelect: (p: any) => void }) {
  const [q, setQ]           = useState('')
  const [results, setResults] = useState<any[]>([])
  const [busy, setBusy]     = useState(false)
  const [open, setOpen]     = useState(false)

  const search = async (val: string) => {
    setQ(val)
    if (val.length < 2) { setResults([]); setOpen(false); return }
    setBusy(true)
    try {
      const r = await fetch(`/api/products?q=${encodeURIComponent(val)}`)
      const j = await r.json()
      setResults(j.data ?? [])
      setOpen(true)
    } finally { setBusy(false) }
  }

  return (
    <div className="relative">
      <div className="relative flex items-center">
        <Search className="absolute left-4 w-5 h-5 text-gray-400 pointer-events-none" />
        <input
          value={q}
          onChange={e => search(e.target.value)}
          placeholder="Type item name or SKU…"
          autoFocus
          className="w-full h-14 pl-12 pr-10 rounded-2xl border border-gray-200 bg-white text-base focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
        />
        {busy && <Loader2 className="absolute right-4 w-4 h-4 text-gray-400 animate-spin" />}
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-20 left-0 right-0 mt-2 bg-white border border-gray-200 rounded-2xl shadow-xl max-h-64 overflow-y-auto">
          {results.map(p => (
            <button
              key={p.id}
              type="button"
              className="w-full text-left px-4 py-3.5 hover:bg-indigo-50 active:bg-indigo-100 transition-colors border-b border-gray-50 last:border-0"
              onClick={() => { onSelect(p); setQ(''); setOpen(false) }}
            >
              <p className="font-medium text-gray-900">{p.name}</p>
              <p className="text-sm text-gray-400 font-mono mt-0.5">{p.sku} · {p.unit_of_measure}</p>
            </button>
          ))}
        </div>
      )}
      {open && results.length === 0 && !busy && (
        <div className="absolute z-20 left-0 right-0 mt-2 bg-white border border-gray-200 rounded-2xl shadow-xl px-4 py-4 text-sm text-gray-400">
          No items found for "{q}"
        </div>
      )}
    </div>
  )
}

// ── Qty stepper ───────────────────────────────────────────────────────────────
function QtyStepper({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center gap-4 bg-gray-50 rounded-2xl p-2 border border-gray-200">
      <button
        type="button"
        onClick={() => onChange(Math.max(1, value - 1))}
        className="w-14 h-14 rounded-xl bg-white border border-gray-200 flex items-center justify-center active:bg-gray-50 shadow-sm text-gray-600 disabled:opacity-30"
        disabled={value <= 1}
      >
        <Minus className="w-5 h-5 stroke-[2.5]" />
      </button>
      <input
        type="number"
        min="1"
        value={value}
        onChange={e => onChange(Math.max(1, Number(e.target.value) || 1))}
        className="flex-1 text-center text-3xl font-bold text-gray-900 bg-transparent focus:outline-none"
      />
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        className="w-14 h-14 rounded-xl bg-white border border-gray-200 flex items-center justify-center active:bg-gray-50 shadow-sm text-gray-600"
      >
        <Plus className="w-5 h-5 stroke-[2.5]" />
      </button>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
type Step = 'type' | 'item' | 'details' | 'done'
type InputMode = 'scan' | 'search'

export default function FieldLogPage() {
  const [step, setStep]               = useState<Step>('type')
  const [typeIdx, setTypeIdx]         = useState(0)
  const [inputMode, setInputMode]     = useState<InputMode>('scan')
  const [product, setProduct]         = useState<any>(null)
  const [qty, setQty]                 = useState(1)
  const [fromLocation, setFromLocation] = useState('')
  const [toLocation, setToLocation]   = useState('')
  const [jobRef, setJobRef]           = useState('')
  const [refNo, setRefNo]             = useState('')
  const [notes, setNotes]             = useState('')
  const [submitting, setSubmitting]   = useState(false)
  const [errorMsg, setErrorMsg]       = useState('')
  const [scanError, setScanError]     = useState('')
  const [scanLookup, setScanLookup]   = useState(false)

  const logType = LOG_TYPES[typeIdx]

  const handleScan = useCallback(async (barcode: string) => {
    setScanLookup(true)
    setScanError('')
    try {
      const res  = await fetch(`/api/scan?barcode=${encodeURIComponent(barcode)}`)
      const json = await res.json()
      if (!res.ok || !json.data) {
        setScanError(`Barcode "${barcode}" not found.`)
      } else {
        setProduct(json.data)
        setStep('details')
      }
    } catch {
      setScanError('Network error — please try again.')
    } finally {
      setScanLookup(false)
    }
  }, [])

  const handleSubmit = async () => {
    setSubmitting(true)
    setErrorMsg('')
    const body: Record<string, any> = {
      transaction_type: logType.value,
      product_id: product.id,
      quantity: qty,
      unit_cost: product.avg_cost ?? 0,
      reference_no: refNo.trim() || undefined,
      notes: notes.trim() || undefined,
    }
    if (logType.needsFrom)           body.from_location_id = fromLocation || undefined
    if (!logType.needsFrom)          body.to_location_id   = toLocation   || undefined
    if (logType.value === 'transfer') { body.from_location_id = fromLocation; body.to_location_id = toLocation }
    if (logType.needsJob && jobRef.trim()) body.job_order_id = jobRef.trim()

    try {
      const res  = await fetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) { setErrorMsg(json.error ?? 'Something went wrong'); setSubmitting(false); return }
      setStep('done')
    } catch {
      setErrorMsg('Network error — please try again.')
      setSubmitting(false)
    }
  }

  const reset = () => {
    setStep('type'); setProduct(null); setQty(1)
    setFromLocation(''); setToLocation(''); setJobRef('')
    setRefNo(''); setNotes(''); setErrorMsg(''); setScanError('')
  }

  // ── Success screen ──────────────────────────────────────────────────────────
  if (step === 'done') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-6 px-6 text-center">
        <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center">
          <CheckCircle2 className="w-10 h-10 text-green-600" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Logged!</h2>
          <p className="text-gray-500 mt-1">
            {qty}× {product?.name}
            {jobRef && <span className="text-indigo-600"> → {jobRef}</span>}
          </p>
        </div>
        <button
          onClick={reset}
          className="w-full max-w-xs h-14 bg-indigo-600 text-white rounded-2xl font-semibold text-lg active:bg-indigo-700 transition-colors"
        >
          Log Another
        </button>
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
        <h1 className="font-bold text-gray-900 text-lg">Log Movement</h1>
      </div>

      <div className="flex-1 px-4 py-5 space-y-5">

        {/* ── Step 1: Type selection ── */}
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Transaction Type</p>
          <div className="grid grid-cols-2 gap-2">
            {LOG_TYPES.map((t, i) => (
              <button
                key={t.value}
                type="button"
                onClick={() => { setTypeIdx(i); setStep('item') }}
                className={`flex flex-col items-center gap-2 p-4 rounded-2xl border font-medium text-sm transition-all active:scale-95 ${
                  typeIdx === i && step !== 'type'
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                    : 'border-gray-200 bg-white text-gray-700'
                }`}
              >
                <span className="text-2xl">{t.emoji}</span>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Step 2: Item selection ── */}
        {step !== 'type' && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                Item {!product && <span className="text-red-400">*</span>}
              </p>
              {!product && (
                <div className="flex rounded-xl border border-gray-200 overflow-hidden text-xs bg-white">
                  <button
                    type="button"
                    onClick={() => { setInputMode('scan'); setScanError('') }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 transition-colors ${inputMode === 'scan' ? 'bg-indigo-600 text-white' : 'text-gray-500'}`}
                  >
                    <ScanBarcode className="w-3.5 h-3.5" /> Scan
                  </button>
                  <button
                    type="button"
                    onClick={() => setInputMode('search')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 transition-colors ${inputMode === 'search' ? 'bg-indigo-600 text-white' : 'text-gray-500'}`}
                  >
                    <Keyboard className="w-3.5 h-3.5" /> Type
                  </button>
                </div>
              )}
            </div>

            {product ? (
              <div className="flex items-center gap-3 bg-indigo-50 border border-indigo-200 rounded-2xl px-4 py-3.5">
                <div className="flex-1">
                  <p className="font-semibold text-gray-900">{product.name}</p>
                  <p className="text-sm text-gray-500 font-mono mt-0.5">{product.sku} · {product.unit_of_measure}</p>
                </div>
                <button
                  type="button"
                  onClick={() => { setProduct(null); setStep('item') }}
                  className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-gray-400 active:bg-gray-50 border border-gray-200"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : inputMode === 'scan' ? (
              <div className="rounded-2xl overflow-hidden border border-gray-200 bg-gray-900">
                {scanLookup ? (
                  <div className="flex flex-col items-center gap-3 py-16 text-gray-400">
                    <Loader2 className="w-10 h-10 animate-spin text-indigo-400" />
                    <p className="text-sm">Looking up barcode…</p>
                  </div>
                ) : (
                  <BarcodeScanner id="field-scanner" onScan={handleScan} className="p-4" />
                )}
                {scanError && (
                  <div className="mx-4 mb-4 flex items-center gap-2 bg-red-900/30 rounded-xl px-3 py-2.5 text-sm text-red-300">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {scanError}
                  </div>
                )}
              </div>
            ) : (
              <ItemSearch onSelect={p => { setProduct(p); setStep('details') }} />
            )}
          </div>
        )}

        {/* ── Step 3: Details ── */}
        {step === 'details' && product && (
          <>
            {/* Qty stepper */}
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Quantity</p>
              <QtyStepper value={qty} onChange={setQty} />
            </div>

            {/* Location(s) */}
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                {logType.value === 'transfer' ? 'From Location' : logType.needsFrom ? 'Source Location' : 'Destination Location'}
              </p>
              <LocationSelect
                value={logType.needsFrom || logType.value === 'transfer' ? fromLocation : toLocation}
                onChange={id => logType.needsFrom || logType.value === 'transfer' ? setFromLocation(id) : setToLocation(id)}
              />
            </div>

            {logType.value === 'transfer' && fromLocation && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">To Location</p>
                <LocationSelect value={toLocation} onChange={setToLocation} />
              </div>
            )}

            {/* Job reference */}
            {logType.needsJob && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                  Job Reference <span className="text-gray-300 font-normal normal-case">(for JobLedger)</span>
                </p>
                <input
                  value={jobRef}
                  onChange={e => setJobRef(e.target.value)}
                  placeholder="e.g. JOB-2026-001"
                  className="w-full h-14 px-4 rounded-2xl border border-gray-200 bg-white text-base focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm font-mono"
                />
              </div>
            )}

            {/* Reference + notes (collapsed unless needed) */}
            <details className="group">
              <summary className="text-xs font-semibold text-gray-400 uppercase tracking-wide cursor-pointer list-none flex items-center gap-2">
                <span>More options</span>
                <span className="text-gray-300 group-open:rotate-90 transition-transform">›</span>
              </summary>
              <div className="mt-3 space-y-3">
                <input
                  value={refNo}
                  onChange={e => setRefNo(e.target.value)}
                  placeholder="Reference No. (PO-001, SO-001…)"
                  className="w-full h-12 px-4 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Notes…"
                  rows={2}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              </div>
            </details>

            {errorMsg && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
                <AlertCircle className="w-4 h-4 flex-shrink-0" /> {errorMsg}
              </div>
            )}

            {/* Submit */}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full h-16 rounded-2xl bg-indigo-600 text-white font-bold text-lg active:bg-indigo-700 disabled:opacity-60 transition-colors flex items-center justify-center gap-3 shadow-md shadow-indigo-200"
            >
              {submitting
                ? <><Loader2 className="w-5 h-5 animate-spin" /> Saving…</>
                : <>Confirm &amp; Log {qty}× {product?.unit_of_measure}</>
              }
            </button>
          </>
        )}
      </div>
    </div>
  )
}
