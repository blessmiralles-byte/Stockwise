import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireRole } from '@/lib/api-auth'

// POST /api/transactions/[id]/post — commit a draft transaction to inventory
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await requireRole('manager')
  if (auth.error) return auth.error

  const supabase = createServiceClient()

  // Load the draft
  const { data: tx, error: fetchErr } = await supabase
    .from('inventory_transactions')
    .select('*')
    .eq('id', id)
    .eq('org_id', auth.orgId)
    .eq('status', 'draft')
    .single()

  if (fetchErr || !tx) {
    return NextResponse.json({ error: 'Draft transaction not found' }, { status: 404 })
  }

  // Call canonical RPC to update balances atomically
  const { error: rpcError } = await supabase.rpc('record_inventory_movement', {
    p_transaction_type: tx.transaction_type,
    p_product_id:       tx.product_id,
    p_quantity:         tx.quantity,
    p_unit_cost:        tx.unit_cost ?? 0,
    p_from_location_id: tx.from_location_id ?? null,
    p_to_location_id:   tx.to_location_id   ?? null,
    p_reference_no:     tx.reference_no     ?? null,
    p_notes:            tx.notes            ?? null,
    p_customer_id:      tx.customer_id      ?? null,
    p_created_by:       auth.userId,
    p_batch_no:         null,
    p_expiration_date:  null,
    p_job_order_id:     tx.job_order_id     ?? null,
    p_org_id:           auth.orgId,
  })

  if (rpcError) {
    console.error('[POST /api/transactions/[id]/post] RPC error', rpcError)
    return NextResponse.json({ error: rpcError.message ?? 'Failed to post transaction' }, { status: 500 })
  }

  // Mark the original draft as posted (the RPC also inserted a new row, so delete the draft)
  await supabase.from('inventory_transactions').delete().eq('id', id)

  return NextResponse.json({ success: true })
}

// DELETE /api/transactions/[id] — discard a draft
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await requireRole('manager')
  if (auth.error) return auth.error

  const supabase = createServiceClient()

  const { error } = await supabase
    .from('inventory_transactions')
    .delete()
    .eq('id', id)
    .eq('org_id', auth.orgId)
    .eq('status', 'draft')

  if (error) {
    return NextResponse.json({ error: error.message ?? 'Failed to delete draft' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
