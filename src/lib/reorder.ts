/**
 * Reorder points as a trigger, not just a number on a page.
 *
 * Stock on hand is compared against each product's reorder point. Crossing the
 * line opens an alert; recovering closes it. The daily digest reports what is
 * newly open, so procurement hears about an item once rather than every
 * morning until someone acts.
 *
 * Pure functions — the route supplies the rows, these decide what happens.
 */

export interface StockLine {
  product_id: string
  quantity:   number
  product?: {
    id?: string
    name?: string | null
    sku?: string | null
    unit_of_measure?: string | null
    /** Marked "keep this item in stock" on the product. */
    keep_in_stock?: boolean | null
    reorder_point?: number | null
    reorder_qty?: number | null
    supplier_id?: string | null
    lead_time_days?: number | null
    supplier?: { id?: string; name?: string | null; lead_time_days?: number | null } | null
  } | null
}

export interface ExistingAlert {
  product_id: string
  status: 'open' | 'ordered' | 'resolved'
}

export interface ReorderCandidate {
  product_id:    string
  name:          string
  sku:           string | null
  unit:          string | null
  quantity:      number
  reorder_point: number
  suggested_qty: number
  shortfall:     number
  vendor_id:     string | null
  vendor_name:   string | null
  lead_time_days: number | null
}

/** Stock on hand per product, summed across every location. */
export function stockByProduct(lines: StockLine[]): Map<string, { qty: number; product: StockLine['product'] }> {
  const map = new Map<string, { qty: number; product: StockLine['product'] }>()
  for (const line of lines ?? []) {
    const id = line.product_id ?? line.product?.id
    if (!id) continue
    const entry = map.get(id) ?? { qty: 0, product: line.product }
    entry.qty += Number(line.quantity ?? 0)
    if (!entry.product && line.product) entry.product = line.product
    map.set(id, entry)
  }
  return map
}

/**
 * How much to order. A product can carry its own reorder quantity; otherwise
 * bring it back to twice the reorder point, which covers the lead time plus a
 * buffer — never less than the shortfall, and never zero.
 */
export function suggestedQty(quantity: number, reorderPoint: number, reorderQty?: number | null): number {
  if (reorderQty != null && Number(reorderQty) > 0) return Math.ceil(Number(reorderQty))
  const target = reorderPoint * 2
  return Math.max(1, Math.ceil(target - quantity))
}

/**
 * Which products need buying.
 *
 * A product counts as stocked when it is marked "keep in stock", or (for data
 * created before that flag existed) when it carries a reorder point. A stocked
 * item is flagged at or below its reorder point — and at zero even when no
 * level has been set yet, because a stocked item at zero always needs ordering.
 * Items that aren't stocked are never flagged, however low they run.
 */
export function belowReorderPoint(lines: StockLine[]): ReorderCandidate[] {
  const out: ReorderCandidate[] = []
  for (const [productId, { qty, product }] of stockByProduct(lines)) {
    const point   = Number(product?.reorder_point ?? 0)
    const stocked = product?.keep_in_stock === true || point > 0
    if (!stocked) continue
    if (qty > point && qty > 0) continue
    out.push({
      product_id:    productId,
      name:          product?.name ?? 'Unnamed product',
      sku:           product?.sku ?? null,
      unit:          product?.unit_of_measure ?? null,
      quantity:      qty,
      reorder_point: point,
      suggested_qty: suggestedQty(qty, point, product?.reorder_qty),
      shortfall:     Math.max(0, point - qty),
      vendor_id:     product?.supplier_id ?? product?.supplier?.id ?? null,
      vendor_name:   product?.supplier?.name ?? null,
      lead_time_days: product?.lead_time_days ?? product?.supplier?.lead_time_days ?? null,
    })
  }
  // Worst first: out of stock, then furthest below the line.
  return out.sort((a, b) => (a.quantity - b.quantity) || (b.shortfall - a.shortfall))
}

export interface ReorderPlan {
  /** Newly crossed — these go in the digest. */
  toOpen: ReorderCandidate[]
  /** Already alerted and still low — kept open, not re-sent. */
  stillOpen: ReorderCandidate[]
  /** Recovered — their alerts close. */
  toResolve: string[]
}

/** Compare today's low stock against the alerts already on file. */
export function planReorderAlerts(candidates: ReorderCandidate[], existing: ExistingAlert[]): ReorderPlan {
  const live = new Map((existing ?? [])
    .filter(a => a.status === 'open' || a.status === 'ordered')
    .map(a => [a.product_id, a.status]))
  const lowNow = new Set(candidates.map(c => c.product_id))

  const toOpen: ReorderCandidate[] = []
  const stillOpen: ReorderCandidate[] = []
  for (const c of candidates) {
    if (live.has(c.product_id)) stillOpen.push(c)
    else toOpen.push(c)
  }

  const toResolve = [...live.keys()].filter(id => !lowNow.has(id))
  return { toOpen, stillOpen, toResolve }
}

/** Draft purchase orders group by preferred vendor; items with none are left for procurement to assign. */
export function groupByVendor(items: ReorderCandidate[]): {
  vendors: { vendor_id: string; vendor_name: string | null; items: ReorderCandidate[] }[]
  unassigned: ReorderCandidate[]
} {
  const byVendor = new Map<string, { vendor_id: string; vendor_name: string | null; items: ReorderCandidate[] }>()
  const unassigned: ReorderCandidate[] = []

  for (const item of items) {
    if (!item.vendor_id) { unassigned.push(item); continue }
    const entry = byVendor.get(item.vendor_id)
      ?? { vendor_id: item.vendor_id, vendor_name: item.vendor_name, items: [] }
    entry.items.push(item)
    byVendor.set(item.vendor_id, entry)
  }
  return { vendors: [...byVendor.values()], unassigned }
}

/** One line for the digest email and the in-app notification. */
export function summarise(candidates: ReorderCandidate[]): string {
  const out = candidates.filter(c => c.quantity <= 0).length
  const n = candidates.length
  const items = `${n} item${n === 1 ? '' : 's'}`
  return out > 0 ? `${items} below reorder point, ${out} out of stock` : `${items} below reorder point`
}
