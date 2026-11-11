'use client'

import { useState } from 'react'
import { Topbar } from '@/components/layout/topbar'
import { ExportButtons } from '@/components/reports/export-buttons'
import { DateRange, Stat, StatGrid, TableCard, useDateRange, th, thR, td, tdR, tr } from '@/components/reports/report-kit'
import { useApi } from '@/lib/use-api'
import { useMoney } from '@/lib/use-currency'
import type { SpendSummary, SpendGroup } from '@/lib/procurement-reports'

type View = 'vendor' | 'category' | 'item'
const VIEWS: { id: View; label: string }[] = [
  { id: 'vendor', label: 'By vendor' }, { id: 'category', label: 'By category' }, { id: 'item', label: 'By item' },
]

function GroupTable({ rows, heading, money }: { rows: SpendGroup[]; heading: string; money: (n: number) => string }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-slate-100">
          <th className={th}>{heading}</th><th className={thR}>Receipts</th><th className={thR}>Spend</th><th className={`${th} w-1/3`}>Share</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(g => (
          <tr key={g.name} className={tr}>
            <td className={`${td} font-medium text-slate-900`}>{g.name}</td>
            <td className={tdR}>{g.receipts}</td>
            <td className={`${tdR} font-semibold text-slate-900`}>{money(g.value)}</td>
            <td className={td}>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${Math.min(100, g.share_pct)}%` }} />
                </div>
                <span className="text-xs tabular-nums text-slate-500 w-12 text-right">{g.share_pct}%</span>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default function PurchaseSpendReport() {
  const { money } = useMoney()
  const range = useDateRange(90)
  const [view, setView] = useState<View>('vendor')
  const { data, loading, error } = useApi<{ data: SpendSummary; truncated?: boolean }>(`/api/reports/purchase-spend?${range.query}`)
  const s = data?.data
  const risers = (s?.items ?? []).filter(i => (i.price_change_pct ?? 0) > 0).length

  const buildSheets = () => !s ? [] : [
    { name: 'By vendor',   rows: [['Vendor', 'Receipts', 'Spend', 'Share %'],   ...s.by_vendor.map(g => [g.name, g.receipts, g.value, g.share_pct])],
      notes: [`Purchase spend — goods received ${range.from} to ${range.to}`] },
    { name: 'By category', rows: [['Category', 'Receipts', 'Spend', 'Share %'], ...s.by_category.map(g => [g.name, g.receipts, g.value, g.share_pct])] },
    { name: 'By item',     rows: [['Code', 'Item', 'Quantity', 'Spend', 'Avg cost', 'First cost', 'Last cost', 'Price change %'],
      ...s.items.map(i => [i.sku, i.name, i.quantity, i.value, i.avg_cost, i.first_cost, i.last_cost, i.price_change_pct ?? ''])] },
  ]

  return (
    <div>
      <Topbar title="Purchase Spend" />
      <div className="p-6 space-y-4 max-w-5xl">
        <div className="flex flex-wrap items-end gap-3">
          <DateRange range={range} />
          <div className="flex-1" />
          <ExportButtons filename="Purchase spend" build={buildSheets} disabled={!s || s.receipts === 0} />
        </div>

        <StatGrid>
          <Stat label="Received in period" value={money(s?.total ?? 0)} tone="indigo" />
          <Stat label="Goods receipts" value={s?.receipts ?? 0} />
          <Stat label="Vendors" value={s?.by_vendor.length ?? 0} hint={s?.by_vendor[0] ? `Largest: ${s.by_vendor[0].name}` : undefined} />
          <Stat label="Prices that rose" value={risers} tone={risers ? 'amber' : 'slate'} hint="Last receipt against the first" />
        </StatGrid>

        <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden text-sm">
          {VIEWS.map(v => (
            <button key={v.id} onClick={() => setView(v.id)}
              className={`px-3 py-1.5 transition-colors ${view === v.id ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
              {v.label}
            </button>
          ))}
        </div>

        <TableCard loading={loading} error={error} isEmpty={!s || s.receipts === 0} truncated={data?.truncated}
          empty="Nothing was received in this period.">
          {s && view === 'vendor'   && <GroupTable rows={s.by_vendor}   heading="Vendor"   money={money} />}
          {s && view === 'category' && <GroupTable rows={s.by_category} heading="Category" money={money} />}
          {s && view === 'item' && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className={th}>Item</th><th className={thR}>Quantity</th><th className={thR}>Spend</th>
                  <th className={thR}>Avg cost</th><th className={thR}>First → last</th><th className={thR}>Change</th>
                </tr>
              </thead>
              <tbody>
                {s.items.map(i => (
                  <tr key={i.product_id} className={tr}>
                    <td className={td}>
                      <p className="font-medium text-slate-900">{i.name}</p>
                      <p className="text-xs font-mono text-slate-400">{i.sku}</p>
                    </td>
                    <td className={tdR}>{i.quantity.toLocaleString()}</td>
                    <td className={`${tdR} font-semibold text-slate-900`}>{money(i.value)}</td>
                    <td className={tdR}>{money(i.avg_cost)}</td>
                    <td className={tdR}>{money(i.first_cost)} → {money(i.last_cost)}</td>
                    <td className={tdR}>
                      {i.price_change_pct == null || i.price_change_pct === 0 ? <span className="text-slate-300">—</span> : (
                        <span className={`font-semibold ${i.price_change_pct > 0 ? 'text-red-600' : 'text-green-700'}`}>
                          {i.price_change_pct > 0 ? '+' : ''}{i.price_change_pct}%
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </TableCard>

        <p className="text-xs text-slate-400">
          Built from goods receipts at the cost they came in at, so this is spend that happened, not what was ordered.
          A receipt with no purchase order is shown under the item&apos;s usual vendor.
        </p>
      </div>
    </div>
  )
}
