'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Topbar } from '@/components/layout/topbar'
import { ExportButtons } from '@/components/reports/export-buttons'
import { Stat, StatGrid, TableCard, th, thR, td, tdR, tr } from '@/components/reports/report-kit'
import { useApi } from '@/lib/use-api'
import { useMoney } from '@/lib/use-currency'
import type { GrniRow, GrniState } from '@/lib/procurement-reports'

const STATE: Record<GrniState, { label: string; tone: string }> = {
  not_invoiced:   { label: 'No invoice yet',  tone: 'bg-amber-50 text-amber-700' },
  over_invoiced:  { label: 'Billed too much', tone: 'bg-red-50 text-red-700' },
  under_invoiced: { label: 'Billed too little', tone: 'bg-blue-50 text-blue-700' },
  matched:        { label: 'Matched',         tone: 'bg-green-50 text-green-700' },
}

export default function ReceivedNotInvoicedReport() {
  const { money } = useMoney()
  const [showAll, setShowAll] = useState(false)
  const { data, loading, error } = useApi<{ data: GrniRow[]; summary: any; truncated?: boolean }>(
    `/api/reports/received-not-invoiced${showAll ? '?all=1' : ''}`)
  const rows = data?.data ?? []
  const s = data?.summary ?? {}

  const buildSheets = () => [{
    name: 'Received not invoiced',
    rows: [
      ['PO', 'Vendor', 'Status', 'Goods received', 'Invoice no', 'Invoice amount', 'Variance', 'Days since receipt'],
      ...rows.map(r => [r.po_number, r.vendor, STATE[r.state].label, r.received_value, r.invoice_no ?? '', r.invoice_amount ?? '', r.variance ?? '', r.age_days]),
    ],
    notes: [`Received not invoiced — accrual ${s.accrual ?? 0}, net invoice variance ${s.variance ?? 0}`],
  }]

  return (
    <div>
      <Topbar title="Received, Not Invoiced" />
      <div className="p-6 space-y-4 max-w-6xl">
        <StatGrid>
          <Stat label="To accrue" value={money(s.accrual ?? 0)} tone="amber" hint={`${s.not_invoiced ?? 0} orders received, no invoice`} />
          <Stat label="Billed too much" value={s.over_invoiced ?? 0} tone={s.over_invoiced ? 'red' : 'slate'} />
          <Stat label="Billed too little" value={s.under_invoiced ?? 0} />
          <Stat label="Net invoice variance" value={money(s.variance ?? 0)} hint="Invoices against goods received" />
        </StatGrid>

        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} className="rounded border-slate-300" />
            Include matched orders{s.matched != null ? ` (${s.matched})` : ''}
          </label>
          <div className="flex-1" />
          <ExportButtons filename="Received not invoiced" build={buildSheets} disabled={rows.length === 0} />
        </div>

        <TableCard loading={loading} error={error} isEmpty={rows.length === 0} truncated={data?.truncated}
          empty="Every receipt has a matching invoice. Nothing to accrue.">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className={th}>PO</th><th className={th}>Vendor</th><th className={thR}>Goods received</th>
                <th className={thR}>Invoice</th><th className={thR}>Variance</th><th className={thR}>Age</th><th className={th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className={tr}>
                  <td className={td}>
                    <Link href={`/purchase-orders/${r.id}`} className="font-medium text-indigo-600 hover:underline">{r.po_number}</Link>
                  </td>
                  <td className={td}>{r.vendor}</td>
                  <td className={`${tdR} font-semibold text-slate-900`}>{money(r.received_value)}</td>
                  <td className={tdR}>
                    {r.invoice_amount == null ? <span className="text-slate-300">—</span> : money(r.invoice_amount)}
                    {r.invoice_no && <p className="text-xs text-slate-400">{r.invoice_no}</p>}
                  </td>
                  <td className={tdR}>
                    {r.variance == null || r.state === 'matched' ? <span className="text-slate-300">—</span> : (
                      <span className={`font-semibold ${r.variance > 0 ? 'text-red-600' : 'text-blue-700'}`}>
                        {r.variance > 0 ? '+' : ''}{money(r.variance)}
                      </span>
                    )}
                  </td>
                  <td className={tdR}>{r.age_days}d</td>
                  <td className={td}>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${STATE[r.state].tone}`}>{STATE[r.state].label}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableCard>

        <p className="text-xs text-slate-400">
          Goods received are valued at purchase order prices. &quot;To accrue&quot; is what has arrived with no vendor invoice
          recorded — the balance of GR/IR Clearing to book at period end. Covers orders from the last two years.
        </p>
      </div>
    </div>
  )
}
