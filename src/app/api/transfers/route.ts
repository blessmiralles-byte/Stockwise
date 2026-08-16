import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAuth, requireRole } from '@/lib/api-auth'
import { getOrCreateTransitLocation, postTransferMovement, locationAvgCost } from '@/lib/transfers'

const SELECT = `
  id, quantity, quantity_received, unit_cost, status, reference_no, notes,
  shipped_at, received_at,
  product:products(id, sku, name, unit_of_measure),
  from_location:locations!from_location_id(id, name, code),
  to_location:locations!to_location_id(id, name, code),
  shipped_by:user_profiles!shipped_by(id, full_name)
`

/**
 * GET /api/transfers?status=in_transit   — in-transit / delivery queue
 * Any authenticated org member can view incoming deliveries.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const status = req.nextUrl.searchParams.get('status') ?? 'in_transit'
  const supabase = createServiceClient()

  let query = supabase
    .from('stock_transfers')
    .select(SELECT)
    .eq('org_id', auth.orgId)
    .order('shipped_at', { ascending: false })
    .limit(200)

  if (status !== 'all') query = query.eq('status', status)

  const { data, error } = await query
  if (error) {
    console.error('[GET /api/transfers]', error)
    return NextResponse.json({ error: 'Failed to fetch transfers' }, { status: 500 })
  }
  return NextResponse.json({ data: data ?? [] })
}

/**
 * POST /api/transfers  — ship stock (mark in transit)
 * Body: { product_id, from_location_id, to_location_id, quantity, notes?, reference_no? }
 * Moves stock source → In-Transit and records the delivery manifest.
 */
export async function POST(req: NextRequest) {
  const auth = await requireRole('manager')
  if (auth.error) return auth.error

  let body: any
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { product_id, from_location_id, to_location_id } = body
  const quantity = Number(body.quantity)

  if (!product_id || !from_location_id || !to_location_id) {
    return NextResponse.json({ error: 'product_id, from_location_id and to_location_id are required' }, { status: 422 })
  }
  if (from_location_id === to_location_id) {
    return NextResponse.json({ error: 'Source and destination must be different' }, { status: 422 })
  }
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return NextResponse.json({ error: 'quantity must be a positive number' }, { status: 422 })
  }

  const supabase = createServiceClient()

  try {
    const transitId = await getOrCreateTransitLocation(supabase, auth.orgId)
    const unitCost  = await locationAvgCost(supabase, product_id, from_location_id)

    // Leg 1: source → In Transit (fails here if there isn't enough stock)
    const moveErr = await postTransferMovement(supabase, {
      orgId: auth.orgId, productId: product_id, quantity, unitCost,
      fromId: from_location_id, toId: transitId,
      referenceNo: body.reference_no ?? null,
      notes: 'Shipped (in transit)',
      userId: auth.userId,
    })
    if (moveErr) return NextResponse.json({ error: moveErr }, { status: 400 })

    const { data: transfer, error: insErr } = await supabase
      .from('stock_transfers')
      .insert({
        org_id:           auth.orgId,
        product_id,
        from_location_id,
        to_location_id,
        quantity,
        unit_cost:        unitCost,
        status:           'in_transit',
        reference_no:     body.reference_no ?? null,
        notes:            body.notes ?? null,
        shipped_by:       auth.userId,
      })
      .select(SELECT)
      .single()

    if (insErr) {
      console.error('[POST /api/transfers] manifest insert', insErr)
      return NextResponse.json({ error: 'Stock shipped, but the delivery record failed to save.' }, { status: 500 })
    }

    return NextResponse.json({ data: transfer }, { status: 201 })
  } catch (err: any) {
    console.error('[POST /api/transfers]', err)
    return NextResponse.json({ error: err?.message ?? 'Failed to ship stock' }, { status: 500 })
  }
}
