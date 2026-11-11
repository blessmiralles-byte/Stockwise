'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Topbar } from '@/components/layout/topbar'
import { ExportButtons } from '@/components/reports/export-buttons'
import { Stat, StatGrid, TableCard, th, thR, td, tdR, tr } from '@/components/reports/report-kit'
import { useApi } from '@/lib/use-api'
import { useMoney } from '@/lib/use-currency'
import { formatDate } from '@/lib/utils'
import type { OpenPoRow } from '@/lib/procurement-reports'

const STATUS: Record<string, string> = { approved: 'Approved, not sent', sent: 'Sent', partial: 'Part received' }

export default function OpenPurchaseOrdersReport() {
  const { money } = useMoney()
  const { data, loading, error } = useApi<{ data: OpenPoRow[]; summary: any; truncated?: boolean }>('/api/reports/open-pos')
  const [lateOnly, setLateOnly] = useState(false)
  const all = data?.data ?? []
  const rows = useMemo(() => (lateOnly ? all.filter(r => r.days_late > 0) : all), [all, lateOnly])
  const s = data?.summary ?? {}

  const buildSheets = () => [
    {
      name: 'Open orders',
      rows: [
        ['PO', 'Vendor', 'Status', 'Ordered', 'Expected', 'Days late', 'Ordered value', 'Outstanding value', 'Received %'],
        ...rows.map(r => [r.po_number, r.vendor, STATUS[r.status] ?? r.status, r.ordered_on, r.expected_date ?? '', r.days_late, r.ordered_value, r.outstanding_value, r.received_pct]),
      ],
      notes: [`Open purchase orders — ${rows.length} orders, ${s.late ?? 0} late`],
    },
    {
      name: 'Outstanding lines',
      rows: [
        ['PO', 'Vendor', 'Expected', 'Code', 'Item', 'Unit', 'Ordered', 'Received', 'Outstanding', 'Unit cost', 'Outstanding value'],
        ...rows.flatMap(r => r.lines.map(l => [r.po_number, r.vendor, r.expected_date ?? '', l.sku, l.name, l.unit, l.ordered, l.received, l.outstanding, l.unit_cost, Math.round(l.outstanding * l.unit_cost * 100) / 100])),
      ],
    },
  ]

  return (
    <div>
      <Topbar title="Open Purchase Orders" />
      <div className="p-6 space-y-4 max-w-6xl">
        <StatGrid>
          <Stat label="Open orders" value={s.orders ?? 0} />
          <Stat label="Still to arrive" value={money(s.outstanding_value ?? 0)} tone="indigo" />
          <Stat label="Late" value={s.late ?? 0} tone={s.late ? 'red' : 'slate'} hint="Past the expected date" />
          <Stat label="Late value" value={money(s.late_value ?? 0)} tone={s.late ? 'red' : 'slate'} />
        </StatGrid>

        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={lateOnly} onChange={e => setLateOnly(e.target.checked)} className="rounded border-slate-300" />
            Late only
          </label>
          <div className="flex-1" />
          <ExportButtons filename="Open purchase orders" build={buildSheets} disabled={rows.length === 0} />
        </div>

        <TableCard loading={loading} error={error} isEmpty={rows.length === 0} truncated={data?.truncated}
          empty={all.length === 0 ? 'Nothing on order — every purchase order is fully received.' : 'No late orders.'}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className={th}>PO</th><th className={th}>Vendor</th><th className={th}>Expected</th>
                <th className={thR}>Outstanding</th><th className={thR}>Received</th><th className={th}>Waiting on</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className={tr}>
                  <td className={td}>
                    <Link href={`/purchase-orders/${r.id}`} className="font-medium text-indigo-600 hover:underline">{r.po_number}</Link>
                    <p className="text-xs text-slate-400">{STATUS[r.status] ?? r.status} · ordered {formatDate(r.ordered_on)}</p>
                  </td>
                  <td className={td}>{r.vendor}</td>
                  <td className={td}>
                    {r.expected_date ? formatDate(r.expected_date) : <span className="text-slate-300">No date</span>}
                    {r.days_late > 0 && <p className="text-xs font-medium text-red-600">{r.days_late} day{r.days_late > 1 ? 's' : ''} late</p>}
                  </td>
                  <td className={tdR}>
                    <span className="font-semibold text-slate-900">{money(r.outstanding_value)}</span>
                    <p className="text-xs text-slate-400">of {money(r.ordered_value)}</p>
                  </td>
                  <td className={tdR}>{r.received_pct}%</td>
                  <td className={td}>
                    <ul className="text-xs text-slate-500 space-y-0.5">
                      {r.lines.slice(0, 3).map((l, i) => <li key={i}>{l.outstanding.toLocaleString()} {l.unit} · {l.name}</li>)}
                      {r.lines.length > 3 && <li className="text-slate-400">and {r.lines.length - 3} more</li>}
                    </ul>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableCard>
      </div>
    </div>
  )
}
