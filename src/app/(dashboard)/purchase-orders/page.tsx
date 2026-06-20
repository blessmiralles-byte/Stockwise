'use client'

import { useState, useEffect } from 'react'
import { Topbar } from '@/components/layout/topbar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TableSkeleton } from '@/components/ui/skeleton'
import { useApi } from '@/lib/use-api'
import { formatCurrency, formatDate } from '@/lib/utils'
import { PurchaseOrder, PurchaseOrderLine, Supplier, Product } from '@/types'
import {
  Plus, Search, X, ChevronRight, Package, Truck, CheckCircle2,
  Clock, AlertCircle, FileText, Minus,
} from 'lucide-react'
import Link from 'next/link'

const STATUS_CONFIG: Record<string, { label: string; variant: any; icon: React.ReactNode }> = {
  draft:     { label: 'Draft',     variant: 'secondary',    icon: <FileText className="w-3 h-3" /> },
  sent:      { label: 'Sent',      variant: 'warning',      icon: <Truck className="w-3 h-3" /> },
  partial:   { label: 'Partial',   variant: 'warning',      icon: <Clock className="w-3 h-3" /> },
  received:  { label: 'Received',  variant: 'success',      icon: <CheckCircle2 className="w-3 h-3" /> },
  cancelled: { label: 'Cancelled', variant: 'destructive',  icon: <X className="w-3 h-3" /> },
}

// ── New PO Drawer ─────────────────────────────────────────────────────────────
function NewPODrawer({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { data: suppData } = useApi<{ data: Supplier[] }>('/api/suppliers')
  const [prodSearch, setProdSearch]   = useState('')
  const [products,   setProducts]     = useState<Product[]>([])
  const [supplier_id, setSupplier]    = useState('')
  const [order_date, setOrderDate]    = useState('')
  const [expected_date, setExpected]  = useState('')
  const [notes, setNotes]             = useState('')
  const [lines, setLines]             = useState<{ product: Product; qty: number; cost: number }[]>([])
  const [saving, setSaving]           = useState(false)
  const [error, setError]             = useState('')

  const suppliers = suppData?.data ?? []

  // Product search
  useEffect(() => {
    if (prodSearch.length < 1) { setProducts([]); return }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/products?q=${encodeURIComponent(prodSearch)}`)
      if (res.ok) {
        const j = await res.json()
        setProducts(j.data ?? [])
      }
    }, 250)
    return () => clearTimeout(t)
  }, [prodSearch])

  function addLine(p: Product) {
    if (lines.find(l => l.product.id === p.id)) return
    setLines(ls => [...ls, { product: p, qty: 1, cost: 0 }])
    setProdSearch('')
    setProducts([])
  }

  function removeLine(id: string) {
    setLines(ls => ls.filter(l => l.product.id !== id))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (lines.length === 0) { setError('Add at least one product'); return }
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/purchase-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier_id: supplier_id || null,
          order_date: order_date || null,
          expected_date: expected_date || null,
          notes,
          lines: lines.map(l => ({
            product_id: l.product.id,
            quantity_ordered: l.qty,
            unit_cost: l.cost,
          })),
        }),
      })
      if (!res.ok) {
        const j = await res.json(); setError(j.error ?? 'Failed'); return
      }
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  const total = lines.reduce((s, l) => s + l.qty * l.cost, 0)

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <Card className="w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-xl">
        <CardHeader className="flex flex-row items-center justify-between pb-2 sticky top-0 bg-white z-10 border-b">
          <CardTitle className="text-base">New Purchase Order</CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="w-4 h-4" /></Button>
        </CardHeader>
        <CardContent className="pt-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Supplier</label>
              <select
                className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={supplier_id}
                onChange={e => setSupplier(e.target.value)}
              >
                <option value="">— No supplier —</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Order Date</label>
                <Input type="date" value={order_date} onChange={e => setOrderDate(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Expected Delivery</label>
                <Input type="date" value={expected_date} onChange={e => setExpected(e.target.value)} />
              </div>
            </div>

            {/* Line items */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-2">Items</label>
              <div className="relative mb-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  placeholder="Search product to add…"
                  className="pl-9"
                  value={prodSearch}
                  onChange={e => setProdSearch(e.target.value)}
                />
                {products.length > 0 && (
                  <div className="absolute z-10 top-full mt-1 left-0 right-0 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {products.slice(0, 8).map(p => (
                      <button
                        key={p.id} type="button"
                        className="w-full text-left px-4 py-2.5 hover:bg-indigo-50 text-sm"
                        onClick={() => addLine(p)}
                      >
                        <span className="font-medium">{p.name}</span>
                        <span className="ml-2 text-slate-400 text-xs">{p.sku}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {lines.length > 0 && (
                <div className="border border-slate-100 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500">Product</th>
                        <th className="text-right px-3 py-2 text-xs font-semibold text-slate-500 w-24">Qty</th>
                        <th className="text-right px-3 py-2 text-xs font-semibold text-slate-500 w-28">Unit Cost</th>
                        <th className="w-8"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map(l => (
                        <tr key={l.product.id} className="border-t border-slate-50">
                          <td className="px-3 py-2">
                            <p className="font-medium text-slate-900">{l.product.name}</p>
                            <p className="text-xs text-slate-400">{l.product.sku}</p>
                          </td>
                          <td className="px-3 py-2">
                            <Input
                              type="number" min={1}
                              className="text-right h-7 w-20 ml-auto"
                              value={l.qty}
                              onChange={e => setLines(ls => ls.map(x => x.product.id === l.product.id ? { ...x, qty: parseInt(e.target.value) || 1 } : x))}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <Input
                              type="number" min={0} step="0.01"
                              className="text-right h-7 w-24 ml-auto"
                              value={l.cost}
                              onChange={e => setLines(ls => ls.map(x => x.product.id === l.product.id ? { ...x, cost: parseFloat(e.target.value) || 0 } : x))}
                            />
                          </td>
                          <td className="px-2">
                            <button type="button" onClick={() => removeLine(l.product.id)} className="text-slate-300 hover:text-red-500 p-1">
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                      <tr className="border-t border-slate-200 bg-slate-50">
                        <td colSpan={2} className="px-3 py-2 text-xs font-semibold text-slate-600 text-right">Total</td>
                        <td className="px-3 py-2 text-right font-bold text-slate-900">{formatCurrency(total)}</td>
                        <td></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
              <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes…" />
            </div>

            {error && <p className="text-red-500 text-xs">{error}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? 'Creating…' : 'Create PO'}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function PurchaseOrdersPage() {
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch]             = useState('')
  const [showNew, setShowNew]           = useState(false)

  const url = statusFilter === 'all' ? '/api/purchase-orders' : `/api/purchase-orders?status=${statusFilter}`
  const { data, loading, error, refetch } = useApi<{ data: PurchaseOrder[] }>(url)
  const orders = data?.data ?? []

  const filtered = orders.filter(o =>
    !search ||
    o.po_number.toLowerCase().includes(search.toLowerCase()) ||
    (o.supplier?.name ?? '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div>
      <Topbar title="Purchase Orders" />
      <div className="p-6 space-y-4">

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-1 flex-wrap">
            <div className="relative max-w-xs flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input placeholder="Search PO or supplier…" className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div className="flex flex-wrap gap-1">
              {['all', 'draft', 'sent', 'partial', 'received', 'cancelled'].map(s => (
                <Button key={s} size="sm" variant={statusFilter === s ? 'default' : 'outline'} onClick={() => setStatusFilter(s)} className="text-xs capitalize">
                  {s === 'all' ? 'All' : STATUS_CONFIG[s]?.label ?? s}
                </Button>
              ))}
            </div>
          </div>
          <Button onClick={() => setShowNew(true)} className="gap-2">
            <Plus className="w-4 h-4" /> New PO
          </Button>
        </div>

        {error && <p className="text-red-500 text-sm">{error}</p>}

        <Card>
          <CardContent className="p-0">
            {loading ? (
              <TableSkeleton rows={6} cols={6} />
            ) : filtered.length === 0 ? (
              <div className="text-center py-16 text-slate-400">
                <Package className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm font-medium">No purchase orders</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b-2 border-slate-100 bg-slate-50">
                      <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide">PO #</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide">Supplier</th>
                      <th className="text-right px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide hidden md:table-cell">Lines</th>
                      <th className="text-right px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide hidden lg:table-cell">Total</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide hidden md:table-cell">Order Date</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide hidden lg:table-cell">Expected Delivery</th>
                      <th className="text-center px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide">Status</th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(o => {
                      const cfg = STATUS_CONFIG[o.status]
                      const total = (o.lines ?? []).reduce((s, l) => s + l.quantity_ordered * l.unit_cost, 0)
                      return (
                        <tr key={o.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                          <td className="px-4 py-3 font-mono text-xs font-semibold text-indigo-700">{o.po_number}</td>
                          <td className="px-4 py-3">
                            <p className="font-medium text-slate-900">{o.supplier?.name ?? <span className="text-slate-400">—</span>}</p>
                            {o.supplier && <p className="text-xs text-slate-400">{o.supplier.lead_time_days}d lead time</p>}
                          </td>
                          <td className="px-4 py-3 text-right text-slate-600 hidden md:table-cell">{(o.lines ?? []).length}</td>
                          <td className="px-4 py-3 text-right font-semibold text-slate-900 hidden lg:table-cell">{formatCurrency(total)}</td>
                          <td className="px-4 py-3 text-slate-500 text-xs hidden md:table-cell">{o.order_date ? formatDate(o.order_date) : '—'}</td>
                          <td className="px-4 py-3 text-slate-500 text-xs hidden lg:table-cell">{o.expected_date ? formatDate(o.expected_date) : '—'}</td>
                          <td className="px-4 py-3 text-center">
                            <Badge variant={cfg?.variant ?? 'secondary'} className="gap-1">
                              {cfg?.icon}{cfg?.label}
                            </Badge>
                          </td>
                          <td className="px-2">
                            <Link href={`/purchase-orders/${o.id}`}>
                              <Button variant="ghost" size="icon" className="w-7 h-7">
                                <ChevronRight className="w-4 h-4" />
                              </Button>
                            </Link>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {showNew && (
        <NewPODrawer
          onClose={() => setShowNew(false)}
          onSaved={() => { setShowNew(false); refetch() }}
        />
      )}
    </div>
  )
}
