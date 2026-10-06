'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Topbar } from '@/components/layout/topbar'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useApi } from '@/lib/use-api'
import { cn } from '@/lib/utils'
import { ExportButtons } from '@/components/reports/export-buttons'
import {
  AlertTriangle, PackageX, Loader2, ShoppingCart, Search, CheckCircle2, Truck, RefreshCw,
} from 'lucide-react'

interface ReorderItem {
  product_id:     string
  name:           string
  sku:            string | null
  unit:           string | null
  quantity:       number
  reorder_point:  number
  suggested_qty:  number
  vendor_id:      string | null
  vendor_name:    string | null
  lead_time_days: number | null
  alert_status:   'open' | 'ordered' | null
  po_id:          string | null
}

export default function ReorderPage() {
  const router = useRouter()
  const { data, loading, refetch } = useApi<{ data: ReorderItem[]; out_of_stock: number }>('/api/reorder')
  const items = useMemo(() => data?.data ?? [], [data])

  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [busy, setBusy]     = useState(false)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const [checking, setChecking] = useState(false)

  // The nightly run does this automatically; this is the "don't wait until
  // tomorrow" button — same check, scoped to this organization.
  const checkNow = async () => {
    setChecking(true); setNotice(null)
    try {
      const res = await fetch('/api/notifications/reorder', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) { setNotice({ ok: false, text: json.error ?? 'Could not run the check' }); return }
      const opened = json.alerts_opened ?? 0
      setNotice({
        ok: true,
        text: opened > 0
          ? `${opened} item${opened > 1 ? 's' : ''} newly below reorder point — procurement has been emailed.`
          : 'Checked. Nothing new has crossed its reorder point since the last run.',
      })
      refetch()
    } finally { setChecking(false) }
  }

  const q = search.trim().toLowerCase()
  const shown = q
    ? items.filter(i => `${i.name} ${i.sku ?? ''} ${i.vendor_name ?? ''}`.toLowerCase().includes(q))
    : items

  // Anything already on a draft PO is shown for context but not re-ordered.
  const orderable = shown.filter(i => i.alert_status !== 'ordered')
  const allPicked = orderable.length > 0 && orderable.every(i => picked.has(i.product_id))

  const toggle = (id: string) =>
    setPicked(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const toggleAll = () =>
    setPicked(allPicked ? new Set() : new Set(orderable.map(i => i.product_id)))

  const vendorCount = new Set(
    items.filter(i => picked.has(i.product_id)).map(i => i.vendor_id ?? 'none'),
  ).size

  const createPOs = async () => {
    setBusy(true); setNotice(null)
    try {
      const res = await fetch('/api/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_ids: [...picked] }),
      })
      const json = await res.json()
      if (!res.ok) { setNotice({ ok: false, text: json.error ?? 'Could not create the orders' }); return }
      setPicked(new Set())
      setNotice({ ok: true, text: json.message })
      refetch()
      if (json.data?.length === 1) router.push(`/purchase-orders/${json.data[0].id}`)
    } finally { setBusy(false) }
  }

  const buildSheets = () => [{
    name: 'To reorder',
    rows: [
      ['Item', 'SKU', 'On hand', 'Unit', 'Reorder at', 'Suggested order', 'Vendor', 'Lead time (days)', 'Status'],
      ...shown.map(i => [
        i.name, i.sku, i.quantity, i.unit, i.reorder_point, i.suggested_qty,
        i.vendor_name, i.lead_time_days, i.alert_status === 'ordered' ? 'On a draft PO' : 'To order',
      ]),
    ],
    notes: [`Items at or below reorder point — ${items.length} in total, ${data?.out_of_stock ?? 0} out of stock`],
  }]

  return (
    <div>
      <Topbar title="Reorder" />
      <div className="p-6 space-y-5 max-w-5xl">
        <p className="text-sm text-slate-500">
          Stock at or below its reorder point. Pick what you want to buy and Stocked drafts one
          purchase order per vendor — priced by you before it goes out.
        </p>

        {notice && (
          <div className={cn('flex items-start gap-2 rounded-xl border px-4 py-3 text-sm',
            notice.ok ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-700')}>
            {notice.ok ? <CheckCircle2 className="w-4 h-4 mt-0.5" /> : <AlertTriangle className="w-4 h-4 mt-0.5" />}
            <p className="flex-1">{notice.text}</p>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Card><CardContent className="p-4">
            <p className="text-xs text-slate-500">Below reorder point</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{items.length}</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <p className="text-xs text-slate-500 flex items-center gap-1"><PackageX className="w-3.5 h-3.5" /> Out of stock</p>
            <p className="text-2xl font-bold text-red-600 mt-1">{data?.out_of_stock ?? 0}</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <p className="text-xs text-slate-500 flex items-center gap-1"><Truck className="w-3.5 h-3.5" /> Already on a draft PO</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{items.filter(i => i.alert_status === 'ordered').length}</p>
          </CardContent></Card>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search items or vendors…"
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <ExportButtons filename="Items to reorder" build={buildSheets} disabled={!items.length} />
          <Button variant="outline" onClick={checkNow} disabled={checking} className="gap-2">
            {checking ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Check now
          </Button>
          <Button onClick={createPOs} disabled={busy || picked.size === 0} className="gap-2">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShoppingCart className="w-4 h-4" />}
            {picked.size === 0
              ? 'Create draft POs'
              : `Create ${vendorCount} draft PO${vendorCount > 1 ? 's' : ''} (${picked.size} item${picked.size > 1 ? 's' : ''})`}
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
        ) : items.length === 0 ? (
          <Card><CardContent className="p-10 text-center">
            <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-700">Nothing to reorder</p>
            <p className="text-xs text-slate-400 mt-1">
              Every product with a reorder point is above it. Set reorder points in Setup → Products.
            </p>
          </CardContent></Card>
        ) : (
          <Card><CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr className="text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 w-10">
                    <input type="checkbox" checked={allPicked} onChange={toggleAll} aria-label="Select all" />
                  </th>
                  <th className="text-left px-2 py-3 font-semibold">Item</th>
                  <th className="text-right px-4 py-3 font-semibold">On hand</th>
                  <th className="text-right px-4 py-3 font-semibold">Reorder at</th>
                  <th className="text-right px-4 py-3 font-semibold">Suggested</th>
                  <th className="text-left px-4 py-3 font-semibold">Vendor</th>
                </tr>
              </thead>
              <tbody>
                {shown.map(i => {
                  const ordered = i.alert_status === 'ordered'
                  return (
                    <tr key={i.product_id} className={cn('border-b border-slate-50', ordered && 'opacity-60')}>
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={picked.has(i.product_id)}
                          onChange={() => toggle(i.product_id)}
                          disabled={ordered}
                          aria-label={`Select ${i.name}`}
                        />
                      </td>
                      <td className="px-2 py-3">
                        <p className="font-medium text-slate-900">{i.name}</p>
                        <p className="text-xs text-slate-400 font-mono">
                          {i.sku}{ordered && <span className="ml-2 text-slate-500 font-sans">on a draft PO</span>}
                        </p>
                      </td>
                      <td className={cn('px-4 py-3 text-right tabular-nums font-medium',
                        i.quantity <= 0 ? 'text-red-600' : 'text-slate-900')}>
                        {i.quantity.toLocaleString()} <span className="text-xs text-slate-400">{i.unit}</span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-500">{i.reorder_point.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold text-indigo-700">{i.suggested_qty.toLocaleString()}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {i.vendor_name ?? <span className="text-amber-600">No preferred vendor</span>}
                        {i.lead_time_days != null && <span className="text-xs text-slate-400"> · {i.lead_time_days}d lead</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </CardContent></Card>
        )}

        <p className="text-xs text-slate-400">
          Procurement and the owner get an email the morning stock crosses a reorder point — once per
          item, not every day. Items without a preferred vendor are grouped onto one draft for you to assign.
        </p>
      </div>
    </div>
  )
}
