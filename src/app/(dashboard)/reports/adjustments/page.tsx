'use client'

import { useMemo, useState } from 'react'
import { Topbar } from '@/components/layout/topbar'
import { ExportButtons } from '@/components/reports/export-buttons'
import { DateRange, Stat, StatGrid, TableCard, useDateRange, th, thR, td, tdR, tr } from '@/components/reports/report-kit'
import { useApi } from '@/lib/use-api'
import { useMoney } from '@/lib/use-currency'
import { formatDate } from '@/lib/utils'
import type { AdjustmentRow } from '@/lib/inventory-reports'

type Filter = 'all' | 'down' | 'up'

export default function StockAdjustmentsReport() {
  const { money } = useMoney()
  const range = useDateRange(90)
  const [filter, setFilter] = useState<Filter>('all')
  const { data, loading, error } = useApi<{ rows: AdjustmentRow[]; summary: any; truncated?: boolean }>(`/api/reports/adjustments?${range.query}`)
  const all = data?.rows ?? []
  const s = data?.summary ?? {}
  const rows = useMemo(() => all.filter(r => filter === 'all' ? true : filter === 'down' ? r.value < 0 || r.quantity < 0 : r.quantity > 0), [all, filter])

  const buildSheets = () => [{
    name: 'Stock adjustments',
    rows: [
      ['Date', 'Code', 'Item', 'Location', 'Quantity', 'Unit', 'Unit cost', 'Value', 'Source', 'Reference', 'Notes', 'Posted by'],
      ...rows.map(r => [r.created_at.slice(0, 10), r.sku, r.name, r.location ?? '', r.quantity, r.unit ?? '', r.unit_cost, r.value, r.source, r.reference_no ?? '', r.notes ?? '', r.by ?? '']),
    ],
    notes: [`Stock adjustments ${range.from} to ${range.to} — write-downs ${s.write_downs ?? 0}, write-ups ${s.write_ups ?? 0}, net ${s.net ?? 0}`],
  }]

  return (
    <div>
      <Topbar title="Stock Adjustments" />
      <div className="p-6 space-y-4 max-w-6xl">
        <div className="flex flex-wrap items-end gap-3">
          <DateRange range={range} />
          <div className="flex-1" />
          <ExportButtons filename="Stock adjustments" build={buildSheets} disabled={rows.length === 0} />
        </div>

        <StatGrid>
          <Stat label="Written down" value={money(Math.abs(s.write_downs ?? 0))} tone={s.write_downs ? 'red' : 'slate'} hint="Shrinkage, damage, miscounts" />
          <Stat label="Written up" value={money(s.write_ups ?? 0)} tone="green" />
          <Stat label="Net effect on stock value" value={money(s.net ?? 0)} tone={(s.net ?? 0) < 0 ? 'red' : 'slate'} />
          <Stat label="Adjustments" value={s.count ?? 0} hint={`${s.from_counts ?? 0} from stock counts · ${s.manual ?? 0} manual`} />
        </StatGrid>

        <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden text-sm">
          {([['all', 'All'], ['down', 'Write-downs'], ['up', 'Write-ups']] as const).map(([id, text]) => (
            <button key={id} onClick={() => setFilter(id)}
              className={`px-3 py-1.5 transition-colors ${filter === id ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
              {text}
            </button>
          ))}
        </div>

        <TableCard loading={loading} error={error} isEmpty={rows.length === 0} truncated={data?.truncated}
          empty={all.length === 0 ? 'No stock adjustments in this period.' : 'None of that kind in this period.'}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className={th}>Date</th><th className={th}>Item</th><th className={thR}>Quantity</th>
                <th className={thR}>Value</th><th className={th}>Source</th><th className={th}>Posted by</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className={tr}>
                  <td className={`${td} whitespace-nowrap`}>{formatDate(r.created_at)}</td>
                  <td className={td}>
                    <p className="font-medium text-slate-900">{r.name}</p>
                    <p className="text-xs text-slate-400"><span className="font-mono">{r.sku}</span>{r.location ? ` · ${r.location}` : ''}</p>
                  </td>
                  <td className={`${tdR} font-semibold ${r.quantity < 0 ? 'text-red-600' : 'text-green-700'}`}>
                    {r.quantity > 0 ? '+' : ''}{r.quantity.toLocaleString()} <span className="text-xs font-normal text-slate-400">{r.unit}</span>
                  </td>
                  <td className={`${tdR} font-semibold ${r.value < 0 ? 'text-red-600' : 'text-green-700'}`}>
                    {r.value > 0 ? '+' : ''}{money(r.value)}
                  </td>
                  <td className={td}>
                    {r.source}
                    {(r.reference_no || r.notes) && <p className="text-xs text-slate-400">{[r.reference_no, r.notes].filter(Boolean).join(' · ')}</p>}
                  </td>
                  <td className={td}>{r.by ?? <span className="text-slate-300">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableCard>
      </div>
    </div>
  )
}
