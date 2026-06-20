import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAnyRole } from '@/lib/api-auth'
import { logAudit } from '@/lib/audit'

/**
 * POST /api/stock-counts/:id/approve
 * Posts adjustment transactions for all non-zero variances, then marks approved.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // SOD: receiver cannot approve their own counts — only operations manager or owner
  const auth = await requireAnyRole('owner', 'operations')
  if (auth.error) return auth.error

  const { id } = await params
  const supabase = createServiceClient()

  const { data: sc, error: scErr } = await supabase
    .from('stock_counts')
    .select(`*, lines:stock_count_lines(*)`)
    .eq('id', id)
    .eq('org_id', auth.orgId)
    .single()

  if (scErr || !sc) {
    return NextResponse.json({ error: 'Stock count not found' }, { status: 404 })
  }

  if (sc.status !== 'reviewing') {
    return NextResponse.json({ error: 'Can only approve a count in "reviewing" status' }, { status: 400 })
  }

  // M-2: SOD — the person who created the count cannot also approve it
  if (sc.created_by === auth.userId) {
    return NextResponse.json(
      { error: 'Segregation of duties: you cannot approve a stock count you created' },
      { status: 403 }
    )
  }

  const lines = (sc.lines ?? []) as any[]
  const variantLines = lines.filter((l: any) => l.counted_qty !== null && Number(l.variance) !== 0)

  const errors: string[] = []

  for (const line of variantLines) {
    const variance = Number(line.variance)
    if (variance === 0) continue

    // The RPC's adjustment branch takes a SIGNED quantity at a single location —
    // a shortage (negative variance) must decrease stock, not add it back.
    const { error: txErr } = await supabase.rpc('record_inventory_movement', {
      p_transaction_type: 'adjustment',
      p_product_id: line.product_id,
      p_from_location_id: null,
      p_to_location_id: line.location_id,
      p_quantity: variance,
      p_unit_cost: 0,   // 0 → RPC values the variance at the balance's book avg_cost
      p_reference_no: sc.count_number,
      p_batch_no: null,
      p_expiration_date: null,
      p_notes: `Stock count adjustment: ${sc.count_number}`,
      p_created_by: auth.userId,
      p_job_order_id: null,
      p_org_id: auth.orgId,
    })

    if (txErr) {
      errors.push(`product ${line.product_id}: ${txErr.message}`)
    }
  }

  if (errors.length > 0) {
    return NextResponse.json({ error: 'Some adjustments failed: ' + errors.join('; ') }, { status: 500 })
  }

  const { data, error: approveErr } = await supabase
    .from('stock_counts')
    .update({
      status: 'approved',
      approved_by: auth.userId,
      approved_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()

  if (approveErr) {
    return NextResponse.json({ error: 'Failed to mark as approved' }, { status: 500 })
  }

  // M-4: Audit log — stock count approvals affect inventory balances
  await logAudit({
    actorId:   auth.userId,
    orgId:     auth.orgId,
    action:    'stock_count.approve',
    tableName: 'stock_counts',
    recordId:  id,
    newValue:  {
      count_number:       sc.count_number,
      adjustments_posted: variantLines.length,
      approved_at:        new Date().toISOString(),
    },
  })

  return NextResponse.json({
    data: { ...data, adjustments_posted: variantLines.length },
  })
}
