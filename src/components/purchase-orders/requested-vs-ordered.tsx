'use client'

import Link from 'next/link'
import { AlertTriangle, FileText } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency } from '@/lib/utils'

/**
 * Shown when a purchase order was raised from a requisition: what the crew
 * asked for and estimated, against what procurement actually negotiated.
 * Approvers see any price increase here before they approve the order.
 */
export function RequestedVsOrdered({ po }: { po: any }) {
  const req = po?.requisition
  if (!req) return null

  const byId = new Map<string, any>((req.items ?? []).map((i: any) => [i.id, i]))
  const rows = (po.lines ?? []).map((l: any) => {
    const src = l.requisition_item_id ? byId.get(l.requisition_item_id) : null
    const orderedEach   = Number(l.unit_cost ?? 0)
    const requestedEach = src?.unit_cost != null ? Number(src.unit_cost) : null
    return {
      id:           l.id,
      name:         l.product?.name ?? 'Item',
      sku:          l.product?.sku,
      orderedQty:   Number(l.quantity_ordered ?? 0),
      requestedQty: src ? Number(src.quantity ?? 0) : null,
      orderedEach,
      requestedEach,
      diffPct: requestedEach && requestedEach > 0
        ? ((orderedEach - requestedEach) / requestedEach) * 100
        : null,
    }
  })

  const requestedTotal = rows.reduce(
    (sum: number, r: any) => sum + (r.requestedEach != null ? r.requestedEach * (r.requestedQty ?? r.orderedQty) : 0), 0)
  const orderedTotal = rows.reduce((sum: number, r: any) => sum + r.orderedEach * r.orderedQty, 0)
  const totalPct = requestedTotal > 0 ? ((orderedTotal - requestedTotal) / requestedTotal) * 100 : null
  const priced   = rows.some((r: any) => r.requestedEach != null)

  const pctClass = (pct: number | null) =>
    pct == null ? 'text-slate-400' : pct > 0 ? 'text-red-600' : pct < 0 ? 'text-green-600' : 'text-slate-500'
  const pctLabel = (pct: number | null) =>
    pct == null ? '—' : `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <FileText className="w-4 h-4 text-slate-400" />
          Requested vs ordered
        </CardTitle>
        <p className="text-xs text-slate-500 mt-1">
          From{' '}
          <Link href="/requisitions" className="text-indigo-600 hover:underline font-medium">{req.req_number}</Link>
          {req.requested_by?.full_name && (
            <> · requested by {req.requested_by.full_name}
              {req.requested_by.job_title ? ` (${req.requested_by.job_title})` : ''}</>
          )}
        </p>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        {!priced && (
          <p className="text-xs text-slate-500 mb-3">
            The request didn&apos;t carry estimated prices, so there is nothing to compare on price —
            check the quantities match what was asked for.
          </p>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-slate-500">
                <th className="text-left font-semibold py-2">Item</th>
                <th className="text-right font-semibold py-2">Requested</th>
                <th className="text-right font-semibold py-2">Ordered</th>
                <th className="text-right font-semibold py-2">Change</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r: any) => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="py-2 pr-2">
                    <p className="text-slate-800">{r.name}</p>
                    {r.sku && <p className="text-xs text-slate-400 font-mono">{r.sku}</p>}
                  </td>
                  <td className="py-2 text-right text-slate-500 whitespace-nowrap">
                    {r.requestedQty != null ? `${r.requestedQty} × ` : '—'}
                    {r.requestedEach != null ? formatCurrency(r.requestedEach) : ''}
                  </td>
                  <td className="py-2 text-right text-slate-800 whitespace-nowrap">
                    {r.orderedQty} × {formatCurrency(r.orderedEach)}
                  </td>
                  <td className={`py-2 text-right font-medium whitespace-nowrap ${pctClass(r.diffPct)}`}>
                    {pctLabel(r.diffPct)}
                  </td>
                </tr>
              ))}
            </tbody>
            {priced && (
              <tfoot>
                <tr className="border-t-2 border-slate-200 font-semibold">
                  <td className="py-2">Total</td>
                  <td className="py-2 text-right text-slate-500">{formatCurrency(requestedTotal)}</td>
                  <td className="py-2 text-right text-slate-900">{formatCurrency(orderedTotal)}</td>
                  <td className={`py-2 text-right ${pctClass(totalPct)}`}>{pctLabel(totalPct)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        {totalPct != null && totalPct > 10 && (
          <div className="mt-3 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            This order is {totalPct.toFixed(1)}% above what was requested. Worth a word with the vendor
            (or the requester) before approving.
          </div>
        )}
      </CardContent>
    </Card>
  )
}
