import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAnyRole } from '@/lib/api-auth'
import { getOrCreateTransitLocation, postTransferMovement } from '@/lib/transfers'

/**
 * POST /api/transfers/[id]/receive  — confirm a delivery (GRN-style)
 * Body: { quantity_received, notes? }
 * Moves the received quantity In-Transit → final destination. A shortfall is
 * left in transit so it can be received later (or the transfer cancelled).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAnyRole('owner', 'admin', 'operations', 'procurement', 'receiver', 'manager')
  if (auth.error) return auth.error

  const { id } = await params
  let body: any
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const supabase = createServiceClient()

  const { data: t, error: fetchErr } = await supabase
    .from('stock_transfers')
    .select('*')
    .eq('id', id)
    .eq('org_id', auth.orgId)
    .single()

  if (fetchErr || !t) {
    return NextResponse.json({ error: 'Delivery not found' }, { status: 404 })
  }
  if (t.status !== 'in_transit') {
    return NextResponse.json({ error: 'This delivery is not in transit' }, { status: 400 })
  }

  const outstanding = Number(t.quantity) - Number(t.quantity_received)
  const qty = Number(body.quantity_received)
  if (!Number.isFinite(qty) || qty <= 0) {
    return NextResponse.json({ error: 'quantity_received must be a positive number' }, { status: 422 })
  }
  if (qty > outstanding) {
    return NextResponse.json({ error: `Only ${outstanding} still in transit for this delivery` }, { status: 422 })
  }

  try {
    const transitId = await getOrCreateTransitLocation(supabase, auth.orgId)

    // In Transit → final destination for the quantity that actually arrived.
    const moveErr = await postTransferMovement(supabase, {
      orgId: auth.orgId, productId: t.product_id, quantity: qty, unitCost: Number(t.unit_cost ?? 0),
      fromId: transitId, toId: t.to_location_id,
      referenceNo: t.reference_no ?? null,
      notes: 'Delivery received',
      userId: auth.userId,
    })
    if (moveErr) return NextResponse.json({ error: moveErr }, { status: 400 })

    const newReceived = Number(t.quantity_received) + qty
    const fullyReceived = newReceived >= Number(t.quantity)

    const { data: updated, error: updErr } = await supabase
      .from('stock_transfers')
      .update({
        quantity_received: newReceived,
        status:            fullyReceived ? 'received' : 'in_transit',
        received_by:       auth.userId,
        received_at:       new Date().toISOString(),
        notes:             body.notes ?? t.notes,
      })
      .eq('id', id)
      .select()
      .single()

    if (updErr) {
      console.error('[POST /api/transfers/:id/receive] update', updErr)
      return NextResponse.json({ error: 'Received, but the delivery record failed to update.' }, { status: 500 })
    }

    return NextResponse.json({
      data: updated,
      fully_received: fullyReceived,
      short: qty < outstanding,
    })
  } catch (err: any) {
    console.error('[POST /api/transfers/:id/receive]', err)
    return NextResponse.json({ error: err?.message ?? 'Failed to receive delivery' }, { status: 500 })
  }
}
