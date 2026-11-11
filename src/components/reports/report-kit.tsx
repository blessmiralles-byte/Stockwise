'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

/**
 * The shared parts of a report screen: a headline figure, a date range, and
 * the table card with its loading, error and empty states. Keeps the
 * purchasing, payables and stock reports looking and behaving alike.
 */

const isoDay = (d: Date) => d.toISOString().slice(0, 10)

/** A from/to pair, starting at the last `days` days. */
export function useDateRange(days: number) {
  const [from, setFrom] = useState(() => isoDay(new Date(Date.now() - days * 86_400_000)))
  const [to, setTo]     = useState(() => isoDay(new Date()))
  return { from, to, setFrom, setTo, query: `from=${from}&to=${to}` }
}

export function DateRange({ range }: { range: ReturnType<typeof useDateRange> }) {
  const input = 'block mt-1 h-10 px-3 rounded-lg border border-slate-200 text-sm text-slate-700'
  return (
    <>
      <label className="text-xs text-slate-500">
        From
        <input type="date" value={range.from} max={range.to} onChange={e => range.setFrom(e.target.value)} className={input} />
      </label>
      <label className="text-xs text-slate-500">
        To
        <input type="date" value={range.to} min={range.from} onChange={e => range.setTo(e.target.value)} className={input} />
      </label>
    </>
  )
}

export function Stat({ label, value, hint, tone = 'slate' }: {
  label: string
  value: React.ReactNode
  hint?: React.ReactNode
  tone?: 'slate' | 'red' | 'amber' | 'green' | 'indigo'
}) {
  const color = {
    slate: 'text-slate-900', red: 'text-red-600', amber: 'text-amber-600', green: 'text-green-700', indigo: 'text-indigo-700',
  }[tone]
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</p>
        <p className={cn('text-2xl font-bold mt-1 tabular-nums', color)}>{value}</p>
        {hint && <p className="text-xs text-slate-400 mt-0.5">{hint}</p>}
      </CardContent>
    </Card>
  )
}

export function StatGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{children}</div>
}

/** The table card: skeleton while loading, the error if any, `empty` when there are no rows. */
export function TableCard({ loading, error, isEmpty, empty, truncated, children }: {
  loading: boolean
  error?: string | null
  isEmpty: boolean
  empty: React.ReactNode
  /** The server stopped at its row ceiling — say so instead of presenting a partial report as whole. */
  truncated?: boolean
  children: React.ReactNode
}) {
  return (
    <>
      {truncated && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          There is more history than this report can read in one pass, so it is incomplete. Narrow the dates.
        </p>
      )}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4 space-y-2">{[1, 2, 3, 4].map(i => <div key={i} className="h-12 bg-slate-100 rounded-lg animate-pulse" />)}</div>
          ) : error ? (
            <p className="text-center py-10 text-sm text-red-600">{error}</p>
          ) : isEmpty ? (
            <div className="text-center py-14 text-sm text-slate-400">{empty}</div>
          ) : (
            <div className="overflow-x-auto">{children}</div>
          )}
        </CardContent>
      </Card>
    </>
  )
}

export const th  = 'px-4 py-3 font-medium text-left text-slate-500'
export const thR = 'px-4 py-3 font-medium text-right text-slate-500'
export const td  = 'px-4 py-3 text-slate-700'
export const tdR = 'px-4 py-3 text-right tabular-nums text-slate-700'
export const tr  = 'border-b border-slate-50 hover:bg-slate-50/50 align-top'
