'use client'

import { useState, use } from 'react'
import { Topbar } from '@/components/layout/topbar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useApi } from '@/lib/use-api'
import { formatCurrency, formatDate } from '@/lib/utils'
import { PurchaseOrder, Location } from '@/types'
import { ArrowLeft, Truck, CheckCircle2, Send, X, FileText, AlertTriangle, Scale, Loader2, Plus, Trash2, Download } from 'lucide-react'
import Link from 'next/link'

const STATUS_CFG: Record<string, { label: string; variant: any }> = {
  draft:     { label: 'Draft',     variant: 'secondary'   },
  sent:      { label: 'Sent',      variant: 'warning'     },
  partial:   { label: 'Partial',   variant: 'warning'     },
  received:  { label: 'Received',  variant: 'success'     },
  cancelled: { label: 'Cancelled', variant: 'destructive' },
}

// ── GRN Dialog ────────────────────────────────────────────────────────────────
function GRNDialog({
  po,
  locations,
  onClose,
  onReceived,
}: {
  po: PurchaseOrder
  locations: Location[]
  onClose: () => void
  onReceived: () => void
}) {
  type ReceiveLine = {
    line_id: string
    product_name: string
    sku: string
    unit: string
    ordered: number
    already: number
    qty: number
    cost: number
    source_type: 'supplier' | 'location'
    from_location_id: string
    to_location_id: string
    batch_no: string
    expiration_date: string
    condition: 'good' | 'damaged' | 'missing'
    condition_notes: string
  }

  const [lines, setLines] = useState<ReceiveLine[]>(
    (po.lines ?? [])
      .filter(l => l.quantity_ordered > l.quantity_received)
      .map(l => ({
        line_id: l.id,
        product_name: l.product?.name ?? '—',
        sku: l.product?.sku ?? '',
        unit: l.product?.unit_of_measure ?? '',
        ordered: l.quantity_ordered,
        already: l.quantity_received,
        qty: l.quantity_ordered - l.quantity_received,
        cost: l.unit_cost,
        source_type: 'supplier',
        from_location_id: '',
        to_location_id: '',
        batch_no: '',
        expiration_date: '',
        condition: 'good',
        condition_notes: '',
      }))
  )
  const [receivedBy, setReceivedBy] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  function update(id: string, field: keyof ReceiveLine, value: any) {
    setLines(ls => ls.map(l => l.line_id === id ? { ...l, [field]: value } : l))
  }

  async function handleReceive() {
    if (!receivedBy.trim()) { setError('Please enter the name of who is receiving the goods'); return }
    const missing = lines.find(l => l.qty > 0 && !l.to_location_id && l.condition !== 'missing')
    if (missing) { setError(`Select a destination location for "${missing.product_name}"`); return }
    const missingFrom = lines.find(l => l.qty > 0 && l.source_type === 'location' && !l.from_location_id)
    if (missingFrom) { setError(`Select a source location for "${missingFrom.product_name}"`); return }

    setSaving(true)
    setError('')
    try {
      const payload = lines
        .filter(l => l.qty > 0 || l.condition === 'missing')
        .map(l => ({
          line_id:           l.line_id,
          quantity_received: l.condition === 'missing' ? 0 : l.qty,
          unit_cost:         l.cost,
          source_type:       l.source_type,
          from_location_id:  l.source_type === 'location' ? l.from_location_id : null,
          to_location_id:    l.to_location_id,
          batch_no:          l.batch_no || null,
          expiration_date:   l.expiration_date || null,
          condition:         l.condition,
          condition_notes:   l.condition_notes || null,
        }))

      const res = await fetch(`/api/purchase-orders/${po.id}/receive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lines: payload, received_by: receivedBy.trim() || null }),
      })

      if (!res.ok) {
        const j = await res.json()
        setError(j.error ?? 'Receive failed')
        return
      }
      onReceived()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <CardHeader className="flex flex-row items-center justify-between pb-2 sticky top-0 bg-white border-b z-10">
          <CardTitle className="text-base flex items-center gap-2">
            <Truck className="w-4 h-4 text-indigo-600" />
            Receive Goods — {po.po_number}
          </CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="w-4 h-4" /></Button>
        </CardHeader>
        <CardContent className="pt-4 space-y-4">
          {lines.length === 0 ? (
            <p className="text-center text-slate-400 py-8">All items have already been received.</p>
          ) : (
            <>
              {/* Received By */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Received By *</label>
                <input
                  type="text"
                  placeholder="Name of person receiving the goods"
                  value={receivedBy}
                  onChange={e => setReceivedBy(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {lines.map(l => (
                <div key={l.line_id} className="border border-slate-100 rounded-lg p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-slate-900">{l.product_name}</p>
                      <p className="text-xs text-slate-400">{l.sku} · {l.unit}</p>
                    </div>
                    <p className="text-xs text-slate-500">
                      {l.already}/{l.ordered} already received
                    </p>
                  </div>
                  {/* Source */}
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Received From *</label>
                    <div className="flex gap-1 mb-2">
                      {(['supplier', 'location'] as const).map(t => (
                        <button
                          key={t} type="button"
                          onClick={() => update(l.line_id, 'source_type', t)}
                          className={`flex-1 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                            l.source_type === t
                              ? 'bg-indigo-600 text-white border-indigo-600'
                              : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-400'
                          }`}
                        >
                          {t === 'supplier' ? 'Supplier' : 'Another Location'}
                        </button>
                      ))}
                    </div>
                    {l.source_type === 'supplier' ? (
                      <div className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-md text-sm text-slate-600">
                        {po.supplier?.name ?? <span className="text-slate-400 italic">No supplier on PO</span>}
                      </div>
                    ) : (
                      <select
                        className="w-full border border-slate-200 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        value={l.from_location_id}
                        onChange={e => update(l.line_id, 'from_location_id', e.target.value)}
                      >
                        <option value="">— Select source location —</option>
                        {locations
                          .filter(loc => loc.id !== l.to_location_id)
                          .map(loc => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
                      </select>
                    )}
                  </div>

                  {/* Condition */}
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Item Condition</label>
                    <div className="flex gap-1">
                      {(['good', 'damaged', 'missing'] as const).map(c => (
                        <button
                          key={c} type="button"
                          onClick={() => update(l.line_id, 'condition', c)}
                          className={`flex-1 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                            l.condition === c
                              ? c === 'good'    ? 'bg-green-600  text-white border-green-600'
                              : c === 'damaged' ? 'bg-amber-500  text-white border-amber-500'
                              :                   'bg-red-600    text-white border-red-600'
                              : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                          }`}
                        >
                          {c === 'good' ? '✓ Good' : c === 'damaged' ? '⚠ Damaged' : '✕ Not Received'}
                        </button>
                      ))}
                    </div>
                    {(l.condition === 'damaged' || l.condition === 'missing') && (
                      <Input
                        value={l.condition_notes}
                        onChange={e => update(l.line_id, 'condition_notes', e.target.value)}
                        placeholder={l.condition === 'damaged' ? 'Describe the damage…' : 'Reason not received…'}
                        className="mt-2 h-8 text-sm"
                      />
                    )}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Qty to Receive</label>
                      <Input
                        type="number" min={0} max={l.ordered - l.already}
                        value={l.qty}
                        disabled={l.condition === 'missing'}
                        onChange={e => update(l.line_id, 'qty', parseInt(e.target.value) || 0)}
                        className="h-8 text-sm disabled:opacity-50"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Unit Cost</label>
                      <Input
                        type="number" min={0} step="0.01"
                        value={l.cost}
                        disabled={l.condition === 'missing'}
                        onChange={e => update(l.line_id, 'cost', parseFloat(e.target.value) || 0)}
                        className="h-8 text-sm disabled:opacity-50"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Batch #</label>
                      <Input
                        value={l.batch_no}
                        onChange={e => update(l.line_id, 'batch_no', e.target.value)}
                        placeholder="Optional"
                        className="h-8 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Expiry Date</label>
                      <Input
                        type="date"
                        value={l.expiration_date}
                        onChange={e => update(l.line_id, 'expiration_date', e.target.value)}
                        className="h-8 text-sm"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Receive Into Location *</label>
                    <select
                      className="w-full border border-slate-200 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      value={l.to_location_id}
                      onChange={e => update(l.line_id, 'to_location_id', e.target.value)}
                    >
                      <option value="">— Select location —</option>
                      {locations
                        .filter(loc => loc.id !== l.from_location_id)
                        .map(loc => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
                    </select>
                  </div>
                </div>
              ))}

              {error && <p className="text-red-500 text-xs">{error}</p>}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={onClose}>Cancel</Button>
                <Button onClick={handleReceive} disabled={saving} className="gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  {saving ? 'Receiving…' : 'Confirm Receipt'}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ── Order Lines Card ──────────────────────────────────────────────────────────
function OrderLinesCard({ po, products, poId, onUpdated }: { po: PurchaseOrder; products: any[]; poId: string; onUpdated: () => void }) {
  const canEdit = po.status !== 'received' && po.status !== 'cancelled'
  const isDraft = po.status === 'draft'

  const [newProductId, setNewProductId] = useState('')
  const [newQty,       setNewQty]       = useState('')
  const [newCost,      setNewCost]      = useState('')
  const [adding,       setAdding]       = useState(false)
  const [addErr,       setAddErr]       = useState('')
  const [removingId,   setRemovingId]   = useState<string | null>(null)

  const total = (po.lines ?? []).reduce((s, l) => s + l.quantity_ordered * l.unit_cost, 0)

  const selectedProduct = products.find(p => p.id === newProductId)

  async function addLine() {
    if (!newProductId) { setAddErr('Select a product'); return }
    const qty = parseInt(newQty)
    if (!qty || qty < 1) { setAddErr('Quantity must be ≥ 1'); return }
    setAdding(true); setAddErr('')
    const res = await fetch(`/api/purchase-orders/${poId}/lines`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_id: newProductId, quantity_ordered: qty, unit_cost: parseFloat(newCost) || 0 }),
    })
    const json = await res.json()
    setAdding(false)
    if (!res.ok) { setAddErr(json.error ?? 'Failed to add item'); return }
    setNewProductId(''); setNewQty(''); setNewCost('')
    onUpdated()
  }

  async function removeLine(lineId: string) {
    if (!confirm('Remove this item from the PO?')) return
    setRemovingId(lineId)
    await fetch(`/api/purchase-orders/${poId}/lines?line_id=${lineId}`, { method: 'DELETE' })
    setRemovingId(null)
    onUpdated()
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Order Lines</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase">Item</th>
                <th className="text-right px-4 py-3 font-semibold text-slate-600 text-xs uppercase">Qty Ordered</th>
                <th className="text-right px-4 py-3 font-semibold text-slate-600 text-xs uppercase">Received</th>
                <th className="text-right px-4 py-3 font-semibold text-slate-600 text-xs uppercase">Outstanding</th>
                <th className="text-right px-4 py-3 font-semibold text-slate-600 text-xs uppercase">Negotiated Price</th>
                <th className="text-right px-4 py-3 font-semibold text-slate-600 text-xs uppercase">Line Total</th>
                {isDraft && <th className="px-3 py-3" />}
              </tr>
            </thead>
            <tbody>
              {(po.lines ?? []).map(l => {
                const outstanding = l.quantity_ordered - l.quantity_received
                return (
                  <tr key={l.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{l.product?.name}</p>
                      <p className="text-xs text-slate-400">{l.product?.sku}</p>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{l.quantity_ordered}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-green-600 font-medium">{l.quantity_received}</td>
                    <td className={`px-4 py-3 text-right tabular-nums font-semibold ${outstanding > 0 ? 'text-orange-600' : 'text-slate-400'}`}>
                      {outstanding}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(l.unit_cost)}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold">{formatCurrency(l.quantity_ordered * l.unit_cost)}</td>
                    {isDraft && (
                      <td className="px-3 py-3">
                        {l.quantity_received === 0 && (
                          <button
                            onClick={() => removeLine(l.id)}
                            disabled={removingId === l.id}
                            className="text-slate-300 hover:text-red-500 transition-colors disabled:opacity-40"
                            title="Remove line"
                          >
                            {removingId === l.id
                              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              : <Trash2 className="w-3.5 h-3.5" />}
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                )
              })}

              {/* Add Item row */}
              {canEdit && (
                <tr className="border-t border-dashed border-slate-200 bg-slate-50/60">
                  <td className="px-3 py-2">
                    <select
                      value={newProductId}
                      onChange={e => {
                        const p = products.find(x => x.id === e.target.value)
                        setNewProductId(e.target.value)
                        if (p) setNewCost(String(p.unit_cost ?? ''))
                        setAddErr('')
                      }}
                      className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                    >
                      <option value="">— Select item to add —</option>
                      {products.map(p => (
                        <option key={p.id} value={p.id}>{p.name} {p.sku ? `(${p.sku})` : ''}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-2">
                    <Input
                      type="number" min={1} placeholder="Qty"
                      value={newQty}
                      onChange={e => { setNewQty(e.target.value); setAddErr('') }}
                      className="h-8 text-sm text-right w-24 ml-auto"
                    />
                  </td>
                  <td className="px-2 py-2 text-right text-xs text-slate-400">—</td>
                  <td className="px-2 py-2 text-right text-xs text-slate-400">—</td>
                  <td className="px-2 py-2">
                    <Input
                      type="number" min={0} step="0.01" placeholder="0.00"
                      value={newCost}
                      onChange={e => { setNewCost(e.target.value); setAddErr('') }}
                      className="h-8 text-sm text-right w-28 ml-auto"
                    />
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-sm text-slate-500">
                    {newQty && newCost ? formatCurrency(parseFloat(newQty) * parseFloat(newCost)) : '—'}
                  </td>
                  <td className="px-3 py-2">
                    <Button size="sm" onClick={addLine} disabled={adding} className="gap-1 h-8 px-2.5">
                      {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                      Add
                    </Button>
                  </td>
                </tr>
              )}

              <tr className="border-t-2 border-slate-200 bg-slate-50">
                <td colSpan={isDraft ? 5 : 5} className="px-4 py-3 text-right font-bold text-slate-700">Total</td>
                <td className="px-4 py-3 text-right font-bold text-slate-900">{formatCurrency(total)}</td>
                {isDraft && <td />}
              </tr>
            </tbody>
          </table>
        </div>
        {addErr && <p className="text-red-500 text-xs px-4 pb-3">{addErr}</p>}
      </CardContent>
    </Card>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function PODetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [showGRN, setShowGRN] = useState(false)

  const { data: poData, loading, error, refetch } = useApi<{ data: PurchaseOrder }>(`/api/purchase-orders/${id}`)
  const { data: locData } = useApi<{ data: Location[] }>('/api/locations')
  const { data: prodData } = useApi<{ data: any[] }>('/api/products')

  const po = poData?.data
  const locations = locData?.data ?? []
  const products  = prodData?.data ?? []

  async function markStatus(status: string) {
    await fetch(`/api/purchase-orders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    refetch()
  }

  if (loading) return (
    <div>
      <Topbar title="Purchase Order" />
      <div className="p-6"><div className="h-64 bg-slate-100 rounded-xl animate-pulse" /></div>
    </div>
  )

  // ── component defined here so it closes over po / refetch ─────────────────

  // ── Three-way match component ──────────────────────────────────────────────
  function ThreeWayMatch({ po, onUpdated }: { po: any; onUpdated: () => void }) {
    const lines      = (po.lines ?? []) as any[]
    const poValue    = lines.reduce((s: number, l: any) => s + l.quantity_ordered  * l.unit_cost, 0)
    const grnValue   = lines.reduce((s: number, l: any) => s + l.quantity_received * l.unit_cost, 0)
    const invoiceAmt = po.supplier_invoice_amount ?? null

    const [editing,     setEditing]     = useState(false)
    const [invNo,       setInvNo]       = useState(po.supplier_invoice_no     ?? '')
    const [invDate,     setInvDate]     = useState(po.supplier_invoice_date   ?? '')
    const [invAmt,      setInvAmt]      = useState(String(po.supplier_invoice_amount ?? ''))
    const [saving,      setSaving]      = useState(false)
    const [saveErr,     setSaveErr]     = useState('')

    const variance  = invoiceAmt !== null ? invoiceAmt - grnValue : null
    const matched   = variance !== null && Math.abs(variance) <= 0.01
    const overInv   = variance !== null && variance > 0.01
    const underInv  = variance !== null && variance < -0.01
    const noInvoice = grnValue > 0 && invoiceAmt === null
    const pending   = grnValue === 0

    const matchColor = matched   ? 'bg-green-50  border-green-200  text-green-700'
                     : overInv   ? 'bg-red-50    border-red-200    text-red-700'
                     : underInv  ? 'bg-amber-50  border-amber-200  text-amber-700'
                     : noInvoice ? 'bg-blue-50   border-blue-200   text-blue-700'
                     :             'bg-slate-50  border-slate-200  text-slate-500'

    const matchLabel = matched   ? '✓ Matched'
                     : overInv   ? '⚠ Over-invoiced'
                     : underInv  ? '⚠ Under-invoiced'
                     : noInvoice ? 'Awaiting invoice'
                     :             'Awaiting GRN'

    const save = async () => {
      if (!invNo.trim() || !invDate || !invAmt) { setSaveErr('All invoice fields required'); return }
      setSaving(true); setSaveErr('')
      const res  = await fetch(`/api/accounting/match/${po.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_no: invNo.trim(), invoice_date: invDate, invoice_amount: Number(invAmt) }),
      })
      const json = await res.json()
      setSaving(false)
      if (!res.ok) { setSaveErr(json.error ?? 'Failed'); return }
      setEditing(false); onUpdated()
    }

    const clear = async () => {
      await fetch(`/api/accounting/match/${po.id}`, { method: 'DELETE' })
      setInvNo(''); setInvDate(''); setInvAmt(''); onUpdated()
    }

    return (
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Scale className="w-4 h-4 text-indigo-500" />
              Three-Way Match
            </CardTitle>
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${matchColor}`}>{matchLabel}</span>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Comparison row */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'PO Amount',       value: poValue,    note: `${lines.reduce((s: number, l: any) => s + l.quantity_ordered, 0)} units ordered`,   color: 'text-slate-900' },
              { label: 'GRN Received',    value: grnValue,   note: `${lines.reduce((s: number, l: any) => s + l.quantity_received, 0)} units received`,  color: 'text-green-700' },
              { label: 'Supplier Invoice',value: invoiceAmt, note: invoiceAmt !== null ? po.supplier_invoice_no : 'Not recorded yet',                    color: invoiceAmt !== null ? (matched ? 'text-green-700' : overInv ? 'text-red-600' : 'text-amber-600') : 'text-slate-400' },
            ].map(col => (
              <div key={col.label} className="bg-slate-50 rounded-xl p-3 text-center">
                <p className="text-xs text-slate-500 mb-1">{col.label}</p>
                <p className={`text-lg font-bold ${col.color}`}>
                  {col.value !== null ? formatCurrency(col.value) : '—'}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">{col.note}</p>
              </div>
            ))}
          </div>

          {/* Variance */}
          {variance !== null && (
            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border ${matchColor}`}>
              {matched
                ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                : <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              }
              {matched
                ? 'Invoice matches goods received — cleared for payment.'
                : `Variance: ${formatCurrency(Math.abs(variance))} ${overInv ? '(invoice exceeds GRN — query with supplier before paying)' : '(invoice below GRN — partial invoice or credit note expected)'}`
              }
            </div>
          )}

          {/* Invoice recording */}
          {editing ? (
            <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-slate-50">
              <p className="text-xs font-semibold text-slate-700">Record Supplier Invoice</p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-500 block mb-1">Invoice No.</label>
                  <Input value={invNo} onChange={e => setInvNo(e.target.value)} placeholder="INV-2026-001" autoFocus />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 block mb-1">Invoice Date</label>
                  <Input type="date" value={invDate} onChange={e => setInvDate(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 block mb-1">Invoice Amount</label>
                  <Input type="number" min="0" step="0.01" value={invAmt} onChange={e => setInvAmt(e.target.value)} placeholder="0.00" />
                </div>
              </div>
              {saveErr && <p className="text-xs text-red-600">{saveErr}</p>}
              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
                <Button size="sm" onClick={save} disabled={saving} className="gap-1.5">
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  Save Invoice
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setEditing(true)}>
                <FileText className="w-3.5 h-3.5" />
                {invoiceAmt !== null ? 'Edit Invoice' : 'Record Invoice'}
              </Button>
              {invoiceAmt !== null && (
                <Button variant="outline" size="sm" className="gap-1.5 text-red-600 hover:text-red-700" onClick={clear}>
                  <X className="w-3.5 h-3.5" /> Clear
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  if (error || !po) return (
    <div>
      <Topbar title="Purchase Order" />
      <div className="p-6 text-red-500">{error ?? 'Not found'}</div>
    </div>
  )

  const cfg = STATUS_CFG[po.status]
  const total = (po.lines ?? []).reduce((s, l) => s + l.quantity_ordered * l.unit_cost, 0)
  const canReceive = po.status === 'sent' || po.status === 'partial'
  const canSend    = po.status === 'draft'
  const canCancel  = po.status !== 'received' && po.status !== 'cancelled'

  return (
    <div>
      <Topbar title={po.po_number} />
      <div className="p-6 space-y-5 max-w-4xl">

        {/* Back */}
        <Link href="/purchase-orders" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-indigo-600">
          <ArrowLeft className="w-4 h-4" /> All Purchase Orders
        </Link>

        {/* Header */}
        <Card>
          <CardContent className="p-5">
            <div className="flex items-start justify-between flex-wrap gap-4">
              <div>
                <h1 className="text-xl font-bold text-slate-900">{po.po_number}</h1>
                <div className="flex items-center gap-3 mt-1 flex-wrap">
                  <Badge variant={cfg?.variant ?? 'secondary'}>{cfg?.label}</Badge>
                  {po.supplier && (
                    <span className="text-sm text-slate-500">{po.supplier.name} · {po.supplier.lead_time_days}d lead time</span>
                  )}
                  {po.expected_date && (
                    <span className="text-sm text-slate-500">Expected: {formatDate(po.expected_date)}</span>
                  )}
                </div>
                {po.notes && <p className="text-sm text-slate-500 mt-2">{po.notes}</p>}
              </div>
              <div className="flex gap-2 flex-wrap">
                <a href={`/api/purchase-orders/${id}/pdf`} download>
                  <Button variant="outline" size="sm" className="gap-1">
                    <Download className="w-3.5 h-3.5" /> Download PDF
                  </Button>
                </a>
                {canSend && (
                  <Button variant="outline" size="sm" onClick={() => markStatus('sent')} className="gap-1">
                    <Send className="w-3.5 h-3.5" /> Mark Sent
                  </Button>
                )}
                {canReceive && (
                  <Button size="sm" onClick={() => setShowGRN(true)} className="gap-1">
                    <Truck className="w-3.5 h-3.5" /> Receive Goods
                  </Button>
                )}
                {canCancel && (
                  <Button variant="outline" size="sm" onClick={() => markStatus('cancelled')} className="gap-1 text-red-600 hover:text-red-700">
                    <X className="w-3.5 h-3.5" /> Cancel
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Three-way match */}
        <ThreeWayMatch po={po} onUpdated={refetch} />

        {/* Lines */}
        <OrderLinesCard po={po} products={products} poId={id} onUpdated={refetch} />
      </div>

      {showGRN && (
        <GRNDialog
          po={po}
          locations={locations}
          onClose={() => setShowGRN(false)}
          onReceived={() => { setShowGRN(false); refetch() }}
        />
      )}
    </div>
  )
}
