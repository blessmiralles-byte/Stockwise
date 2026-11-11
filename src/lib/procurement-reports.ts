/**
 * The arithmetic behind the purchasing and payables reports.
 *
 *   Open purchase orders   — what is still to arrive, and what is late
 *   Vendor performance     — who delivers on time and in full
 *   Purchase spend         — where the money went, and whose prices moved
 *   Received not invoiced  — goods in, bill not yet in (the GR/IR accrual),
 *                            and invoices that don't match what arrived
 *
 * Pure: the routes supply the rows. Everything here is given `today` instead
 * of reading the clock, so a test (or a report run for last month) means the
 * day it says.
 */

const DAY_MS = 86_400_000
const dayOf = (d: string | Date) =>
  Date.parse((typeof d === 'string' ? d : d.toISOString()).slice(0, 10) + 'T00:00:00Z')
/** Whole days from `from` to `to`; negative when `to` is earlier. */
export const daysBetween = (from: string | Date, to: string | Date) =>
  Math.round((dayOf(to) - dayOf(from)) / DAY_MS)

const num = (v: unknown) => { const n = Number(v ?? 0); return Number.isFinite(n) ? n : 0 }
const round2 = (n: number) => Math.round(n * 100) / 100

export interface PoLine {
  product_id?: string | null
  quantity_ordered: number
  quantity_received: number
  unit_cost: number
  product?: { sku?: string | null; name?: string | null; unit_of_measure?: string | null } | null
}

export interface Po {
  id: string
  po_number: string
  status: string
  created_at: string
  order_date?: string | null
  expected_date?: string | null
  supplier?: { id: string; name: string; lead_time_days?: number | null } | null
  lines?: PoLine[] | null
  supplier_invoice_no?: string | null
  supplier_invoice_date?: string | null
  supplier_invoice_amount?: number | null
}

/** When goods for a PO first and last arrived. */
export interface Receipt { first: string; last: string }

const orderedOn = (po: Po) => po.order_date || po.created_at

/** Statuses of an order that has been placed and isn't finished. */
const AWAITING = new Set(['approved', 'sent', 'partial'])

// ── Open purchase orders ──────────────────────────────────────────────────────

export interface OpenPoRow {
  id: string
  po_number: string
  status: string
  vendor: string
  ordered_on: string
  expected_date: string | null
  days_open: number
  /** Days past the expected date; 0 when not late or no date was given. */
  days_late: number
  ordered_value: number
  outstanding_value: number
  outstanding_qty: number
  received_pct: number
  lines: { sku: string; name: string; unit: string; ordered: number; received: number; outstanding: number; unit_cost: number }[]
}

export function openPurchaseOrders(pos: Po[], today: string | Date): OpenPoRow[] {
  const rows: OpenPoRow[] = []
  for (const po of pos) {
    if (!AWAITING.has(po.status)) continue
    const lines = (po.lines ?? []).map(l => {
      const ordered = num(l.quantity_ordered), received = num(l.quantity_received)
      return {
        sku: l.product?.sku ?? '', name: l.product?.name ?? '', unit: l.product?.unit_of_measure ?? '',
        ordered, received,
        // Over-receipts don't make the outstanding figure negative.
        outstanding: Math.max(0, ordered - received),
        unit_cost: num(l.unit_cost),
      }
    })
    const orderedQty   = lines.reduce((s, l) => s + l.ordered, 0)
    const outstanding  = lines.reduce((s, l) => s + l.outstanding, 0)
    const orderedValue = lines.reduce((s, l) => s + l.ordered * l.unit_cost, 0)
    const outValue     = lines.reduce((s, l) => s + l.outstanding * l.unit_cost, 0)
    if (outstanding <= 0) continue   // everything is in; just not closed yet

    rows.push({
      id: po.id, po_number: po.po_number, status: po.status,
      vendor: po.supplier?.name ?? 'No vendor',
      ordered_on: orderedOn(po).slice(0, 10),
      expected_date: po.expected_date ? po.expected_date.slice(0, 10) : null,
      days_open: Math.max(0, daysBetween(orderedOn(po), today)),
      days_late: po.expected_date ? Math.max(0, daysBetween(po.expected_date, today)) : 0,
      ordered_value: round2(orderedValue),
      outstanding_value: round2(outValue),
      outstanding_qty: outstanding,
      received_pct: orderedQty > 0 ? Math.round(((orderedQty - outstanding) / orderedQty) * 100) : 0,
      lines: lines.filter(l => l.outstanding > 0),
    })
  }
  // Latest first, then the longest-waiting.
  return rows.sort((a, b) => b.days_late - a.days_late || b.days_open - a.days_open)
}

// ── Vendor performance ────────────────────────────────────────────────────────

export interface VendorRow {
  vendor_id: string
  vendor: string
  orders: number
  ordered_value: number
  received_value: number
  /** Of what was ordered and is due, how much arrived. Null with nothing due. */
  fill_rate_pct: number | null
  /** Of orders that are in or overdue, how many arrived by their date. Null without dated orders. */
  on_time_pct: number | null
  on_time: number
  late: number
  /** Order to first delivery, in days. */
  avg_lead_days: number | null
  quoted_lead_days: number | null
  /** Placed, past their date, still not fully in. */
  overdue_open: number
}

/** Orders that count toward a vendor's record: placed with them, not cancelled or still a draft. */
const PLACED = new Set(['approved', 'sent', 'partial', 'received'])

export function vendorPerformance(
  pos: Po[],
  receipts: Map<string, Receipt>,
  today: string | Date,
): VendorRow[] {
  type Acc = VendorRow & { _dueQty: number; _dueGot: number; _leadSum: number; _leadN: number }
  const byVendor = new Map<string, Acc>()

  for (const po of pos) {
    if (!PLACED.has(po.status) || !po.supplier) continue
    const v = byVendor.get(po.supplier.id) ?? {
      vendor_id: po.supplier.id, vendor: po.supplier.name,
      orders: 0, ordered_value: 0, received_value: 0,
      fill_rate_pct: null, on_time_pct: null, on_time: 0, late: 0,
      avg_lead_days: null, quoted_lead_days: po.supplier.lead_time_days ?? null, overdue_open: 0,
      _dueQty: 0, _dueGot: 0, _leadSum: 0, _leadN: 0,
    }
    byVendor.set(po.supplier.id, v)

    const lines   = po.lines ?? []
    const ordered = lines.reduce((s, l) => s + num(l.quantity_ordered), 0)
    // Capped per line: an over-delivery on one item doesn't hide a short one.
    const got     = lines.reduce((s, l) => s + Math.min(num(l.quantity_received), num(l.quantity_ordered)), 0)
    const complete = ordered > 0 && got >= ordered
    const isDue    = complete || (!!po.expected_date && daysBetween(po.expected_date, today) > 0)

    v.orders++
    v.ordered_value  += lines.reduce((s, l) => s + num(l.quantity_ordered)  * num(l.unit_cost), 0)
    v.received_value += lines.reduce((s, l) => s + num(l.quantity_received) * num(l.unit_cost), 0)

    // Fill rate only judges orders that should have arrived by now.
    if (isDue) { v._dueQty += ordered; v._dueGot += got }

    const r = receipts.get(po.id)
    if (r) { v._leadSum += Math.max(0, daysBetween(orderedOn(po), r.first)); v._leadN++ }

    // On time needs a promised date to be measured against.
    if (po.expected_date) {
      if (complete) {
        // Without a recorded receipt date we can't call it late.
        const arrived = r?.last
        if (arrived && daysBetween(po.expected_date, arrived) > 0) v.late++
        else v.on_time++
      } else if (daysBetween(po.expected_date, today) > 0) {
        v.late++
        v.overdue_open++
      }
    }
  }

  return [...byVendor.values()].map(({ _dueQty, _dueGot, _leadSum, _leadN, ...v }) => ({
    ...v,
    ordered_value:  round2(v.ordered_value),
    received_value: round2(v.received_value),
    fill_rate_pct:  _dueQty > 0 ? Math.round((_dueGot / _dueQty) * 100) : null,
    on_time_pct:    v.on_time + v.late > 0 ? Math.round((v.on_time / (v.on_time + v.late)) * 100) : null,
    avg_lead_days:  _leadN > 0 ? Math.round((_leadSum / _leadN) * 10) / 10 : null,
  })).sort((a, b) => b.ordered_value - a.ordered_value)
}

// ── Purchase spend ────────────────────────────────────────────────────────────

/** One goods receipt line: what came in, at what cost, from whom. */
export interface ReceiptLine {
  created_at: string
  product_id: string
  sku: string
  name: string
  category: string | null
  vendor: string | null
  quantity: number
  unit_cost: number
}

export interface SpendGroup { name: string; value: number; receipts: number; share_pct: number }

export interface SpendItem {
  product_id: string
  sku: string
  name: string
  quantity: number
  value: number
  avg_cost: number
  first_cost: number
  last_cost: number
  /** Last price paid in the period against the first; null with a single receipt or a zero first price. */
  price_change_pct: number | null
}

export interface SpendSummary {
  total: number
  receipts: number
  by_vendor: SpendGroup[]
  by_category: SpendGroup[]
  items: SpendItem[]
}

export function purchaseSpend(lines: ReceiptLine[]): SpendSummary {
  const value = (l: ReceiptLine) => Math.abs(num(l.quantity)) * num(l.unit_cost)
  const total = lines.reduce((s, l) => s + value(l), 0)

  const group = (key: (l: ReceiptLine) => string): SpendGroup[] => {
    const m = new Map<string, { value: number; receipts: number }>()
    for (const l of lines) {
      const g = m.get(key(l)) ?? { value: 0, receipts: 0 }
      g.value += value(l); g.receipts++
      m.set(key(l), g)
    }
    return [...m.entries()]
      .map(([name, g]) => ({ name, value: round2(g.value), receipts: g.receipts, share_pct: total > 0 ? Math.round((g.value / total) * 1000) / 10 : 0 }))
      .sort((a, b) => b.value - a.value)
  }

  const items = new Map<string, SpendItem & { _first: string; _last: string }>()
  for (const l of [...lines].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    const qty = Math.abs(num(l.quantity)), cost = num(l.unit_cost)
    const it = items.get(l.product_id)
    if (!it) {
      items.set(l.product_id, {
        product_id: l.product_id, sku: l.sku, name: l.name,
        quantity: qty, value: qty * cost, avg_cost: cost,
        first_cost: cost, last_cost: cost, price_change_pct: null,
        _first: l.created_at, _last: l.created_at,
      })
    } else {
      it.quantity += qty; it.value += qty * cost
      it.last_cost = cost; it._last = l.created_at
    }
  }

  return {
    total: round2(total),
    receipts: lines.length,
    by_vendor:   group(l => l.vendor   || 'No vendor recorded'),
    by_category: group(l => l.category || 'Uncategorized'),
    items: [...items.values()].map(({ _first, _last, ...it }) => ({
      ...it,
      value: round2(it.value),
      avg_cost: it.quantity > 0 ? round2(it.value / it.quantity) : 0,
      price_change_pct: _first !== _last && it.first_cost > 0
        ? Math.round(((it.last_cost - it.first_cost) / it.first_cost) * 1000) / 10
        : null,
    })).sort((a, b) => b.value - a.value),
  }
}

// ── Received, not invoiced — and invoices that don't match ────────────────────

export type GrniState = 'not_invoiced' | 'over_invoiced' | 'under_invoiced' | 'matched'

export interface GrniRow {
  id: string
  po_number: string
  vendor: string
  /** Value of what has arrived, at PO prices. */
  received_value: number
  invoice_no: string | null
  invoice_amount: number | null
  /** Invoice minus goods received; null until an invoice is recorded. */
  variance: number | null
  state: GrniState
  /** Days since the goods first arrived (or since the order, if no receipt date is known). */
  age_days: number
}

export interface GrniSummary {
  /** Goods received with no invoice yet — the accrual to book at period end. */
  accrual: number
  not_invoiced: number
  over_invoiced: number
  under_invoiced: number
  /** Net of all invoice variances. */
  variance: number
}

const MATCH_TOLERANCE = 0.01

export function receivedNotInvoiced(
  pos: Po[],
  receipts: Map<string, Receipt>,
  today: string | Date,
): { rows: GrniRow[]; summary: GrniSummary } {
  const rows: GrniRow[] = []
  for (const po of pos) {
    if (po.status === 'cancelled') continue
    const received = (po.lines ?? []).reduce((s, l) => s + num(l.quantity_received) * num(l.unit_cost), 0)
    if (received <= 0) continue

    const invoice = po.supplier_invoice_amount == null ? null : num(po.supplier_invoice_amount)
    const variance = invoice == null ? null : round2(invoice - received)
    const state: GrniState =
      invoice == null ? 'not_invoiced'
      : Math.abs(variance!) <= MATCH_TOLERANCE ? 'matched'
      : variance! > 0 ? 'over_invoiced' : 'under_invoiced'

    rows.push({
      id: po.id, po_number: po.po_number, vendor: po.supplier?.name ?? 'No vendor',
      received_value: round2(received),
      invoice_no: po.supplier_invoice_no ?? null,
      invoice_amount: invoice,
      variance, state,
      age_days: Math.max(0, daysBetween(receipts.get(po.id)?.first ?? orderedOn(po), today)),
    })
  }

  const of = (s: GrniState) => rows.filter(r => r.state === s)
  return {
    // Oldest unbilled receipts first: those are the ones to chase.
    rows: rows.sort((a, b) => b.age_days - a.age_days),
    summary: {
      accrual:        round2(of('not_invoiced').reduce((s, r) => s + r.received_value, 0)),
      not_invoiced:   of('not_invoiced').length,
      over_invoiced:  of('over_invoiced').length,
      under_invoiced: of('under_invoiced').length,
      variance:       round2(rows.reduce((s, r) => s + (r.variance ?? 0), 0)),
    },
  }
}
