import { NextRequest, NextResponse } from 'next/server'
import { countFreezeRefusal } from '@/lib/count-freeze-server'
import { createServiceClient } from '@/lib/supabase/service'
import { POSSaleRequest } from '@/types'
import { authenticateApiKey } from '@/lib/api-keys-server'

/**
 * POST /api/pos/sale
 * External POS integration — authenticated by API key (not session).
 *
 * Stock deduction uses the deduct_inventory_balance() RPC for atomicity (H-2).
 * Falls back to a checked two-step write if the RPC hasn't been deployed yet.
 */
export async function POST(req: NextRequest) {
  // Per-organization key (Settings → API keys, scope "pos"). The key decides
  // the company; the plan gate is checked there too.
  const auth = await authenticateApiKey(req.headers.get('authorization'), 'pos')
  if (!auth.ok) return auth.error
  const orgId = auth.orgId

  let body: POSSaleRequest
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { items, location_id, customer_id, reference_no } = body

  if (!items?.length || !location_id) {
    return NextResponse.json({ error: 'items and location_id are required' }, { status: 422 })
  }

  for (const item of items) {
    if (!item.product_id || !Number.isInteger(item.quantity) || item.quantity <= 0) {
      return NextResponse.json(
        { error: 'Each item requires product_id and a positive integer quantity' },
        { status: 422 }
      )
    }
    if (item.unit_price < 0) {
      return NextResponse.json({ error: 'unit_price cannot be negative' }, { status: 422 })
    }
  }

  const supabase = createServiceClient()

  // The location and every item must belong to the key's company.
  const { data: loc } = await supabase
    .from('locations')
    .select('id')
    .eq('id', location_id)
    .eq('org_id', orgId)
    .maybeSingle()
  if (!loc) {
    return NextResponse.json({ error: 'Unknown location_id' }, { status: 422 })
  }
  const productIds = [...new Set(items.map(i => i.product_id))]
  const { data: owned } = await supabase
    .from('products')
    .select('id')
    .eq('org_id', orgId)
    .in('id', productIds)
  const ownedIds = new Set((owned ?? []).map((p: any) => p.id))
  const unknown = productIds.filter(id => !ownedIds.has(id))
  if (unknown.length) {
    return NextResponse.json({ error: 'Unknown product_id', product_ids: unknown }, { status: 422 })
  }

  const frozen = await countFreezeRefusal(supabase, orgId, [location_id])
  if (frozen) return frozen

  const transactionRef = reference_no ?? `POS-${Date.now()}`
  const results: any[] = []

  for (const item of items) {
    // ── Try atomic RPC first (H-2: no TOCTOU race) ────────────────────────
    const { data: deducted, error: rpcError } = await supabase
      .rpc('deduct_inventory_balance', {
        p_product_id:  item.product_id,
        p_location_id: location_id,
        p_quantity:    item.quantity,
      })
      .single()

    let avgCost: number

    if (!rpcError && deducted) {
      avgCost = (deducted as any).avg_cost
    } else {
      // RPC not deployed yet — fall back to read-then-write (less safe)
      const isRpcMissing = rpcError?.message?.includes('function') || rpcError?.code === 'PGRST202'
      const isInsufficient = rpcError?.message === 'INSUFFICIENT_STOCK'

      if (isInsufficient || (!isRpcMissing && rpcError)) {
        const { data: current } = await supabase
          .from('inventory_balances')
          .select('quantity')
          .eq('product_id', item.product_id)
          .eq('location_id', location_id)
          .single()

        return NextResponse.json({
          error: 'Insufficient stock',
          product_id: item.product_id,
          available:  current?.quantity ?? 0,
          requested:  item.quantity,
        }, { status: 409 })
      }

      // Fallback: manual check-then-update
      const { data: balance } = await supabase
        .from('inventory_balances')
        .select('quantity, avg_cost')
        .eq('product_id', item.product_id)
        .eq('location_id', location_id)
        .single()

      if (!balance || balance.quantity < item.quantity) {
        return NextResponse.json({
          error:     'Insufficient stock',
          product_id: item.product_id,
          available:  balance?.quantity ?? 0,
          requested:  item.quantity,
        }, { status: 409 })
      }

      avgCost = balance.avg_cost

      await supabase
        .from('inventory_balances')
        .update({ quantity: balance.quantity - item.quantity, last_updated: new Date().toISOString() })
        .eq('product_id', item.product_id)
        .eq('location_id', location_id)
    }

    // Record the transaction
    const { data: tx, error: txError } = await supabase
      .from('inventory_transactions')
      .insert({
        org_id:           orgId,
        transaction_type: 'sale',
        product_id:       item.product_id,
        from_location_id: location_id,
        to_location_id:   null,
        quantity:         item.quantity,
        unit_cost:        avgCost!,
        reference_no:     transactionRef,
        customer_id:      customer_id ?? null,
      })
      .select('id')
      .single()

    if (txError) {
      console.error('[POST /api/pos/sale] insert tx', txError)
      return NextResponse.json({ error: 'Failed to record sale' }, { status: 500 })
    }

    results.push({
      product_id:     item.product_id,
      quantity:       item.quantity,
      unit_price:     item.unit_price,
      unit_cost:      avgCost!,
      subtotal:       item.quantity * item.unit_price,
      transaction_id: tx.id,
    })
  }

  return NextResponse.json({
    success:      true,
    reference_no: transactionRef,
    location_id,
    customer_id:  customer_id ?? null,
    items:        results,
    total_amount: results.reduce((s, r) => s + r.subtotal, 0),
    timestamp:    new Date().toISOString(),
  })
}
