'use client'

import { Topbar } from '@/components/layout/topbar'
import { ExportButtons } from '@/components/reports/export-buttons'
import { DateRange, TableCard, useDateRange, th, thR, td, tdR, tr } from '@/components/reports/report-kit'
import { useApi } from '@/lib/use-api'
import { useMoney } from '@/lib/use-currency'
import type { VendorRow } from '@/lib/procurement-reports'

const pct = (v: number | null) => (v == null ? '—' : `${v}%`)
/** Green at 90% and up, amber to 70%, red below. */
const grade = (v: number | null) => v == null ? 'text-slate-300' : v >= 90 ? 'text-green-700' : v >= 70 ? 'text-amber-600' : 'text-red-600'

export default function VendorPerformanceReport() {
  const { money } = useMoney()
  const range = useDateRange(365)
  const { data, loading, error } = useApi<{ data: VendorRow[]; truncated?: boolean }>(`/api/reports/vendor-performance?${range.query}`)
  const rows = data?.data ?? []

  const buildSheets = () => [{
    name: 'Vendor performance',
    rows: [
      ['Vendor', 'Orders', 'Ordered value', 'Received value', 'On time %', 'On time', 'Late', 'Fill rate %', 'Avg lead days', 'Quoted lead days', 'Overdue now'],
      ...rows.map(r => [r.vendor, r.orders, r.ordered_value, r.received_value, r.on_time_pct ?? '', r.on_time, r.late, r.fill_rate_pct ?? '', r.avg_lead_days ?? '', r.quoted_lead_days ?? '', r.overdue_open]),
    ],
    notes: [`Vendor performance — orders raised ${range.from} to ${range.to}`],
  }]

  return (
    <div>
      <Topbar title="Vendor Performance" />
      <div className="p-6 space-y-4 max-w-6xl">
        <div className="flex flex-wrap items-end gap-3">
          <DateRange range={range} />
          <p className="text-xs text-slate-400 pb-2.5">Orders raised in this period</p>
          <div className="flex-1" />
          <ExportButtons filename="Vendor performance" build={buildSheets} disabled={rows.length === 0} />
        </div>

        <TableCard loading={loading} error={error} isEmpty={rows.length === 0} truncated={data?.truncated}
          empty="No purchase orders were placed in this period.">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className={th}>Vendor</th><th className={thR}>Orders</th><th className={thR}>Ordered</th>
                <th className={thR}>On time</th><th className={thR}>Fill rate</th><th className={thR}>Lead time</th><th className={thR}>Overdue now</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const slower = r.avg_lead_days != null && r.quoted_lead_days != null && r.avg_lead_days > r.quoted_lead_days
                return (
                  <tr key={r.vendor_id} className={tr}>
                    <td className={`${td} font-medium text-slate-900`}>{r.vendor}</td>
                    <td className={tdR}>{r.orders}</td>
                    <td className={tdR}>{money(r.ordered_value)}</td>
                    <td className={tdR}>
                      <span className={`font-semibold ${grade(r.on_time_pct)}`}>{pct(r.on_time_pct)}</span>
                      {r.on_time + r.late > 0 && <p className="text-xs text-slate-400">{r.on_time} of {r.on_time + r.late}</p>}
                    </td>
                    <td className={tdR}><span className={`font-semibold ${grade(r.fill_rate_pct)}`}>{pct(r.fill_rate_pct)}</span></td>
                    <td className={tdR}>
                      {r.avg_lead_days == null ? <span className="text-slate-300">—</span> : (
                        <span className={slower ? 'font-semibold text-amber-600' : ''}>{r.avg_lead_days} days</span>
                      )}
                      {r.quoted_lead_days != null && <p className="text-xs text-slate-400">quoted {r.quoted_lead_days}</p>}
                    </td>
                    <td className={tdR}>
                      {r.overdue_open > 0 ? <span className="font-semibold text-red-600">{r.overdue_open}</span> : <span className="text-slate-300">—</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </TableCard>

        <p className="text-xs text-slate-400">
          On time counts orders that arrived in full by their expected date, against all orders that are in or overdue;
          an order with no expected date can&apos;t be judged. Fill rate is how much of what was due actually arrived.
          Lead time runs from the order to the first delivery.
        </p>
      </div>
    </div>
  )
}
