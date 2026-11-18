import type { NextRequest } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllPaged } from '@/lib/fetch-paged'
import type { Po, Receipt } from '@/lib/procurement-reports'
import { addDays, dayRangeInZone, isIsoDay, todayInZone } from '@/lib/dates'

/**
 * Loading the rows the purchasing, payables and stock reports are built from.
 * The arithmetic is in lib/procurement-reports.ts and lib/inventory-reports.ts;
 * this is only the fetching, always scoped to one organization and always
 * paged, so a report is never quietly built on the first thousand rows.
 */

/**
 * ?from=&to= as dates, defaulting to the last `defaultDays` days up to today.
 * Days are the company's (`timeZone`): the timestamps run from midnight on
 * `from` to the last moment of `to` on their clock, not UTC's.
 */
export function parseRange(req: NextRequest, defaultDays: number, timeZone: string | null): { from: string; to: string; fromTs: string; toTs: string } {
  const sp = req.nextUrl.searchParams
  const today = todayInZone(timeZone)
  const to   = isIsoDay(sp.get('to'))   ? sp.get('to')!   : today
  const from = isIsoDay(sp.get('from')) ? sp.get('from')! : addDays(today, -defaultDays)
  return { from, to, ...dayRangeInZone(from, to, timeZone) }
}

const PO_SELECT = `
  id, po_number, status, created_at, order_date, expected_date,
  supplier_invoice_no, supplier_invoice_date, supplier_invoice_amount,
  supplier:suppliers(id, name, lead_time_days),
  lines:purchase_order_lines(
    product_id, quantity_ordered, quantity_received, unit_cost,
    product:products(sku, name, unit_of_measure)
  )
`

export async function loadPurchaseOrders(
  supabase: SupabaseClient,
  orgId: string,
  opts: { statuses?: string[]; createdFrom?: string; createdTo?: string } = {},
): Promise<{ rows: Po[]; truncated: boolean; error: unknown }> {
  return fetchAllPaged<Po>((from, to) => {
    let q = supabase.from('purchase_orders').select(PO_SELECT).eq('org_id', orgId)
    if (opts.statuses?.length) q = q.in('status', opts.statuses)
    if (opts.createdFrom)      q = q.gte('created_at', opts.createdFrom)
    if (opts.createdTo)        q = q.lte('created_at', opts.createdTo)
    return q.order('created_at', { ascending: false }).order('id').range(from, to) as any
  })
}

/**
 * When goods for each purchase order first and last arrived, from the goods
 * receipts in the stock ledger. A receipt is tied to its order by
 * related_po_id; older ones only carry the PO number as their reference.
 */
export async function loadReceiptDates(
  supabase: SupabaseClient,
  orgId: string,
  pos: Po[],
  since: string,
): Promise<Map<string, Receipt>> {
  const byNumber = new Map(pos.map(p => [p.po_number, p.id]))
  const wanted   = new Set(pos.map(p => p.id))
  const out = new Map<string, Receipt>()
  if (wanted.size === 0) return out

  const { rows } = await fetchAllPaged<{ related_po_id: string | null; reference_no: string | null; created_at: string }>((from, to) =>
    supabase
      .from('inventory_transactions')
      .select('related_po_id, reference_no, created_at')
      .eq('org_id', orgId)
      .eq('transaction_type', 'purchase')
      .gte('created_at', since)
      .order('created_at')
      .order('id')
      .range(from, to))

  for (const r of rows) {
    const poId = r.related_po_id ?? (r.reference_no ? byNumber.get(r.reference_no) : undefined)
    if (!poId || !wanted.has(poId)) continue
    const seen = out.get(poId)
    // Rows arrive oldest first, so the first sighting is the first delivery.
    if (!seen) out.set(poId, { first: r.created_at, last: r.created_at })
    else seen.last = r.created_at
  }
  return out
}
