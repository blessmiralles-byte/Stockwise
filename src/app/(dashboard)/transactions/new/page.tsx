'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Topbar } from '@/components/layout/topbar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { LocationSelect } from '@/components/ui/location-select'
import { BarcodeScanner } from '@/components/scanner/barcode-scanner'
import { useRouter } from 'next/navigation'
import {
  ArrowRight, Search, X, Loader2, CheckCircle2,
  AlertCircle, ScanBarcode, Keyboard, Save, FileCheck,
} from 'lucide-react'

const transactionTypes = [
  { value: 'purchase',    label: 'Purchase',    description: 'Receive goods from supplier',       icon: '📦' },
  { value: 'transfer',    label: 'Transfer',    description: 'Move items between locations',       icon: '🔄' },
  { value: 'consumption', label: 'Consumption', description: 'Issue to internal use or a job',    icon: '⚙️' },
  { value: 'sale',        label: 'Sale',        description: 'Sell or charge items to a customer', icon: '🛒' },
  { value: 'adjustment',  label: 'Adjustment',  description: 'Correct a stock discrepancy',        icon: '✏️' },
]

// ── Product search ────────────────────────────────────────────────────────────
function ProductSearch({ onSelect }: { onSelect: (p: any) => void }) {
  const [q, setQ]               = useState('')
  const [results, setResults]   = useState<any[]>([])
  const [searching, setSearching] = useState(false)
  const [open, setOpen]         = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (q.length < 2) { setResults([]); setOpen(false); return }
    const t = setTimeout(async () => {
      setSearching(true)
      try {
        const r = await fetch(`/api/products?q=${encodeURIComponent(q)}`)
        const j = await r.json()
        setResults(j.data ?? [])
        setOpen(true)
      } finally { setSearching(false) }
    }, 300)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search by name or SKU…"
          className="flex h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-9 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          autoFocus
        />
        {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 animate-spin" />}
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-20 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
          {results.map(p => (
            <button
              key={p.id}
              type="button"
              className="w-full text-left px-3 py-2.5 hover:bg-indigo-50 transition-colors"
              onClick={() => { onSelect(p); setQ(''); setOpen(false) }}
            >
              <p className="text-sm font-medium text-slate-900">{p.name}</p>
              <p className="text-xs text-slate-400 font-mono">{p.sku} · {p.unit_of_measure}</p>
            </button>
          ))}
        </div>
      )}
      {open && results.length === 0 && !searching && q.length >= 2 && (
        <div className="absolute z-20 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-3 text-sm text-slate-400">
          No items found for "{q}"
        </div>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
type Status    = 'idle' | 'submitting' | 'success' | 'error'
type SaveMode  = 'draft' | 'post'
type InputMode = 'search' | 'scan'

export default function NewTransactionPage() {
  const router = useRouter()

  const [type, setType]                     = useState('purchase')
  const [product, setProduct]               = useState<any | null>(null)
  const [qty, setQty]                       = useState('1')
  const [unitCost, setUnitCost]             = useState('')
  const [refNo, setRefNo]                   = useState('')
  const [notes, setNotes]                   = useState('')
  const [customer, setCustomer]             = useState('')
  const [jobRef, setJobRef]                 = useState('')
  const [batchNo, setBatchNo]               = useState('')
  const [expirationDate, setExpirationDate] = useState('')
  const [fromLocationId, setFromLocationId] = useState('')
  const [toLocationId, setToLocationId]     = useState('')
  const [status, setStatus]                 = useState<Status>('idle')
  const [saveMode, setSaveMode]             = useState<SaveMode>('draft')
  const [errorMsg, setErrorMsg]             = useState('')

  // Purchase PO linking
  const [pendingPOs, setPendingPOs]   = useState<any[]>([])
  const [selectedPO, setSelectedPO]   = useState<any | null>(null)
  const [selectedLine, setSelectedLine] = useState<any | null>(null)

  const [inputMode, setInputMode]   = useState<InputMode>('search')
  const [scanLookup, setScanLookup] = useState(false)
  const [scanError, setScanError]   = useState('')

  const needsFrom   = ['transfer', 'consumption', 'sale'].includes(type)
  const needsTo     = ['purchase', 'transfer', 'adjustment'].includes(type)
  const canChargeTo = ['consumption', 'sale'].includes(type)
  const isPurchase  = type === 'purchase'

  const resetLocations = () => { setFromLocationId(''); setToLocationId('') }

  // Load pending POs when purchase type is selected
  useEffect(() => {
    if (!isPurchase) { setPendingPOs([]); setSelectedPO(null); setSelectedLine(null); return }
    fetch('/api/purchase-orders/pending')
      .then(r => r.json())
      .then(j => setPendingPOs(j.data ?? []))
      .catch(() => {})
  }, [isPurchase])

  // When a PO line is selected, pre-fill item + cost
  function handlePOLineSelect(po: any, line: any) {
    setSelectedPO(po)
    setSelectedLine(line)
    setProduct(line.product)
    setUnitCost(String(line.unit_cost ?? ''))
    setRefNo(po.po_number)
    setQty('')
  }

  const handleScan = useCallback(async (barcode: string) => {
    setScanLookup(true)
    setScanError('')
    try {
      const res  = await fetch(`/api/scan?barcode=${encodeURIComponent(barcode)}`)
      const json = await res.json()
      if (!res.ok || !json.data) {
        setScanError(`Barcode "${barcode}" not found in inventory.`)
      } else {
        setProduct(json.data)
        setUnitCost(String(json.data.avg_cost ?? ''))
        setInputMode('search')
      }
    } catch {
      setScanError('Network error — please try again.')
    } finally {
      setScanLookup(false)
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent, mode: SaveMode) => {
    e.preventDefault()
    if (!product) { setErrorMsg('Please select an item first.'); return }

    setSaveMode(mode)
    setStatus('submitting')
    setErrorMsg('')

    const body: Record<string, any> = {
      transaction_type: type,
      product_id:       product.id,
      quantity:         Number(qty),
      unit_cost:        Number(unitCost) || 0,
      reference_no:     refNo.trim()  || undefined,
      notes:            notes.trim()  || undefined,
      draft:            mode === 'draft',
    }

    if (selectedPO) body.related_po_id = selectedPO.id

    if (type === 'transfer') {
      body.from_location_id = fromLocationId || undefined
      body.to_location_id   = toLocationId   || undefined
    } else if (needsFrom) {
      body.from_location_id = fromLocationId || undefined
    } else {
      body.to_location_id   = toLocationId   || undefined
    }

    if (type === 'purchase') {
      body.batch_no        = batchNo.trim() || undefined
      body.expiration_date = expirationDate  || undefined
    }

    if (canChargeTo) {
      if (customer.trim()) body.customer_id  = customer.trim()
      if (jobRef.trim())   body.job_order_id = jobRef.trim()
    }

    try {
      const res  = await fetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) { setErrorMsg(json.error ?? 'Something went wrong'); setStatus('error'); return }
      setStatus('success')
      setTimeout(() => router.push('/transactions'), 1500)
    } catch {
      setErrorMsg('Network error — please try again.')
      setStatus('error')
    }
  }

  if (status === 'success') {
    return (
      <div>
        <Topbar title="New Transaction" />
        <div className="p-6 max-w-xl">
          <Card>
            <CardContent className="py-16 flex flex-col items-center gap-3">
              <CheckCircle2 className="w-12 h-12 text-green-500" />
              <p className="text-lg font-semibold text-slate-900">
                {saveMode === 'draft' ? 'Draft saved' : 'Transaction posted'}
              </p>
              <p className="text-sm text-slate-400">
                {saveMode === 'draft' ? 'Review and post it from the Transactions list.' : 'Inventory updated.'}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div>
      <Topbar title="New Transaction" />
      <div className="p-6 max-w-xl">
        <Card>
          <CardHeader><CardTitle>Record Inventory Transaction</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={e => handleSubmit(e, 'draft')} className="space-y-5">

              {/* Transaction type */}
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-2">Transaction Type</label>
                <div className="grid grid-cols-1 gap-2">
                  {transactionTypes.map(t => (
                    <label
                      key={t.value}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        type === t.value ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="radio" name="type" value={t.value}
                        checked={type === t.value}
                        onChange={() => { setType(t.value); resetLocations(); setCustomer(''); setJobRef(''); setSelectedPO(null); setSelectedLine(null); setProduct(null) }}
                        className="sr-only"
                      />
                      <span className="text-lg leading-none">{t.icon}</span>
                      <div className="flex-1">
                        <p className="font-medium text-sm text-slate-900">{t.label}</p>
                        <p className="text-xs text-slate-500">{t.description}</p>
                      </div>
                      {type === t.value && (
                        <div className="w-4 h-4 rounded-full bg-indigo-500 flex-shrink-0 flex items-center justify-center">
                          <div className="w-1.5 h-1.5 rounded-full bg-white" />
                        </div>
                      )}
                    </label>
                  ))}
                </div>
              </div>

              {/* Purchase: PO selector */}
              {isPurchase && (
                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-2">
                    Receive From (Purchase Order)
                  </label>
                  {pendingPOs.length === 0 ? (
                    <p className="text-xs text-slate-400 py-2">No pending purchase orders found.</p>
                  ) : (
                    <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                      {pendingPOs.map(po => (
                        <div key={po.id} className="border border-slate-200 rounded-lg overflow-hidden">
                          <div className="px-3 py-2 bg-slate-50 flex items-center justify-between">
                            <span className="font-mono text-xs font-semibold text-slate-700">{po.po_number}</span>
                            <span className="text-xs text-slate-500">{po.supplier?.name ?? 'No supplier'}</span>
                          </div>
                          {po.lines
                            .filter((l: any) => l.quantity_ordered > l.quantity_received)
                            .map((l: any) => (
                              <button
                                key={l.id}
                                type="button"
                                onClick={() => handlePOLineSelect(po, l)}
                                className={`w-full text-left px-3 py-2 flex items-center justify-between text-sm transition-colors ${
                                  selectedLine?.id === l.id
                                    ? 'bg-indigo-50 border-l-2 border-indigo-500'
                                    : 'hover:bg-slate-50'
                                }`}
                              >
                                <span className="font-medium text-slate-900">{l.product?.name}</span>
                                <span className="text-xs text-slate-500">
                                  Outstanding: {l.quantity_ordered - l.quantity_received} {l.product?.unit_of_measure}
                                </span>
                              </button>
                            ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Item — search or scan (skip if PO line selected for purchase) */}
              {(!isPurchase || !selectedLine) && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-slate-700">
                      Item <span className="text-red-500">*</span>
                    </label>
                    {!product && (
                      <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs">
                        <button
                          type="button"
                          onClick={() => setInputMode('search')}
                          className={`flex items-center gap-1 px-2.5 py-1.5 transition-colors ${
                            inputMode === 'search' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'
                          }`}
                        >
                          <Keyboard className="w-3 h-3" /> Search
                        </button>
                        <button
                          type="button"
                          onClick={() => { setInputMode('scan'); setScanError('') }}
                          className={`flex items-center gap-1 px-2.5 py-1.5 transition-colors ${
                            inputMode === 'scan' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'
                          }`}
                        >
                          <ScanBarcode className="w-3 h-3" /> Scan
                        </button>
                      </div>
                    )}
                  </div>

                  {product ? (
                    <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2.5">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-slate-900">{product.name}</p>
                        <p className="text-xs text-slate-500 font-mono">{product.sku} · {product.unit_of_measure}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => { setProduct(null); setInputMode('search') }}
                        className="text-slate-400 hover:text-red-500 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : inputMode === 'search' ? (
                    <ProductSearch onSelect={p => { setProduct(p); setUnitCost(String(p.avg_cost ?? '')) }} />
                  ) : (
                    <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50">
                      {scanLookup ? (
                        <div className="flex flex-col items-center gap-3 py-12 text-slate-500">
                          <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
                          <p className="text-sm">Looking up barcode…</p>
                        </div>
                      ) : (
                        <BarcodeScanner id="tx-scanner" onScan={handleScan} className="p-4" />
                      )}
                      {scanError && (
                        <div className="flex items-center gap-2 mx-4 mb-4 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">
                          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                          {scanError}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Selected PO line summary */}
              {isPurchase && selectedLine && (
                <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2.5">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-900">{selectedLine.product?.name}</p>
                    <p className="text-xs text-slate-500 font-mono">{selectedLine.product?.sku} · from {selectedPO.po_number}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setSelectedLine(null); setSelectedPO(null); setProduct(null); setRefNo(''); setUnitCost('') }}
                    className="text-slate-400 hover:text-red-500 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Qty — cost hidden for purchase (comes from PO) */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-1">Quantity <span className="text-red-500">*</span></label>
                  <Input type="number" min="1" value={qty} onChange={e => setQty(e.target.value)} required />
                </div>
                {!isPurchase && (
                  <div>
                    <label className="text-sm font-medium text-slate-700 block mb-1">Unit Cost</label>
                    <Input type="number" min="0" step="0.01" placeholder="0.00" value={unitCost} onChange={e => setUnitCost(e.target.value)} />
                  </div>
                )}
              </div>

              {/* Location(s) */}
              {type === 'transfer' ? (
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-slate-700 block mb-2">From Location</label>
                    <LocationSelect value={fromLocationId} onChange={id => setFromLocationId(id)} />
                  </div>
                  {fromLocationId && (
                    <>
                      <div className="flex items-center gap-2 text-slate-300">
                        <div className="flex-1 h-px bg-slate-200" />
                        <ArrowRight className="w-4 h-4" />
                        <div className="flex-1 h-px bg-slate-200" />
                      </div>
                      <div>
                        <label className="text-sm font-medium text-slate-700 block mb-2">To Location</label>
                        <LocationSelect value={toLocationId} onChange={id => setToLocationId(id)} />
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-2">
                    {needsFrom ? 'Source Location' : 'Destination Location'}
                  </label>
                  <LocationSelect
                    value={needsFrom ? fromLocationId : toLocationId}
                    onChange={id => needsFrom ? setFromLocationId(id) : setToLocationId(id)}
                  />
                </div>
              )}

              {/* Charge-to fields for consumption / sale */}
              {canChargeTo && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium text-slate-700 block mb-1">Customer</label>
                    <Input
                      placeholder="Name or account…"
                      value={customer}
                      onChange={e => setCustomer(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-700 block mb-1">
                      Job Reference
                      <span className="ml-1 text-xs font-normal text-slate-400">(for JobLedger)</span>
                    </label>
                    <Input
                      placeholder="e.g. JOB-2026-001"
                      value={jobRef}
                      onChange={e => setJobRef(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {/* Batch / expiry (purchase only, not PO-linked) */}
              {type === 'purchase' && !selectedLine && (product?.cost_method === 'fifo' || product?.track_expiry) && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium text-slate-700 block mb-1">Batch / Lot No.</label>
                    <Input placeholder="e.g. LOT-2025-001" value={batchNo} onChange={e => setBatchNo(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-700 block mb-1">Expiration Date</label>
                    <Input type="date" value={expirationDate} onChange={e => setExpirationDate(e.target.value)} />
                  </div>
                </div>
              )}

              {/* Reference + notes */}
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1">Reference No.</label>
                <Input placeholder="PO-001, SO-001, etc." value={refNo} onChange={e => setRefNo(e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1">Notes</label>
                <textarea
                  className="flex min-h-[72px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Optional…"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                />
              </div>

              {status === 'error' && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 text-sm text-red-700">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" /> {errorMsg}
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <Button
                  type="button"
                  disabled={status === 'submitting'}
                  className="gap-2 flex-1"
                  onClick={e => handleSubmit(e as any, 'draft')}
                >
                  {status === 'submitting' && saveMode === 'draft'
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <Save className="w-4 h-4" />
                  }
                  Save Draft
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={status === 'submitting'}
                  className="gap-2 flex-1 border-green-500 text-green-700 hover:bg-green-50"
                  onClick={e => handleSubmit(e as any, 'post')}
                >
                  {status === 'submitting' && saveMode === 'post'
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <FileCheck className="w-4 h-4" />
                  }
                  Post Now
                </Button>
                <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
              </div>

              <p className="text-xs text-slate-400 text-center">
                <strong>Save Draft</strong> stores the transaction without updating stock. <strong>Post Now</strong> commits it immediately.
              </p>

            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
