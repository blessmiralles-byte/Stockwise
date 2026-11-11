'use client'

import { useMemo, useState } from 'react'
import { Topbar } from '@/components/layout/topbar'
import { ExportButtons } from '@/components/reports/export-buttons'
import { TableCard, th, thR, td, tdR, tr } from '@/components/reports/report-kit'
import { Card, CardContent } from '@/components/ui/card'
import { useApi } from '@/lib/use-api'
import { useMoney } from '@/lib/use-currency'
import { formatDate, cn } from '@/lib/utils'
import type { SlowRow, AgeBucket } from '@/lib/inventory-reports'

const TONE: Record<AgeBucket, string> = {
  moving: 'text-green-700', slowing: 'text-slate-700', slow: 'text-amber-600', stale: 'text-orange-600', dead: 'text-red-600',
}

type Summary = { bucket: AgeBucket; label: string; items: number; value: number; share_pct: number }

export default function SlowMovingReport() {
  const { money } = useMoney()
  const { data, loading, error } = useApi<{ data: SlowRow[]; summary: Summary[]; total_value: number; truncated?: boolean }>('/api/reports/slow-moving')
  // Open on what needs attention: anything idle more than 90 days.
  const [bucket, setBucket] = useState<AgeBucket | 'idle' | 'all'>('idle')
  const all = data?.data ?? []
  const summary = data?.summary ?? []

  const rows = useMemo(() => all.filter(r =>
    bucket === 'all' ? true : bucket === 'idle' ? ['slow', 'stale', 'dead'].includes(r.bucket) : r.bucket === bucket,
  ), [all, bucket])
  const label = (b: AgeBucket) => summary.find(s => s.bucket === b)?.label ?? b
  const idleValue = summary.filter(s => ['slow', 'stale', 'dead'].includes(s.bucket)).reduce((t, s) => t + s.value, 0)

  const buildSheets = () => [{
    name: 'Slow-moving stock',
    rows: [
      ['Code', 'Item', 'Category', 'On hand', 'Unit', 'Value', 'Last used', 'Last received', 'Days idle', 'Age band'],
      ...rows.map(r => [r.sku, r.name, r.category ?? '', r.quantity, r.unit ?? '', r.value,
        r.last_used ? r.last_used.slice(0, 10) : 'Never', r.last_received ? r.last_received.slice(0, 10) : '', r.idle_days ?? '', label(r.bucket)]),
    ],
    notes: [`Slow-moving stock — ${rows.length} items shown; stock on hand ${data?.total_value ?? 0}`],
  }]

  return (
    <div>
      <Topbar title="Slow-Moving Stock" />
      <div className="p-6 space-y-4 max-w-6xl">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {summary.map(s => (
            <button key={s.bucket} onClick={() => setBucket(bucket === s.bucket ? 'all' : s.bucket)} className="text-left">
              <Card className={cn('transition-shadow hover:shadow-md', bucket === s.bucket && 'ring-2 ring-indigo-400')}>
                <CardContent className="p-4">
                  <p className="text-xs font-medium text-slate-500">{s.label}</p>
                  <p className={cn('text-xl font-bold mt-1 tabular-nums', TONE[s.bucket])}>{money(s.value)}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{s.items} item{s.items !== 1 ? 's' : ''} · {s.share_pct}%</p>
                </CardContent>
              </Card>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden text-sm">
            {([['idle', 'Idle over 90 days'], ['all', 'Everything in stock']] as const).map(([id, text]) => (
              <button key={id} onClick={() => setBucket(id)}
                className={`px-3 py-1.5 transition-colors ${bucket === id ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
                {text}
              </button>
            ))}
          </div>
          {idleValue > 0 && <p className="text-sm text-slate-500"><strong className="text-slate-800">{money(idleValue)}</strong> tied up in stock idle over 90 days</p>}
          <div className="flex-1" />
          <ExportButtons filename="Slow-moving stock" build={buildSheets} disabled={rows.length === 0} />
        </div>

        <TableCard loading={loading} error={error} isEmpty={rows.length === 0} truncated={data?.truncated}
          empty={all.length === 0 ? 'Nothing in stock.' : 'Nothing in this age band — everything on the shelf has moved recently.'}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className={th}>Item</th><th className={thR}>On hand</th><th className={thR}>Value</th>
                <th className={th}>Last used</th><th className={thR}>Idle</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.product_id} className={tr}>
                  <td className={td}>
                    <p className="font-medium text-slate-900">{r.name}</p>
                    <p className="text-xs text-slate-400"><span className="font-mono">{r.sku}</span>{r.category ? ` · ${r.category}` : ''}</p>
                  </td>
                  <td className={tdR}>{r.quantity.toLocaleString()} <span className="text-xs text-slate-400">{r.unit}</span></td>
                  <td className={`${tdR} font-semibold text-slate-900`}>{money(r.value)}</td>
                  <td className={td}>
                    {r.last_used ? formatDate(r.last_used) : <span className="text-slate-400">Never used</span>}
                    {r.never_used && r.last_received && <p className="text-xs text-slate-400">received {formatDate(r.last_received)}</p>}
                  </td>
                  <td className={tdR}>
                    <span className={cn('font-semibold', TONE[r.bucket])}>{r.idle_days == null ? 'Over 2 years' : `${r.idle_days}d`}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableCard>

        <p className="text-xs text-slate-400">
          Idle days count from the last time an item was issued or sold. An item never used is aged from its last
          delivery, so new stock isn&apos;t called dead. Value is quantity on hand at average cost.
        </p>
      </div>
    </div>
  )
}
