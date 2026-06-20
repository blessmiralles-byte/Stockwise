import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAuth, requireRole } from '@/lib/api-auth'

/**
 * GET /api/inventory
 * Returns inventory balances. Requires viewer role or above.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const { searchParams } = req.nextUrl
  const location_id = searchParams.get('location_id')
  const low_stock   = searchParams.get('low_stock') === 'true'

  const supabase = createServiceClient()

  let query = supabase
    .from('inventory_balances')
    .select(`
      id, quantity, avg_cost, last_updated,
      product:products(id, sku, barcode, name, unit_of_measure, cost_method, reorder_point, attributes, track_expiry, category:categories(name)),
      location:locations(id, name, code)
    `)
    .eq('org_id', auth.orgId)

  if (location_id) query = query.eq('location_id', location_id)

  const { data, error } = await query.order('last_updated', { ascending: false })

  if (error) {
    console.error('[GET /api/inventory]', error)
    return NextResponse.json({ error: 'Failed to fetch inventory' }, { status: 500 })
  }

  const filtered = low_stock
    ? (data ?? []).filter((b: any) => b.quantity <= (b.product?.reorder_point ?? 0))
    : (data ?? [])

  return NextResponse.json({ data: filtered, count: filtered.length })
}

/**
 * POST /api/inventory
 * Records an inventory movement. Requires manager role or above.
 *
 * For true atomicity run scripts/rpc_record_movement.sql in Supabase first —
 * the route will automatically use the RPC when available.
 */
export async function POST(req: NextRequest) {
  const auth = await requireRole('manager')
  if (auth.error) return auth.error

  let body: any
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const {
    transaction_type, product_id, quantity,
    to_location_id, from_location_id,
    unit_cost, reference_no, customer_id, notes,
    expiration_date, batch_no, job_order_id,
    draft, related_po_id,
  } = body

  // ── Input validation (M-2) ─────────────────────────────────────────────────
  if (!transaction_type || !product_id || quantity == null) {
    return NextResponse.json(
      { error: 'transaction_type, product_id, and quantity are required' },
      { status: 422 }
    )
  }

  const validTypes = ['purchase', 'transfer', 'consumption', 'sale', 'adjustment']
  if (!validTypes.includes(transaction_type)) {
    return NextResponse.json(
      { error: `transaction_type must be one of: ${validTypes.join(', ')}` },
      { status: 422 }
    )
  }

  const qty = Number(quantity)
  if (!Number.isInteger(qty) || qty === 0) {
    return NextResponse.json({ error: 'quantity must be a non-zero integer' }, { status: 422 })
  }
  if (transaction_type !== 'adjustment' && qty <= 0) {
    return NextResponse.json({ error: 'quantity must be positive' }, { status: 422 })
  }

  // M-1: Transfer same-location check
  if (transaction_type === 'transfer' && from_location_id && to_location_id && from_location_id === to_location_id) {
    return NextResponse.json({ error: 'Source and destination must be different' }, { status: 422 })
  }

  const supabase = createServiceClient()

  // ── Draft: save record only, no balance update ────────────────────────────
  if (draft === true) {
    const { data: tx, error: txError } = await supabase
      .from('inventory_transactions')
      .insert({
        org_id: auth.orgId,
        status: 'draft',
        transaction_type,
        product_id,
        from_location_id: from_location_id ?? null,
        to_location_id:   to_location_id   ?? null,
        quantity: qty,
        unit_cost: unit_cost ?? 0,
        reference_no: reference_no ?? null,
        customer_id:   customer_id  ?? null,
        notes:         notes        ?? null,
        created_by:    auth.userId,
        job_order_id:  job_order_id ?? null,
        related_po_id: related_po_id ?? null,
      })
      .select()
      .single()

    if (txError) {
      console.error('[POST /api/inventory] draft insert', txError)
      return NextResponse.json({ error: txError.message ?? 'Failed to save draft' }, { status: 500 })
    }

    return NextResponse.json({ success: true, draft: true, transaction: tx }, { status: 201 })
  }

  // ── Prefer atomic RPC when available (H-1) ────────────────────────────────
  const { data: rpcData, error: rpcError } = await supabase.rpc('record_inventory_movement', {
    p_transaction_type: transaction_type,
    p_product_id:       product_id,
    p_quantity:         qty,
    p_unit_cost:        unit_cost ?? 0,
    p_from_location_id: from_location_id ?? null,
    p_to_location_id:   to_location_id   ?? null,
    p_reference_no:     reference_no     ?? null,
    p_notes:            notes            ?? null,
    p_customer_id:      customer_id      ?? null,
    p_created_by:       auth.userId,          // H-3: attribute every write
    p_batch_no:         batch_no         ?? null,
    p_expiration_date:  expiration_date  ?? null,
    p_job_order_id:     job_order_id     ?? null,
    p_org_id:           auth.orgId,
  })

  // If RPC exists and succeeded, return immediately
  if (!rpcError) {
    return NextResponse.json({ success: true, ...(rpcData as object) }, { status: 201 })
  }

  // RPC not yet deployed (function does not exist) — fall back to manual logic
  const isRpcMissing = rpcError.message?.includes('function') || rpcError.code === 'PGRST202'
  if (!isRpcMissing) {
    console.error('[POST /api/inventory] RPC error', rpcError)
    return NextResponse.json({ error: rpcError.message ?? 'Failed to record movement' }, { status: 500 })
  }

  // ── Fallback: manual multi-step (run rpc_record_movement.sql to upgrade) ──
  const { data: product, error: productError } = await supabase
    .from('products')
    .select('id, cost_method')
    .eq('id', product_id)
    .eq('org_id', auth.orgId)
    .single()

  if (productError || !product) {
    return NextResponse.json({ error: 'Product not found' }, { status: 404 })
  }

  const { data: tx, error: txError } = await supabase
    .from('inventory_transactions')
    .insert({
      org_id:          auth.orgId,
      transaction_type,
      product_id,
      from_location_id: from_location_id ?? null,
      to_location_id:   to_location_id   ?? null,
      quantity: qty,
      unit_cost: unit_cost ?? 0,
      reference_no: reference_no ?? null,
      customer_id:   customer_id  ?? null,
      notes:         notes        ?? null,
      created_by:    auth.userId,           // H-3
      job_order_id:  job_order_id ?? null,
    })
    .select()
    .single()

  if (txError) {
    console.error('[POST /api/inventory] insert tx', txError)
    return NextResponse.json({ error: txError.message ?? 'Failed to record movement' }, { status: 500 })
  }

  const cost = unit_cost ?? 0

  if (transaction_type === 'purchase') {
    if (to_location_id) {
      await upsertBalance(supabase, product_id, to_location_id, +qty, cost, product.cost_method)
    }
  } else if (transaction_type === 'transfer') {
    if (from_location_id) await upsertBalance(supabase, product_id, from_location_id, -qty, cost, product.cost_method)
    if (to_location_id)   await upsertBalance(supabase, product_id, to_location_id,   +qty, cost, product.cost_method)
  } else if (transaction_type === 'consumption' || transaction_type === 'sale') {
    if (from_location_id) await upsertBalance(supabase, product_id, from_location_id, -qty, cost, product.cost_method)
  } else if (transaction_type === 'adjustment') {
    const adjLocation = to_location_id ?? from_location_id
    if (adjLocation) await upsertBalance(supabase, product_id, adjLocation, qty, cost, product.cost_method)
  }

  if (transaction_type === 'purchase' && product.cost_method === 'fifo' && to_location_id) {
    await supabase.from('inventory_batches').insert({
      product_id,
      location_id: to_location_id,
      purchase_date: new Date().toISOString().split('T')[0],
      quantity_remaining: qty,
      unit_cost: cost,
      reference_no: reference_no ?? null,
      batch_no: batch_no ?? null,
      expiration_date: expiration_date ?? null,
    })
  }

  return NextResponse.json({ success: true, transaction: tx }, { status: 201 })
}

async function upsertBalance(
  supabase: ReturnType<typeof createServiceClient>,
  product_id: string,
  location_id: string,
  qty_delta: number,
  unit_cost: number,
  cost_method: string
) {
  const { data: existing } = await supabase
    .from('inventory_balances')
    .select('id, quantity, avg_cost')
    .eq('product_id', product_id)
    .eq('location_id', location_id)
    .single()

  if (!existing) {
    await supabase.from('inventory_balances').insert({
      product_id, location_id,
      quantity: qty_delta,   // H-5: no clamp — allow negative to surface data issues
      avg_cost: unit_cost,
    })
    return
  }

  const newQty = existing.quantity + qty_delta
  let newAvgCost = existing.avg_cost

  if (cost_method === 'average' && qty_delta > 0 && unit_cost > 0) {
    newAvgCost = (existing.quantity * existing.avg_cost + qty_delta * unit_cost) /
                 (existing.quantity + qty_delta)
  }

  await supabase
    .from('inventory_balances')
    .update({ quantity: newQty, avg_cost: newAvgCost, last_updated: new Date().toISOString() })
    .eq('id', existing.id)
}
