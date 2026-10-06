import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAuth, requireAnyRole } from '@/lib/api-auth'
import { createNotification } from '@/lib/notify'
import { belowReorderPoint, groupByVendor, type StockLine, type ReorderCandidate } from '@/lib/reorder'

/**
 * The procurement work list.
 *
 * GET  — everything at or below its reorder point right now, with the
 *        suggested quantity and preferred vendor. Computed live from stock so
 *        it is right even between nightly runs; the alert rows only decide what
 *        the digest email mentions.
 * POST — turn a selection into draft purchase orders, one per vendor.
 */

const BALANCE_SELECT = `
  product_id, quantity,
  product:products(
    id, name, sku, unit_of_measure, reorder_point, keep_in_stock, supplier_id, lead_time_days,
    supplier:suppliers(id, name, lead_time_days)
  )
`

export async function GET() {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const supabase = createServiceClient()
  const [{ data: balances, error }, { data: alerts }] = await Promise.all([
    supabase.from('inventory_balances').select(BALANCE_SELECT).eq('org_id', auth.orgId),
    supabase.from('reorder_alerts')
      .select('product_id, status, po_id, triggered_at')
      .eq('org_id', auth.orgId).in('status', ['open', 'ordered']),
  ])

  if (error) {
    console.error('[GET /api/reorder]', error)
    return NextResponse.json({ error: error.message ?? 'Failed to read stock' }, { status: 500 })
  }

  const byProduct = new Map((alerts ?? []).map((a: any) => [a.product_id, a]))
  const items = belowReorderPoint((balances ?? []) as StockLine[]).map(c => ({
    ...c,
    // 'ordered' means a draft PO already covers it — shown, but not re-ordered.
    alert_status: byProduct.get(c.product_id)?.status ?? null,
    po_id:        byProduct.get(c.product_id)?.po_id ?? null,
    since:        byProduct.get(c.product_id)?.triggered_at ?? null,
  }))

  return NextResponse.json({
    data: items,
    count: items.length,
    out_of_stock: items.filter(i => i.quantity <= 0).length,
  })
}

/**
 * POST /api/reorder — create draft purchase orders from the selection.
 * Body: { product_ids: string[] }
 *
 * Procurement only: a PO is theirs to raise. Drafts are deliberate — an order
 * nobody priced is how you buy at the wrong price.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAnyRole('owner', 'procurement')
  if (auth.error) return auth.error

  let body: any
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const wanted: string[] = Array.isArray(body?.product_ids) ? body.product_ids : []
  if (wanted.length === 0) {
    return NextResponse.json({ error: 'Select at least one item to order' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data: balances } = await supabase
    .from('inventory_balances').select(BALANCE_SELECT).eq('org_id', auth.orgId)

  const candidates = belowReorderPoint((balances ?? []) as StockLine[])
    .filter(c => wanted.includes(c.product_id))
  if (candidates.length === 0) {
    return NextResponse.json({ error: 'Those items are no longer below their reorder point' }, { status: 409 })
  }

  const { vendors, unassigned } = groupByVendor(candidates)
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const created: { id: string; po_number: string; vendor: string | null; lines: number }[] = []

  // One draft per vendor; items with no preferred vendor go on a single
  // unassigned draft for procurement to point at someone.
  const batches: { vendor_id: string | null; vendor_name: string | null; items: ReorderCandidate[] }[] = [
    ...vendors,
    ...(unassigned.length ? [{ vendor_id: null, vendor_name: null, items: unassigned }] : []),
  ]

  for (const batch of batches) {
    const { data: seqVal, error: seqErr } = await supabase
      .rpc('next_ref_number', { p_seq: 'public.po_seq' })
    if (seqErr || seqVal == null) {
      console.error('[POST /api/reorder] sequence', seqErr?.message)
      return NextResponse.json({ error: 'Failed to generate a PO number' }, { status: 500 })
    }
    const po_number = `PO-${datePart}-${String(seqVal).padStart(4, '0')}`

    const { data: po, error: poErr } = await supabase
      .from('purchase_orders')
      .insert({
        org_id: auth.orgId,
        po_number,
        supplier_id: batch.vendor_id,
        status: 'draft',
        order_date: new Date().toISOString().slice(0, 10),
        notes: 'Raised from reorder points - check quantities and prices before sending',
        created_by: auth.userId,
      })
      .select('id, po_number')
      .single()

    if (poErr || !po) {
      console.error('[POST /api/reorder] insert PO', poErr)
      return NextResponse.json({ error: poErr?.message ?? 'Failed to create the purchase order' }, { status: 500 })
    }

    const { error: lineErr } = await supabase.from('purchase_order_lines').insert(
      batch.items.map(i => ({
        org_id: auth.orgId,
        purchase_order_id: po.id,
        product_id: i.product_id,
        quantity_ordered: Math.max(1, Math.round(i.suggested_qty)),
        unit_cost: 0,
        notes: `On hand ${i.quantity}, reorder point ${i.reorder_point}`,
      })),
    )
    if (lineErr) {
      console.error('[POST /api/reorder] insert lines', lineErr)
      await supabase.from('purchase_orders').delete().eq('id', po.id)
      return NextResponse.json({ error: lineErr.message ?? 'Failed to add the order lines' }, { status: 500 })
    }

    // Mark these items as covered so the nightly digest leaves them alone.
    for (const item of batch.items) {
      const { data: existing } = await supabase.from('reorder_alerts')
        .select('id').eq('org_id', auth.orgId).eq('product_id', item.product_id)
        .in('status', ['open', 'ordered']).maybeSingle()
      if (existing) {
        await supabase.from('reorder_alerts')
          .update({ status: 'ordered', po_id: po.id }).eq('id', (existing as any).id)
      } else {
        await supabase.from('reorder_alerts').insert({
          org_id: auth.orgId, product_id: item.product_id, status: 'ordered', po_id: po.id,
          quantity_at_trigger: item.quantity, reorder_point: item.reorder_point,
          suggested_qty: item.suggested_qty,
        })
      }
    }

    created.push({ id: po.id, po_number: po.po_number, vendor: batch.vendor_name, lines: batch.items.length })
  }

  if (created.length) {
    await createNotification({
      userId: auth.userId,
      orgId:  auth.orgId,
      type:   'purchase_order',
      title:  `${created.length} draft purchase order${created.length > 1 ? 's' : ''} raised from reorder points`,
      body:   created.map(c => `${c.po_number}${c.vendor ? ` · ${c.vendor}` : ''} (${c.lines} lines)`).join(', '),
      actionUrl: created.length === 1 ? `/purchase-orders/${created[0].id}` : '/purchase-orders',
    })
  }

  return NextResponse.json({
    data: created,
    message: created.length === 1
      ? `Draft ${created[0].po_number} created — add prices, then submit it.`
      : `${created.length} draft purchase orders created, one per vendor — add prices, then submit them.`,
  }, { status: 201 })
}
