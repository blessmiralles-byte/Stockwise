'use client'

import { useState, useMemo } from 'react'
import { Topbar } from '@/components/layout/topbar'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TableSkeleton } from '@/components/ui/skeleton'
import { useApi } from '@/lib/use-api'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  Search, Plus, ScanBarcode, MoreVertical, AlertTriangle,
  Package, ArrowDownToLine, ArrowUpFromLine, Scale,
  ChevronDown, CalendarClock, Layers,
} from 'lucide-react'
import Link from 'next/link'

// ─── helpers ─────────────────────────────────────────────────────────────────
const typeConfig: Record<string, { label: string; variant: any }> = {
  purchase:    { label: 'Purchase',    variant: 'success'   },
  transfer:    { label: 'Transfer',    variant: 'default'   },
  sale:        { label: 'Sale',        variant: 'warning'   },
  consumption: { label: 'Consumption', variant: 'secondary' },
  adjustment:  { label: 'Adjustment',  variant: 'outline'   },
}

function AttrChips({ attrs }: { attrs?: Record<string, string> }) {
  if (!attrs || Object.keys(attrs).length === 0) return null
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {Object.entries(attrs).map(([k, v]) => (
        <span key={k} className="inline-flex items-center gap-0.5 text-xs bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded font-medium">
          <span className="text-indigo-400">{k}:</span> {v}
        </span>
      ))}
    </div>
  )
}

// ─── Stock tab ────────────────────────────────────────────────────────────────
function StockTab() {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'low' | 'out' | 'review'>('all')

  const { data, loading, error, refetch } = useApi<{ data: any[] }>('/api/inventory')
  const balances = data?.data ?? []
  const reviewCount = balances.filter((b: any) => b.product?.needs_review).length

  async function markReviewed(productId: string) {
    await fetch(`/api/products/${productId}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ needs_review: false }),
    })
    refetch()
  }

  const filtered = balances.filter((b: any) => {
    const name: string = b.product?.name ?? ''
    const sku: string = b.product?.sku ?? ''
    const barcode: string = b.product?.barcode ?? ''
    // also search within attribute values
    const attrValues = Object.values(b.product?.attributes ?? {}).join(' ').toLowerCase()
    const matchesSearch =
      name.toLowerCase().includes(search.toLowerCase()) ||
      sku.toLowerCase().includes(search.toLowerCase()) ||
      barcode.includes(search) ||
      attrValues.includes(search.toLowerCase())

    const reorder = b.product?.reorder_point ?? 0
    const status = b.quantity === 0 ? 'out' : b.quantity <= reorder ? 'low' : 'ok'
    const matchesFilter =
      filter === 'all'    ? true
      : filter === 'review' ? !!b.product?.needs_review
      : status === filter
    return matchesSearch && matchesFilter
  })

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-0 flex-wrap">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search name, SKU, barcode, or attribute…"
              className="pl-9"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-1">
            {(['all', 'low', 'out'] as const).map(f => (
              <Button key={f} size="sm" variant={filter === f ? 'default' : 'outline'} onClick={() => setFilter(f)}>
                {f === 'all' ? 'All' : f === 'low' ? 'Low Stock' : 'Out of Stock'}
              </Button>
            ))}
            {reviewCount > 0 && (
              <Button
                size="sm"
                variant={filter === 'review' ? 'default' : 'outline'}
                onClick={() => setFilter('review')}
                className={filter === 'review' ? '' : 'border-amber-300 text-amber-700 hover:bg-amber-50'}
              >
                Needs Review ({reviewCount})
              </Button>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Link href="/transactions/new">
            <Button variant="outline" className="gap-2"><ScanBarcode className="w-4 h-4" />Scan</Button>
          </Link>
          <Link href="/inventory/new">
            <Button className="gap-2"><Plus className="w-4 h-4" />Add Item</Button>
          </Link>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <TableSkeleton rows={6} cols={6} />
          ) : error ? (
            <p className="text-center py-10 text-red-500">{error}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left px-4 py-3 font-medium text-slate-500">Item</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-500 hidden md:table-cell">SKU / Barcode</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-500 hidden lg:table-cell">Location</th>
                    <th className="text-right px-4 py-3 font-medium text-slate-500">Qty</th>
                    <th className="text-right px-4 py-3 font-medium text-slate-500 hidden md:table-cell">Avg Cost</th>
                    <th className="text-right px-4 py-3 font-medium text-slate-500 hidden lg:table-cell">Total Value</th>
                    <th className="text-center px-4 py-3 font-medium text-slate-500 hidden md:table-cell">Method</th>
                    <th className="text-center px-4 py-3 font-medium text-slate-500">Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((b: any) => {
                    const reorder = b.product?.reorder_point ?? 0
                    const status = b.quantity === 0 ? 'out' : b.quantity <= reorder ? 'low' : 'ok'
                    return (
                      <tr key={b.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                        <td className="px-4 py-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-slate-900">{b.product?.name}</p>
                              {b.product?.needs_review && (
                                <button
                                  onClick={() => markReviewed(b.product.id)}
                                  title="Auto-created during receiving — click to mark reviewed"
                                  className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 hover:bg-amber-200 transition-colors">
                                  <AlertTriangle className="w-2.5 h-2.5" /> Review
                                </button>
                              )}
                            </div>
                            <p className="text-xs text-slate-400">{b.product?.category?.name}</p>
                            <AttrChips attrs={b.product?.attributes} />
                          </div>
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          <p className="font-mono text-xs text-slate-600">{b.product?.sku}</p>
                          <p className="font-mono text-xs text-slate-400">{b.product?.barcode}</p>
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell text-slate-600">{b.location?.name}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={`font-semibold ${b.quantity === 0 ? 'text-red-600' : b.quantity <= reorder ? 'text-yellow-600' : 'text-slate-900'}`}>
                            {b.quantity}
                          </span>
                          {b.quantity > 0 && b.quantity <= reorder && (
                            <AlertTriangle className="inline w-3 h-3 ml-1 text-yellow-500" />
                          )}
                        </td>
                        <td className="px-4 py-3 text-right hidden md:table-cell text-slate-600">{formatCurrency(b.avg_cost)}</td>
                        <td className="px-4 py-3 text-right hidden lg:table-cell font-medium text-slate-900">
                          {formatCurrency(b.avg_cost * b.quantity)}
                        </td>
                        <td className="px-4 py-3 text-center hidden md:table-cell">
                          <Badge variant="outline" className="uppercase text-xs">{b.product?.cost_method}</Badge>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Badge variant={status === 'ok' ? 'success' : status === 'low' ? 'warning' : 'destructive'}>
                            {status === 'ok' ? 'OK' : status === 'low' ? 'Low' : 'Out'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Button variant="ghost" size="icon" className="w-8 h-8">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {filtered.length === 0 && (
                <div className="text-center py-12 text-slate-400">
                  <Package className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p>No items found</p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  )
}

// ─── Batches tab ──────────────────────────────────────────────────────────────
const expiryConfig = {
  expired:  { label: 'Expired',   variant: 'destructive' as const, bg: 'bg-red-50'    },
  critical: { label: '≤ 7 days',  variant: 'destructive' as const, bg: 'bg-red-50'    },
  soon:     { label: '≤ 30 days', variant: 'warning'     as const, bg: 'bg-yellow-50' },
  ok:       { label: 'Good',      variant: 'success'     as const, bg: ''             },
  none:     { label: 'No expiry', variant: 'secondary'   as const, bg: ''             },
}

function BatchesTab() {
  const [search, setSearch] = useState('')
  const [expiryFilter, setExpiryFilter] = useState<'all' | 'expiring' | 'expired'>('all')

  const url = expiryFilter === 'expiring'
    ? '/api/inventory/batches?expiring_within_days=30'
    : '/api/inventory/batches'

  const { data, loading, error } = useApi<{ data: any[] }>(url)
  const rows = data?.data ?? []

  const filtered = rows.filter((r: any) => {
    const matchesSearch =
      (r.product?.name ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (r.product?.sku ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (r.batch_no ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (r.reference_no ?? '').toLowerCase().includes(search.toLowerCase())

    if (expiryFilter === 'expired') return matchesSearch && r.expiry_status === 'expired'
    return matchesSearch
  })

  const expiringCount = rows.filter((r: any) => ['critical', 'soon'].includes(r.expiry_status)).length
  const expiredCount  = rows.filter((r: any) => r.expiry_status === 'expired').length

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Search item, batch no, or reference…"
            className="pl-9"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-1">
          {[
            { key: 'all',      label: 'All Batches' },
            { key: 'expiring', label: `Expiring Soon${expiringCount ? ` (${expiringCount})` : ''}` },
            { key: 'expired',  label: `Expired${expiredCount ? ` (${expiredCount})` : ''}` },
          ].map(f => (
            <Button
              key={f.key}
              size="sm"
              variant={expiryFilter === f.key ? 'default' : 'outline'}
              onClick={() => setExpiryFilter(f.key as any)}
            >
              {f.label}
            </Button>
          ))}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <TableSkeleton rows={6} cols={6} />
          ) : error ? (
            <p className="text-center py-10 text-red-500">{error}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/60">
                    <th className="text-left px-4 py-3 font-medium text-slate-500">Item</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-500 hidden sm:table-cell">Batch / Ref</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-500 hidden md:table-cell">Location</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-500 hidden md:table-cell">Purchase Date</th>
                    <th className="text-right px-4 py-3 font-medium text-slate-500">Qty Left</th>
                    <th className="text-right px-4 py-3 font-medium text-slate-500 hidden md:table-cell">Unit Cost</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-500">Expiry</th>
                    <th className="text-center px-4 py-3 font-medium text-slate-500">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r: any) => {
                    const cfg = expiryConfig[r.expiry_status as keyof typeof expiryConfig] ?? expiryConfig.none
                    return (
                      <tr key={r.id} className={`border-b border-slate-50 hover:bg-slate-50/50 transition-colors ${cfg.bg}`}>
                        <td className="px-4 py-3">
                          <p className="font-medium text-slate-900">{r.product?.name}</p>
                          <p className="font-mono text-xs text-slate-400">{r.product?.sku}</p>
                        </td>
                        <td className="px-4 py-3 hidden sm:table-cell">
                          {r.batch_no && <p className="font-mono text-xs text-slate-700">{r.batch_no}</p>}
                          {r.reference_no && <p className="font-mono text-xs text-slate-400">{r.reference_no}</p>}
                          {!r.batch_no && !r.reference_no && <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell text-slate-600 text-xs">{r.location?.name ?? '—'}</td>
                        <td className="px-4 py-3 hidden md:table-cell text-slate-500 text-xs">{formatDate(r.purchase_date)}</td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-900">{r.quantity_remaining}</td>
                        <td className="px-4 py-3 text-right hidden md:table-cell text-slate-600">{formatCurrency(r.unit_cost)}</td>
                        <td className="px-4 py-3">
                          {r.expiration_date ? (
                            <div>
                              <p className="text-xs font-medium text-slate-800">{formatDate(r.expiration_date)}</p>
                              {r.days_until_expiry !== undefined && (
                                <p className={`text-xs ${r.days_until_expiry < 0 ? 'text-red-600' : r.days_until_expiry <= 7 ? 'text-red-500' : r.days_until_expiry <= 30 ? 'text-yellow-600' : 'text-slate-400'}`}>
                                  {r.days_until_expiry < 0
                                    ? `${Math.abs(r.days_until_expiry)}d ago`
                                    : `${r.days_until_expiry}d left`}
                                </p>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-300 text-xs">No expiry</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Badge variant={cfg.variant}>{cfg.label}</Badge>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>

              {filtered.length === 0 && (
                <div className="text-center py-12 text-slate-400">
                  <CalendarClock className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No batches found</p>
                  {expiryFilter !== 'all' && (
                    <p className="text-xs mt-1">Try switching to "All Batches"</p>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  )
}

// ─── Ledger tab ───────────────────────────────────────────────────────────────
function LedgerTab() {
  const [selectedProduct, setSelectedProduct] = useState('')
  const [typeFilter, setTypeFilter]           = useState('all')

  // Populate the item picker from the stock list
  const { data: invData } = useApi<{ data: any[] }>('/api/inventory')
  const products = useMemo(() => {
    const seen = new Set<string>()
    return (invData?.data ?? [])
      .map((b: any) => b.product)
      .filter((p: any) => p && !seen.has(p.id) && seen.add(p.id))
      .sort((a: any, b: any) => a.name.localeCompare(b.name))
  }, [invData])

  // Current stock info for the selected item header
  const stockInfo = useMemo(() => {
    if (!selectedProduct) return null
    const rows = invData?.data ?? []
    const matching = rows.filter((b: any) => b.product?.id === selectedProduct)
    const totalQty = matching.reduce((s: number, b: any) => s + b.quantity, 0)
    const avgCost  = matching[0]?.avg_cost ?? 0
    const product  = matching[0]?.product  ?? null
    return { totalQty, avgCost, product, locations: matching }
  }, [invData, selectedProduct])

  const { data, loading, error } = useApi<{ data: any[] }>(
    selectedProduct ? `/api/inventory/ledger?product_id=${selectedProduct}` : null
  )
  const allRows = data?.data ?? []

  const rows = typeFilter === 'all'
    ? allRows
    : allRows.filter((r: any) => r.transaction_type === typeFilter)

  // Totals
  const totalDebitQty   = rows.reduce((s: number, r: any) => s + r.qty_in,    0)
  const totalCreditQty  = rows.reduce((s: number, r: any) => s + r.qty_out,   0)
  const totalDebitVal   = rows.reduce((s: number, r: any) => s + r.value_in,  0)
  const totalCreditVal  = rows.reduce((s: number, r: any) => s + r.value_out, 0)
  const closingBalance  = rows.length > 0 ? rows[0].running_balance : 0   // rows are newest-first

  return (
    <>
      {/* ── Controls ────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <select
            value={selectedProduct}
            onChange={e => { setSelectedProduct(e.target.value); setTypeFilter('all') }}
            className="h-10 rounded-lg border border-slate-200 bg-white pl-3 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 appearance-none min-w-[220px]"
          >
            <option value="">— Select an item —</option>
            {products.map((p: any) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        </div>

        {selectedProduct && (
          <div className="flex flex-wrap gap-1">
            {['all', 'purchase', 'transfer', 'sale', 'consumption', 'adjustment'].map(t => (
              <Button
                key={t} size="sm"
                variant={typeFilter === t ? 'default' : 'outline'}
                onClick={() => setTypeFilter(t)}
                className="capitalize text-xs"
              >
                {t === 'all' ? 'All Types' : typeConfig[t]?.label ?? t}
              </Button>
            ))}
          </div>
        )}
      </div>

      {/* ── Empty state — no item selected ──────────────────────── */}
      {!selectedProduct && (
        <Card>
          <CardContent className="py-16 flex flex-col items-center gap-3 text-slate-400">
            <Scale className="w-12 h-12 opacity-20" />
            <p className="text-sm font-medium">Select an item above to view its ledger</p>
            <p className="text-xs">Each item has its own debit / credit history and running balance.</p>
          </CardContent>
        </Card>
      )}

      {/* ── Item header card ─────────────────────────────────────── */}
      {selectedProduct && stockInfo && (
        <div className="bg-white border border-slate-200 rounded-xl px-5 py-4 flex flex-wrap items-center gap-6">
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-slate-900 text-base truncate">{stockInfo.product?.name}</p>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              {stockInfo.product?.sku}
              {stockInfo.product?.category?.name ? ` · ${stockInfo.product.category.name}` : ''}
              {' · '}
              {stockInfo.product?.cost_method?.toUpperCase()} costing
            </p>
          </div>
          <div className="flex gap-6 flex-wrap text-center">
            <div>
              <p className="text-xs text-slate-400 mb-0.5">On Hand</p>
              <p className="text-xl font-bold text-slate-900 tabular-nums">
                {stockInfo.totalQty}
                <span className="text-xs font-normal text-slate-400 ml-1">{stockInfo.product?.unit_of_measure}</span>
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-0.5">Avg Cost</p>
              <p className="text-xl font-bold text-slate-900">{formatCurrency(stockInfo.avgCost)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-0.5">Stock Value</p>
              <p className="text-xl font-bold text-indigo-600">{formatCurrency(stockInfo.avgCost * stockInfo.totalQty)}</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Summary strip ────────────────────────────────────────── */}
      {selectedProduct && !loading && rows.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-green-50 border border-green-100 rounded-lg px-4 py-3">
            <div className="flex items-center gap-1.5 text-green-600 text-xs font-medium mb-1">
              <ArrowDownToLine className="w-3.5 h-3.5" /> Total Debit
            </div>
            <p className="text-lg font-bold text-green-700 tabular-nums">+{totalDebitQty.toLocaleString()}</p>
            <p className="text-xs text-green-600 mt-0.5">{formatCurrency(totalDebitVal)}</p>
          </div>
          <div className="bg-red-50 border border-red-100 rounded-lg px-4 py-3">
            <div className="flex items-center gap-1.5 text-red-600 text-xs font-medium mb-1">
              <ArrowUpFromLine className="w-3.5 h-3.5" /> Total Credit
            </div>
            <p className="text-lg font-bold text-red-600 tabular-nums">{totalCreditQty.toLocaleString()}</p>
            <p className="text-xs text-red-500 mt-0.5">{formatCurrency(totalCreditVal)}</p>
          </div>
          <div className="bg-slate-50 border border-slate-100 rounded-lg px-4 py-3">
            <div className="flex items-center gap-1.5 text-slate-500 text-xs font-medium mb-1">
              <Scale className="w-3.5 h-3.5" /> Net Movement
            </div>
            <p className={`text-lg font-bold tabular-nums ${totalDebitQty - totalCreditQty >= 0 ? 'text-slate-900' : 'text-red-600'}`}>
              {totalDebitQty - totalCreditQty >= 0 ? '+' : ''}{(totalDebitQty - totalCreditQty).toLocaleString()}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">{rows.length} transaction{rows.length !== 1 ? 's' : ''}</p>
          </div>
          <div className="bg-indigo-50 border border-indigo-100 rounded-lg px-4 py-3">
            <div className="flex items-center gap-1.5 text-indigo-600 text-xs font-medium mb-1">
              <Package className="w-3.5 h-3.5" /> Closing Balance
            </div>
            <p className={`text-lg font-bold tabular-nums ${closingBalance < 0 ? 'text-red-600' : 'text-indigo-700'}`}>
              {closingBalance.toLocaleString()}
            </p>
            <p className="text-xs text-indigo-400 mt-0.5">{stockInfo?.product?.unit_of_measure}</p>
          </div>
        </div>
      )}

      {/* ── Ledger table ─────────────────────────────────────────── */}
      {selectedProduct && (
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <TableSkeleton rows={8} cols={7} />
            ) : error ? (
              <p className="text-center py-10 text-red-500">{error}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b-2 border-slate-200 bg-slate-50">
                      <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide">Date</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide hidden sm:table-cell">Reference</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide">Type</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide hidden lg:table-cell">Location</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide hidden xl:table-cell">Notes</th>
                      {/* Debit = IN */}
                      <th className="text-right px-4 py-3 font-semibold text-xs uppercase tracking-wide">
                        <span className="text-green-600">Debit</span>
                        <span className="text-slate-400 font-normal block text-xs normal-case tracking-normal">qty · value</span>
                      </th>
                      {/* Credit = OUT */}
                      <th className="text-right px-4 py-3 font-semibold text-xs uppercase tracking-wide">
                        <span className="text-red-500">Credit</span>
                        <span className="text-slate-400 font-normal block text-xs normal-case tracking-normal">qty · value</span>
                      </th>
                      <th className="text-right px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r: any, idx: number) => {
                      const cfg     = typeConfig[r.transaction_type]
                      const loc     = r.qty_in > 0 ? r.to_location : r.from_location
                      const debitQty  = r.qty_in
                      const creditQty = r.qty_out
                      const debitVal  = r.value_in
                      const creditVal = r.value_out
                      const isLast    = idx === rows.length - 1

                      return (
                        <tr
                          key={r.id}
                          className={`border-b border-slate-50 transition-colors ${
                            debitQty > 0
                              ? 'hover:bg-green-50/40'
                              : 'hover:bg-red-50/30'
                          }`}
                        >
                          <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                            {formatDate(r.created_at)}
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-slate-400 hidden sm:table-cell">
                            {r.reference_no ?? '—'}
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={cfg?.variant ?? 'secondary'}>{cfg?.label ?? r.transaction_type}</Badge>
                          </td>
                          <td className="px-4 py-3 hidden lg:table-cell text-slate-500 text-xs">
                            {loc?.name ?? '—'}
                          </td>
                          <td className="px-4 py-3 hidden xl:table-cell text-slate-400 text-xs max-w-[160px] truncate">
                            {r.notes ?? '—'}
                          </td>

                          {/* Debit (IN) */}
                          <td className="px-4 py-3 text-right">
                            {debitQty > 0 ? (
                              <div>
                                <span className="font-semibold text-green-600 tabular-nums">+{debitQty}</span>
                                <span className="block text-xs text-green-500 tabular-nums">{formatCurrency(debitVal)}</span>
                              </div>
                            ) : (
                              <span className="text-slate-200">—</span>
                            )}
                          </td>

                          {/* Credit (OUT) */}
                          <td className="px-4 py-3 text-right">
                            {creditQty > 0 ? (
                              <div>
                                <span className="font-semibold text-red-500 tabular-nums">{creditQty}</span>
                                <span className="block text-xs text-red-400 tabular-nums">{formatCurrency(creditVal)}</span>
                              </div>
                            ) : (
                              <span className="text-slate-200">—</span>
                            )}
                          </td>

                          {/* Running balance */}
                          <td className="px-4 py-3 text-right">
                            <span className={`font-bold tabular-nums text-sm ${r.running_balance < 0 ? 'text-red-600' : isLast ? 'text-indigo-600' : 'text-slate-800'}`}>
                              {r.running_balance.toLocaleString()}
                            </span>
                          </td>
                        </tr>
                      )
                    })}

                    {/* Totals footer row */}
                    {rows.length > 0 && (
                      <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
                        <td colSpan={3} className="px-4 py-3 text-xs text-slate-500 uppercase tracking-wide">
                          Totals
                        </td>
                        <td className="hidden lg:table-cell" />
                        <td className="hidden xl:table-cell" />
                        <td className="px-4 py-3 text-right">
                          <span className="text-green-600 tabular-nums">+{totalDebitQty.toLocaleString()}</span>
                          <span className="block text-xs text-green-500 font-normal">{formatCurrency(totalDebitVal)}</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-red-500 tabular-nums">{totalCreditQty.toLocaleString()}</span>
                          <span className="block text-xs text-red-400 font-normal">{formatCurrency(totalCreditVal)}</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={`tabular-nums text-sm ${closingBalance < 0 ? 'text-red-600' : 'text-indigo-700'}`}>
                            {closingBalance.toLocaleString()}
                          </span>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>

                {rows.length === 0 && (
                  <div className="text-center py-12 text-slate-400">
                    <Scale className="w-10 h-10 mx-auto mb-3 opacity-20" />
                    <p className="text-sm">No transactions recorded for this item yet.</p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
const TABS = [
  { key: 'stock',   label: 'Stock',   icon: Package       },
  { key: 'batches', label: 'Batches', icon: Layers        },
  { key: 'ledger',  label: 'Ledger',  icon: Scale         },
] as const

type Tab = typeof TABS[number]['key']

export default function InventoryPage() {
  const [tab, setTab] = useState<Tab>('stock')

  return (
    <div>
      <Topbar title="Inventory" />
      <div className="p-6 space-y-4">

        {/* Tab switcher */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg w-fit">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                tab === key
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        {tab === 'stock'   && <StockTab />}
        {tab === 'batches' && <BatchesTab />}
        {tab === 'ledger'  && <LedgerTab />}
      </div>
    </div>
  )
}
