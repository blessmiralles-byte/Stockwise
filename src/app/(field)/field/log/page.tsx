'use client'

import { useState, useCallback, useEffect } from 'react'
import { BarcodeScanner } from '@/components/scanner/barcode-scanner'
import { LocationSelect } from '@/components/ui/location-select'
import {
  ScanBarcode, Search, X, Loader2, CheckCircle2,
  AlertCircle, Minus, Plus, Keyboard, ChevronLeft,
  Save, FileCheck, Tag, PackagePlus,
} from 'lucide-react'
import Link from 'next/link'

// ── Type config ───────────────────────────────────────────────────────────────
const LOG_TYPES = [
  { value: 'consumption', label: 'Issue to Job',  emoji: '⚙️',  needsFrom: true,  needsJob: true  },
  { value: 'purchase',    label: 'Receive Goods', emoji: '📦',  needsFrom: false, needsJob: false },
  { value: 'transfer',    label: 'Transfer',      emoji: '🔄',  needsFrom: true,  needsJob: false },
  { value: 'adjustment',  label: 'Adjust Stock',  emoji: '✏️', needsFrom: false, needsJob: false },
]

type Condition = 'good' | 'damaged' | 'missing'

const UNITS = ['pcs', 'kg', 'g', 'lbs', 'oz', 'liters', 'ml', 'meters', 'ft', 'box', 'pack', 'roll', 'set', 'pair']
const QUICK_ATTRS = ['Color', 'Size', 'Brand', 'Material', 'Weight', 'Grade']
interface AttrRow { key: string; value: string }

// ── Product search inline ─────────────────────────────────────────────────────
function ItemSearch({ onSelect, onAddNew }: { onSelect: (p: any) => void; onAddNew?: (name: string) => void }) {
  const [q, setQ]             = useState('')
  const [results, setResults] = useState<any[]>([])
  const [busy, setBusy]       = useState(false)
  const [open, setOpen]       = useState(false)

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
        <div className="absolute z-20 left-0 right-0 mt-2 bg-white border border-gray-200 rounded-2xl shadow-xl overflow-hidden">
          <p className="px-4 py-3 text-sm text-gray-400">No items found for &ldquo;{q}&rdquo;</p>
          {onAddNew && (
            <button
              type="button"
              onClick={() => { onAddNew(q); setQ(''); setOpen(false) }}
              className="w-full flex items-center gap-2 px-4 py-3.5 border-t border-gray-100 text-left text-indigo-600 font-medium hover:bg-indigo-50 active:bg-indigo-100"
            >
              <Plus className="w-4 h-4 flex-shrink-0" /> Add &ldquo;{q}&rdquo; as a new item
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Qty stepper ───────────────────────────────────────────────────────────────
function QtyStepper({ value, onChange, max }: { value: number; onChange: (n: number) => void; max?: number }) {
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
        max={max}
        value={value}
        onChange={e => onChange(Math.max(1, Math.min(Number(e.target.value) || 1, max ?? 99999)))}
        className="flex-1 text-center text-3xl font-bold text-gray-900 bg-transparent focus:outline-none"
      />
      <button
        type="button"
        onClick={() => onChange(max ? Math.min(value + 1, max) : value + 1)}
        className="w-14 h-14 rounded-xl bg-white border border-gray-200 flex items-center justify-center active:bg-gray-50 shadow-sm text-gray-600"
      >
        <Plus className="w-5 h-5 stroke-[2.5]" />
      </button>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
type Step      = 'type' | 'item' | 'newitem' | 'details' | 'done'
type InputMode = 'scan' | 'search'
type SaveMode  = 'draft' | 'post'

export default function FieldLogPage() {
  const [step, setStep]           = useState<Step>('type')
  const [typeIdx, setTypeIdx]     = useState(0)
  const [inputMode, setInputMode] = useState<InputMode>('scan')
  const [product, setProduct]     = useState<any>(null)
  const [qty, setQty]             = useState(1)
  const [unitPrice, setUnitPrice] = useState('')
  const [fromLocation, setFromLocation] = useState('')
  const [toLocation, setToLocation]     = useState('')
  const [jobRef, setJobRef]       = useState('')
  const [costCenterId, setCostCenterId] = useState('')
  const [jobCode, setJobCode]     = useState('')
  const [costCenters, setCostCenters] = useState<any[]>([])
  const [jobCodes, setJobCodes]   = useState<any[]>([])
  const [refNo, setRefNo]         = useState('')
  const [notes, setNotes]         = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [saveMode, setSaveMode]   = useState<SaveMode>('draft')
  const [errorMsg, setErrorMsg]   = useState('')
  const [scanError, setScanError] = useState('')
  const [scanLookup, setScanLookup] = useState(false)

  // New-item form (shown when a scanned barcode isn't in the catalog yet)
  const [newBarcode, setNewBarcode] = useState('')
  const [newName, setNewName]       = useState('')
  const [newUnit, setNewUnit]       = useState('pcs')
  const [newReorder, setNewReorder] = useState('')
  const [newAttrs, setNewAttrs]     = useState<AttrRow[]>([])
  const [creatingItem, setCreatingItem] = useState(false)
  const [newItemError, setNewItemError] = useState('')

  // Purchase-specific
  const [pendingPOs, setPendingPOs]     = useState<any[]>([])
  const [selectedPO, setSelectedPO]     = useState<any>(null)
  const [selectedLine, setSelectedLine] = useState<any>(null)
  const [supplierId, setSupplierId]     = useState('')
  const [suppliers, setSuppliers]       = useState<any[]>([])
  const [receivedBy, setReceivedBy]     = useState('')
  const [members, setMembers]           = useState<any[]>([])
  const [condition, setCondition]       = useState<Condition>('good')
  const [conditionNotes, setConditionNotes] = useState('')
  const [doneStatus, setDoneStatus]     = useState('')

  const logType    = LOG_TYPES[typeIdx]
  const isPurchase = logType.value === 'purchase'
  // A "blind receipt" is goods received with no linked PO — there's no PO price
  // to validate cost against, so it must be approved by a manager before it
  // touches stock or the ledger.
  const isBlindReceipt = isPurchase && !selectedPO

  // Cost centers + job codes for tagging consumption
  useEffect(() => {
    fetch('/api/cost-centers?active=true').then(r => r.json()).then(j => setCostCenters(j.data ?? [])).catch(() => {})
    fetch('/api/job-codes?active=true').then(r => r.json()).then(j => setJobCodes(j.data ?? [])).catch(() => {})
  }, [])

  // Load purchase-specific data when type = purchase
  useEffect(() => {
    if (!isPurchase) return
    fetch('/api/purchase-orders/pending').then(r => r.json()).then(j => setPendingPOs(j.data ?? [])).catch(() => {})
    fetch('/api/suppliers').then(r => r.json()).then(j => setSuppliers(j.data ?? [])).catch(() => {})
    fetch('/api/members').then(r => r.json()).then(j => setMembers(j.data ?? [])).catch(() => {})
  }, [isPurchase])

  const handleScan = useCallback(async (barcode: string) => {
    setScanLookup(true)
    setScanError('')
    try {
      const res  = await fetch(`/api/scan?barcode=${encodeURIComponent(barcode)}`)
      const json = await res.json()
      if (res.ok && json.data) {
        setProduct(json.data)
        setStep('details')
        return
      }

      // Not in the catalog. When receiving, don't silently create a placeholder —
      // ask the worker (who's holding the item) to enter its details first, then
      // create it and continue the receipt. Other log types still error.
      if (isPurchase) {
        setNewBarcode(barcode)
        setNewName(''); setNewUnit('pcs'); setNewReorder(''); setNewAttrs([])
        setNewItemError('')
        setStep('newitem')
        return
      }

      setScanError(`Barcode "${barcode}" not found.`)
    } catch {
      setScanError('Network error — please try again.')
    } finally {
      setScanLookup(false)
    }
  }, [isPurchase])

  // ── New-item form helpers ─────────────────────────────────────────────────
  const addNewAttr    = (key = '') => setNewAttrs(a => [...a, { key, value: '' }])
  const removeNewAttr = (i: number) => setNewAttrs(a => a.filter((_, idx) => idx !== i))
  const updateNewAttr = (i: number, field: 'key' | 'value', val: string) =>
    setNewAttrs(a => a.map((row, idx) => idx === i ? { ...row, [field]: val } : row))

  // Create the scanned-but-unknown item from the details entered, then continue
  // to the receipt step with it selected.
  const createNewItem = async () => {
    if (!newName.trim()) { setNewItemError('Enter an item name'); return }
    setCreatingItem(true); setNewItemError('')

    const attributes: Record<string, string> = {}
    for (const { key, value } of newAttrs) {
      if (key.trim() && value.trim()) attributes[key.trim()] = value.trim()
    }

    try {
      const res = await fetch('/api/products/from-barcode', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          barcode:         newBarcode,
          name:            newName.trim(),
          unit_of_measure: newUnit,
          reorder_point:   newReorder ? Number(newReorder) : 0,
          attributes,
        }),
      })
      const j = await res.json()
      if (!res.ok) { setNewItemError(j.error ?? 'Failed to add item'); setCreatingItem(false); return }
      setProduct(j.data)
      setScanError('New item added — flagged for a manager to review.')
      setStep('details')
    } catch {
      setNewItemError('Network error — please try again.')
    } finally {
      setCreatingItem(false)
    }
  }

  function selectPOLine(po: any, line: any) {
    setSelectedPO(po)
    setSelectedLine(line)
    setProduct(line.product)
    setSupplierId((po as any).supplier_id ?? '')
    setRefNo(po.po_number)
    setQty(1)
    setStep('details')
  }

  const handleSubmit = async (mode: SaveMode) => {
    if (isPurchase && !receivedBy.trim()) { setErrorMsg('Please select who is receiving the goods'); return }
    if (isPurchase && !supplierId)        { setErrorMsg('Please select the vendor'); return }

    // Blind receipts can never post directly — force them to a draft that a
    // manager must approve before stock/ledger update.
    if (isBlindReceipt) mode = 'draft'

    setSaveMode(mode)
    setSubmitting(true)
    setErrorMsg('')

    // If linked to a PO, use the GRN receive endpoint for proper status update
    // toLocation only required when items are actually received (not 'missing')
    if (isPurchase && selectedPO && selectedLine && (condition === 'missing' || toLocation)) {
      try {
        const res = await fetch(`/api/purchase-orders/${selectedPO.id}/receive`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            received_by:  receivedBy,
            supplier_id:  supplierId || null,
            lines: [{
              line_id:           selectedLine.id,
              quantity_received: condition === 'missing' ? 0 : qty,
              unit_cost:         selectedLine.unit_cost,
              source_type:       'supplier',
              from_location_id:  null,
              to_location_id:    toLocation,
              batch_no:          null,
              expiration_date:   null,
              condition,
              condition_notes:   conditionNotes || null,
            }],
          }),
        })
        const json = await res.json()
        if (!res.ok) { setErrorMsg(json.error ?? 'Receive failed'); setSubmitting(false); return }
        const newStatus = json.data?.new_status
        setDoneStatus(
          newStatus === 'received' ? 'All items received — PO marked as Received' :
          newStatus === 'partial'  ? 'Partially received — PO marked as Partial' : ''
        )
        setStep('done')
      } catch {
        setErrorMsg('Network error — please try again.')
        setSubmitting(false)
      }
      return
    }

    // General inventory movement (draft or post)
    const body: Record<string, any> = {
      transaction_type: logType.value,
      product_id:       product.id,
      quantity:         qty,
      unit_cost:        isBlindReceipt ? (Number(unitPrice) || 0) : (product.avg_cost ?? 0),
      reference_no:     refNo.trim() || undefined,
      notes:            notes.trim() || undefined,
      draft:            mode === 'draft',
    }
    if (isBlindReceipt) body.price_review = true
    if (supplierId)   body.supplier_id     = supplierId
    if (selectedPO)   body.related_po_id   = selectedPO.id
    if (logType.needsFrom)            body.from_location_id = fromLocation || undefined
    if (!logType.needsFrom)           body.to_location_id   = toLocation   || undefined
    if (logType.value === 'transfer') { body.from_location_id = fromLocation; body.to_location_id = toLocation }
    if (logType.needsJob && jobRef.trim()) body.job_order_id = jobRef.trim()
    if (logType.needsJob && costCenterId)  body.cost_center_id = costCenterId
    if (logType.needsJob && jobCode)       body.job_code       = jobCode

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
    setStep('type'); setProduct(null); setQty(1); setUnitPrice('')
    setFromLocation(''); setToLocation(''); setJobRef(''); setCostCenterId(''); setJobCode('')
    setRefNo(''); setNotes(''); setErrorMsg(''); setScanError('')
    setSelectedPO(null); setSelectedLine(null); setSupplierId('')
    setReceivedBy(''); setCondition('good'); setConditionNotes('')
    setDoneStatus('')
    setNewBarcode(''); setNewName(''); setNewUnit('pcs'); setNewReorder(''); setNewAttrs([]); setNewItemError('')
  }

  // ── Success screen ────────────────────────────────────────────────────────
  if (step === 'done') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-6 px-6 text-center">
        <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center">
          <CheckCircle2 className="w-10 h-10 text-green-600" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            {isBlindReceipt ? 'Submitted for Approval!' : saveMode === 'draft' ? 'Draft Saved!' : 'Logged!'}
          </h2>
          <p className="text-gray-500 mt-1">
            {qty}× {product?.name}
            {jobRef && <span className="text-indigo-600"> → {jobRef}</span>}
          </p>
          {doneStatus && (
            <p className="mt-2 text-sm font-medium text-green-600">{doneStatus}</p>
          )}
          {saveMode === 'draft' && (
            <p className="mt-1 text-xs text-gray-400">
              {isBlindReceipt
                ? 'A manager will review the value before stock and costs are updated.'
                : 'Review and post it from the Transactions list.'}
            </p>
          )}
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

      <div className="flex-1 px-4 py-5 space-y-5 pb-10">

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

        {/* ── Purchase: PO selector ── */}
        {step !== 'type' && isPurchase && (
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
              Receive Against Purchase Order
            </p>
            {pendingPOs.length === 0 ? (
              <p className="text-sm text-gray-400 py-1">No pending POs found — select item manually below.</p>
            ) : (
              <div className="space-y-2 max-h-52 overflow-y-auto">
                {pendingPOs.map(po => (
                  <div key={po.id} className="border border-gray-200 rounded-2xl overflow-hidden bg-white shadow-sm">
                    <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
                      <span className="font-mono text-xs font-bold text-gray-700">{po.po_number}</span>
                      <span className="text-xs text-gray-500">{po.supplier?.name ?? 'No vendor'}</span>
                    </div>
                    {po.lines
                      .filter((l: any) => l.quantity_ordered > l.quantity_received)
                      .map((l: any) => (
                        <button
                          key={l.id}
                          type="button"
                          onClick={() => selectPOLine(po, l)}
                          className={`w-full text-left px-4 py-3 flex items-center justify-between active:bg-indigo-50 transition-colors ${
                            selectedLine?.id === l.id ? 'bg-indigo-50 border-l-4 border-indigo-500' : ''
                          }`}
                        >
                          <span className="font-medium text-gray-900 text-sm">{l.product?.name}</span>
                          <span className="text-xs text-gray-400 ml-2 shrink-0">
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

        {/* ── Step 2: Item selection (non-purchase or no PO selected) ── */}
        {step !== 'type' && step !== 'newitem' && (!isPurchase || !selectedLine) && (
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
              <ItemSearch
                onSelect={p => { setProduct(p); setStep('details') }}
                onAddNew={isPurchase ? (name => {
                  setNewBarcode(''); setNewName(name); setNewUnit('pcs'); setNewReorder('')
                  setNewAttrs([]); setNewItemError(''); setStep('newitem')
                }) : undefined}
              />
            )}
          </div>
        )}

        {/* ── New item step: scanned barcode not in the catalog yet ── */}
        {step === 'newitem' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>This barcode isn&apos;t in your inventory yet — add its details to receive it.</span>
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                Barcode <span className="text-gray-300 font-normal normal-case">(optional)</span>
              </p>
              <input
                value={newBarcode}
                onChange={e => setNewBarcode(e.target.value)}
                placeholder="Scan or type a barcode"
                className="w-full h-14 px-4 rounded-2xl border border-gray-200 bg-white text-base font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
              />
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                Item Name <span className="text-red-400">*</span>
              </p>
              <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="e.g. WD-40 Spray 350ml"
                autoFocus
                className="w-full h-14 px-4 rounded-2xl border border-gray-200 bg-white text-base focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Unit</p>
                <select
                  value={newUnit}
                  onChange={e => setNewUnit(e.target.value)}
                  className="w-full h-14 px-4 rounded-2xl border border-gray-200 bg-white text-base focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                >
                  {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                  Reorder at <span className="text-gray-300 font-normal normal-case">(opt.)</span>
                </p>
                <input
                  type="number" inputMode="numeric" min="0"
                  value={newReorder}
                  onChange={e => setNewReorder(e.target.value)}
                  placeholder="0"
                  className="w-full h-14 px-4 rounded-2xl border border-gray-200 bg-white text-base focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                />
              </div>
            </div>

            {/* Attributes */}
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                Details <span className="text-gray-300 font-normal normal-case">(optional)</span>
              </p>
              <div className="flex flex-wrap gap-2 mb-3">
                {QUICK_ATTRS.map(a => {
                  const used = newAttrs.some(r => r.key.toLowerCase() === a.toLowerCase())
                  return (
                    <button
                      key={a} type="button" onClick={() => addNewAttr(a)}
                      className={`flex items-center gap-1 text-sm px-3 py-1.5 rounded-full border transition-colors ${
                        used ? 'border-indigo-300 bg-indigo-50 text-indigo-600'
                             : 'border-gray-200 bg-white text-gray-600 active:bg-gray-50'}`}
                    >
                      <Tag className="w-3.5 h-3.5" /> {a}
                    </button>
                  )
                })}
                <button
                  type="button" onClick={() => addNewAttr('')}
                  className="flex items-center gap-1 text-sm px-3 py-1.5 rounded-full border border-dashed border-gray-300 text-gray-400 active:bg-gray-50"
                >
                  <Plus className="w-3.5 h-3.5" /> Custom
                </button>
              </div>
              {newAttrs.length > 0 && (
                <div className="space-y-2">
                  {newAttrs.map((row, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <input
                        value={row.key} onChange={e => updateNewAttr(i, 'key', e.target.value)}
                        placeholder="e.g. Color"
                        className="flex-1 h-12 px-3 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      <input
                        value={row.value} onChange={e => updateNewAttr(i, 'value', e.target.value)}
                        placeholder="e.g. Red"
                        className="flex-1 h-12 px-3 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      <button
                        type="button" onClick={() => removeNewAttr(i)}
                        className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-gray-400 active:bg-gray-200 flex-shrink-0"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {newItemError && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
                <AlertCircle className="w-4 h-4 flex-shrink-0" /> {newItemError}
              </div>
            )}

            <button
              type="button"
              onClick={createNewItem}
              disabled={creatingItem}
              className="w-full h-16 rounded-2xl bg-green-600 text-white font-bold text-lg active:bg-green-700 disabled:opacity-60 transition-colors flex items-center justify-center gap-3 shadow-md shadow-green-200"
            >
              {creatingItem
                ? <><Loader2 className="w-5 h-5 animate-spin" /> Adding…</>
                : <><PackagePlus className="w-5 h-5" /> Add item & continue</>
              }
            </button>
            <button
              type="button"
              onClick={() => { setStep('item'); setNewBarcode(''); setNewItemError('') }}
              className="w-full text-sm text-gray-400 active:text-gray-600"
            >
              ← Back to search / scan
            </button>
          </div>
        )}

        {/* PO line chip when selected */}
        {isPurchase && selectedLine && (
          <div className="flex items-center gap-3 bg-indigo-50 border border-indigo-200 rounded-2xl px-4 py-3.5">
            <div className="flex-1">
              <p className="font-semibold text-gray-900">{selectedLine.product?.name}</p>
              <p className="text-xs text-gray-500 font-mono mt-0.5">{selectedLine.product?.sku} · from {selectedPO.po_number}</p>
            </div>
            <button
              type="button"
              onClick={() => { setSelectedLine(null); setSelectedPO(null); setProduct(null); setRefNo(''); setSupplierId('') }}
              className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-gray-400 active:bg-gray-50 border border-gray-200"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* ── Step 3: Details ── */}
        {step === 'details' && product && (
          <>
            {/* Qty stepper */}
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Quantity</p>
              <QtyStepper
                value={qty}
                onChange={setQty}
                max={selectedLine ? selectedLine.quantity_ordered - selectedLine.quantity_received : undefined}
              />
            </div>

            {/* Purchase-specific fields */}
            {isPurchase && (
              <>
                {/* Received From (Supplier) */}
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                    Received From <span className="text-red-400">*</span>
                  </p>
                  <select
                    value={supplierId}
                    onChange={e => setSupplierId(e.target.value)}
                    className="w-full h-14 px-4 rounded-2xl border border-gray-200 bg-white text-base focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                  >
                    <option value="">— Select vendor —</option>
                    {suppliers.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>

                {/* Received By */}
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                    Received By <span className="text-red-400">*</span>
                  </p>
                  {members.length > 0 ? (
                    <select
                      value={receivedBy}
                      onChange={e => setReceivedBy(e.target.value)}
                      className="w-full h-14 px-4 rounded-2xl border border-gray-200 bg-white text-base focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                    >
                      <option value="">— Select staff member —</option>
                      {members.map(m => (
                        <option key={m.id} value={m.full_name ?? m.id}>{m.full_name ?? m.id} ({m.role})</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      value={receivedBy}
                      onChange={e => setReceivedBy(e.target.value)}
                      placeholder="Name of person receiving"
                      className="w-full h-14 px-4 rounded-2xl border border-gray-200 bg-white text-base focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                    />
                  )}
                </div>

                {/* Unit price — blind receipts only (no PO to validate cost) */}
                {!selectedPO && (
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                      Unit Price / Value
                    </p>
                    <div className="relative flex items-center">
                      <span className="absolute left-4 text-gray-400 text-base">$</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.01"
                        value={unitPrice}
                        onChange={e => setUnitPrice(e.target.value)}
                        placeholder="0.00"
                        className="w-full h-14 pl-9 pr-4 rounded-2xl border border-gray-200 bg-white text-base focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                      />
                    </div>
                    <div className="mt-2 flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5 text-xs text-amber-700">
                      <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <span>
                        No purchase order linked — a manager will be asked to verify this value.
                        You can leave it blank if you don&apos;t know the price.
                      </span>
                    </div>
                  </div>
                )}

                {/* Condition */}
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Item Condition</p>
                  <div className="grid grid-cols-3 gap-2">
                    {([['good','✓ Good','bg-green-600'],['damaged','⚠ Damaged','bg-amber-500'],['missing','✕ Not Received','bg-red-600']] as const).map(([val, label, active]) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setCondition(val as Condition)}
                        className={`py-3 rounded-2xl text-sm font-semibold border transition-all active:scale-95 ${
                          condition === val
                            ? `${active} text-white border-transparent`
                            : 'bg-white text-gray-600 border-gray-200'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {(condition === 'damaged' || condition === 'missing') && (
                    <textarea
                      value={conditionNotes}
                      onChange={e => setConditionNotes(e.target.value)}
                      placeholder={condition === 'damaged' ? 'Describe the damage…' : 'Reason not received…'}
                      rows={2}
                      className="mt-3 w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                    />
                  )}
                </div>
              </>
            )}

            {/* Location(s) */}
            {condition !== 'missing' && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                  {logType.value === 'transfer' ? 'From Location' : logType.needsFrom ? 'Source Location' : 'Destination Location'}
                </p>
                <LocationSelect
                  value={logType.needsFrom || logType.value === 'transfer' ? fromLocation : toLocation}
                  onChange={id => logType.needsFrom || logType.value === 'transfer' ? setFromLocation(id) : setToLocation(id)}
                />
              </div>
            )}

            {logType.value === 'transfer' && fromLocation && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">To Location</p>
                <LocationSelect value={toLocation} onChange={setToLocation} />
              </div>
            )}

            {/* Cost center + job code (drives cost analysis) */}
            {logType.needsJob && (
              <>
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Cost Center</p>
                  <select
                    value={costCenterId}
                    onChange={e => setCostCenterId(e.target.value)}
                    className="w-full h-14 px-4 rounded-2xl border border-gray-200 bg-white text-base focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                  >
                    <option value="">— None —</option>
                    {costCenters.map(c => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
                  </select>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Job Code</p>
                  <select
                    value={jobCode}
                    onChange={e => setJobCode(e.target.value)}
                    className="w-full h-14 px-4 rounded-2xl border border-gray-200 bg-white text-base focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                  >
                    <option value="">— None —</option>
                    {jobCodes.map(j => <option key={j.id} value={j.code}>{j.code} — {j.name}</option>)}
                  </select>
                </div>
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
              </>
            )}

            {/* Reference + notes */}
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

            {/* Submit buttons */}
            {isPurchase ? (
              isBlindReceipt ? (
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={() => handleSubmit('draft')}
                    disabled={submitting}
                    className="w-full h-16 rounded-2xl bg-green-600 text-white font-bold text-lg active:bg-green-700 disabled:opacity-60 transition-colors flex items-center justify-center gap-3 shadow-md shadow-green-200"
                  >
                    {submitting
                      ? <><Loader2 className="w-5 h-5 animate-spin" /> Submitting…</>
                      : <><FileCheck className="w-5 h-5" /> Submit for Approval</>
                    }
                  </button>
                  <p className="text-xs text-center text-gray-400">
                    No PO linked — a manager must approve the value before stock and costs are updated.
                  </p>
                </div>
              ) : (
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => handleSubmit('post')}
                  disabled={submitting}
                  className="w-full h-16 rounded-2xl bg-green-600 text-white font-bold text-lg active:bg-green-700 disabled:opacity-60 transition-colors flex items-center justify-center gap-3 shadow-md shadow-green-200"
                >
                  {submitting && saveMode === 'post'
                    ? <><Loader2 className="w-5 h-5 animate-spin" /> Saving…</>
                    : <><FileCheck className="w-5 h-5" /> Confirm Receipt</>
                  }
                </button>
                <button
                  type="button"
                  onClick={() => handleSubmit('draft')}
                  disabled={submitting}
                  className="w-full h-12 rounded-2xl bg-white border border-gray-200 text-gray-700 font-semibold text-base active:bg-gray-50 disabled:opacity-60 transition-colors flex items-center justify-center gap-2 shadow-sm"
                >
                  {submitting && saveMode === 'draft'
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
                    : <><Save className="w-4 h-4" /> Save as Draft</>
                  }
                </button>
                <p className="text-xs text-center text-gray-400">
                  Confirm Receipt updates stock immediately. Save as Draft lets a manager review first.
                </p>
              </div>
              )
            ) : (
              <button
                type="button"
                onClick={() => handleSubmit('post')}
                disabled={submitting}
                className="w-full h-16 rounded-2xl bg-indigo-600 text-white font-bold text-lg active:bg-indigo-700 disabled:opacity-60 transition-colors flex items-center justify-center gap-3 shadow-md shadow-indigo-200"
              >
                {submitting
                  ? <><Loader2 className="w-5 h-5 animate-spin" /> Saving…</>
                  : <>Confirm &amp; Log {qty}× {product?.unit_of_measure}</>
                }
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
