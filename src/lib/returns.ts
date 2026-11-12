/**
 * The rules for the two kinds of return.
 *
 *   From a job   Unused material comes back into stock. It can only come back
 *                from somewhere it was issued to, no more than is still out
 *                there, and at the cost it went out at — so the job is
 *                credited exactly what it was charged.
 *
 *   To a vendor  Received goods go back. If they were received against a
 *                purchase order, that order has to reflect it: either the
 *                vendor is sending a replacement (the order is open again for
 *                that quantity) or giving a credit (the order shrinks by it).
 *
 * Pure: the route supplies the rows.
 */

import { JOB_RETURN } from '@/lib/stock-direction'

const num = (v: unknown) => { const n = Number(v ?? 0); return Number.isFinite(n) ? n : 0 }
const round4 = (n: number) => Math.round(n * 10000) / 10000

// ── From a job ────────────────────────────────────────────────────────────────

export interface JobMovement {
  transaction_type: string
  quantity: number
  unit_cost: number
  job_code: string | null
  cost_center_id: string | null
}

export interface JobBalance {
  job_code: string | null
  cost_center_id: string | null
  issued_qty: number
  returned_qty: number
  /** Still out on the job: what can come back. */
  net_qty: number
  /** What each remaining unit was charged to the job at. */
  unit_cost: number
}

const keyOf = (job: string | null | undefined, cc: string | null | undefined) => `${job ?? ''}|${cc ?? ''}`

/** For one item: where it has been issued to, and how much of it is still there. */
export function jobBalances(rows: JobMovement[]): JobBalance[] {
  const map = new Map<string, { job: string | null; cc: string | null; iq: number; rq: number; ic: number; rc: number }>()
  for (const r of rows) {
    const isReturn = r.transaction_type === JOB_RETURN
    if (!isReturn && r.transaction_type !== 'consumption' && r.transaction_type !== 'sale') continue
    const k = keyOf(r.job_code, r.cost_center_id)
    const b = map.get(k) ?? { job: r.job_code ?? null, cc: r.cost_center_id ?? null, iq: 0, rq: 0, ic: 0, rc: 0 }
    const q = Math.abs(num(r.quantity)), c = q * num(r.unit_cost)
    if (isReturn) { b.rq += q; b.rc += c } else { b.iq += q; b.ic += c }
    map.set(k, b)
  }
  return [...map.values()]
    .map(b => {
      const net = b.iq - b.rq
      return {
        job_code: b.job, cost_center_id: b.cc,
        issued_qty: b.iq, returned_qty: b.rq, net_qty: Math.max(0, net),
        unit_cost: net > 0 ? round4(Math.max(0, b.ic - b.rc) / net) : 0,
      }
    })
    .filter(b => b.issued_qty > 0)
    .sort((a, b) => b.net_qty - a.net_qty)
}

export type ReturnPlan =
  | { ok: true; unit_cost: number }
  | { ok: false; error: string }

export function planJobReturn(
  rows: JobMovement[],
  from: { job_code: string | null; cost_center_id: string | null },
  quantity: number,
): ReturnPlan {
  const where = from.job_code ? `job ${from.job_code}` : from.cost_center_id ? 'that cost center' : 'general use'
  const bal = jobBalances(rows).find(b => keyOf(b.job_code, b.cost_center_id) === keyOf(from.job_code, from.cost_center_id))
  if (!bal) return { ok: false, error: `This item was never issued to ${where}, so there is nothing to return from it.` }
  if (bal.net_qty <= 0) return { ok: false, error: `Everything issued to ${where} has already been returned.` }
  if (quantity > bal.net_qty) {
    return { ok: false, error: `Only ${bal.net_qty} can be returned from ${where}: ${bal.issued_qty} issued, ${bal.returned_qty} already returned.` }
  }
  return { ok: true, unit_cost: bal.unit_cost }
}

// ── To a vendor ───────────────────────────────────────────────────────────────

/** replacement: the vendor will send more. credit: the vendor will refund or credit it. */
export type VendorOutcome = 'replacement' | 'credit'

export interface PoLineQty { quantity_ordered: number; quantity_received: number; unit_cost: number }

export type VendorPlan =
  | { ok: true; unit_cost: number; line: { quantity_ordered: number; quantity_received: number } }
  | { ok: false; error: string }

export function planVendorReturn(line: PoLineQty, quantity: number, outcome: VendorOutcome): VendorPlan {
  const received = num(line.quantity_received)
  if (received <= 0) return { ok: false, error: 'Nothing has been received on that purchase order line, so there is nothing to send back.' }
  if (quantity > received) return { ok: false, error: `Only ${received} were received on that purchase order, so no more than that can go back.` }
  return {
    ok: true,
    unit_cost: num(line.unit_cost),
    line: {
      quantity_received: received - quantity,
      // A credit means the vendor is not sending these again: the order shrinks.
      quantity_ordered: outcome === 'credit' ? Math.max(0, num(line.quantity_ordered) - quantity) : num(line.quantity_ordered),
    },
  }
}

/** Where a purchase order stands once a return has changed its lines. */
export function poStatusAfterReturn(lines: { quantity_ordered: number; quantity_received: number }[]): 'sent' | 'partial' | 'received' {
  const ordered = lines.reduce((s, l) => s + num(l.quantity_ordered), 0)
  const received = lines.reduce((s, l) => s + num(l.quantity_received), 0)
  if (received <= 0) return ordered > 0 ? 'sent' : 'received'
  return received >= ordered ? 'received' : 'partial'
}
