/**
 * The arithmetic behind two stock reports.
 *
 *   Slow-moving stock   — what is sitting on the shelf, for how long, and how
 *                         much money is tied up in it
 *   Stock adjustments   — every write-up and write-down in a period: what
 *                         shrinkage cost, and where it came from
 *
 * Pure: the routes supply the rows, and `today` is passed in.
 */

import { daysBetween } from '@/lib/procurement-reports'

const num = (v: unknown) => { const n = Number(v ?? 0); return Number.isFinite(n) ? n : 0 }
const round2 = (n: number) => Math.round(n * 100) / 100

// ── Slow-moving stock ─────────────────────────────────────────────────────────

export interface StockItem {
  product_id: string
  sku: string
  name: string
  category: string | null
  unit: string | null
  quantity: number
  value: number
  /** Most recent issue or sale, if it has ever been used. */
  last_used: string | null
  /** Most recent receipt. */
  last_received: string | null
}

export type AgeBucket = 'moving' | 'slowing' | 'slow' | 'stale' | 'dead'

/** Upper bound, in idle days, of each bucket; anything beyond the last is dead. */
export const AGE_BUCKETS: { bucket: AgeBucket; label: string; upTo: number }[] = [
  { bucket: 'moving',  label: 'Used in the last 30 days', upTo: 30 },
  { bucket: 'slowing', label: '31–90 days',               upTo: 90 },
  { bucket: 'slow',    label: '91–180 days',              upTo: 180 },
  { bucket: 'stale',   label: '181–365 days',             upTo: 365 },
  { bucket: 'dead',    label: 'Over a year, or never used', upTo: Infinity },
]

export interface SlowRow extends StockItem {
  /** Days since it was last used — or, if never used, since it last came in. Null when we know neither. */
  idle_days: number | null
  never_used: boolean
  bucket: AgeBucket
}

export function bucketFor(idleDays: number | null): AgeBucket {
  if (idleDays == null) return 'dead'
  return AGE_BUCKETS.find(b => idleDays <= b.upTo)!.bucket
}

export function slowMovingStock(items: StockItem[], today: string | Date): {
  rows: SlowRow[]
  summary: { bucket: AgeBucket; label: string; items: number; value: number; share_pct: number }[]
  total_value: number
} {
  const rows: SlowRow[] = []
  for (const it of items) {
    if (num(it.quantity) <= 0) continue   // nothing on the shelf, nothing tied up
    // Never used: age it from when it arrived, so last week's delivery isn't called dead.
    const since = it.last_used ?? it.last_received
    const idle = since ? Math.max(0, daysBetween(since, today)) : null
    rows.push({ ...it, value: round2(num(it.value)), idle_days: idle, never_used: !it.last_used, bucket: bucketFor(idle) })
  }

  const total = rows.reduce((s, r) => s + r.value, 0)
  const summary = AGE_BUCKETS.map(b => {
    const inB = rows.filter(r => r.bucket === b.bucket)
    const value = inB.reduce((s, r) => s + r.value, 0)
    return { bucket: b.bucket, label: b.label, items: inB.length, value: round2(value), share_pct: total > 0 ? Math.round((value / total) * 1000) / 10 : 0 }
  })

  return {
    // Longest idle first; unknown age sorts as the oldest. Ties: most money first.
    rows: rows.sort((a, b) => (b.idle_days ?? Infinity) - (a.idle_days ?? Infinity) || b.value - a.value),
    summary,
    total_value: round2(total),
  }
}

// ── Stock adjustments ─────────────────────────────────────────────────────────

export interface AdjustmentTx {
  id: string
  created_at: string
  /** Signed: negative is a write-down. */
  quantity: number
  unit_cost: number
  reference_no: string | null
  notes: string | null
  sku: string
  name: string
  unit: string | null
  location: string | null
  by: string | null
}

export interface AdjustmentRow extends AdjustmentTx {
  /** Signed value of the adjustment at the cost recorded on it. */
  value: number
  /** Where it came from, as far as the reference tells us. */
  source: 'Stock count' | 'Manual'
}

/** Stock count adjustments carry the count's number (CC-…) as their reference, and say so in their note. */
function sourceOf(tx: AdjustmentTx): AdjustmentRow['source'] {
  const text = `${tx.reference_no ?? ''} ${tx.notes ?? ''}`
  return /\b[CS]C-\d|stock count/i.test(text) ? 'Stock count' : 'Manual'
}

export function stockAdjustments(txs: AdjustmentTx[]): {
  rows: AdjustmentRow[]
  summary: { write_ups: number; write_downs: number; net: number; count: number; from_counts: number; manual: number }
} {
  const rows = txs
    .map(tx => ({ ...tx, value: round2(num(tx.quantity) * num(tx.unit_cost)), source: sourceOf(tx) }))
    .filter(r => r.quantity !== 0)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))

  const ups   = rows.filter(r => r.value > 0).reduce((s, r) => s + r.value, 0)
  const downs = rows.filter(r => r.value < 0).reduce((s, r) => s + r.value, 0)
  return {
    rows,
    summary: {
      write_ups:   round2(ups),
      write_downs: round2(downs),          // negative
      net:         round2(ups + downs),
      count:       rows.length,
      from_counts: rows.filter(r => r.source === 'Stock count').length,
      manual:      rows.filter(r => r.source === 'Manual').length,
    },
  }
}
