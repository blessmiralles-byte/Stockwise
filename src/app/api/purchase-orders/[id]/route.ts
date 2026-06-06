import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAuth, requireRole } from '@/lib/api-auth'

// GET /api/purchase-orders/:id
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const { id } = await params
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('purchase_orders')
    .select(`
      *,
      supplier:suppliers(*),
      lines:purchase_order_lines(
        *,
        product:products(id, sku, name, unit_of_measure, category:categories(name))
      )
    `)
    .eq('id', id)
    .eq('org_id', auth.orgId)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 })
  }

  return NextResponse.json({ data })
}

// PATCH /api/purchase-orders/:id
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole('manager')
  if (auth.error) return auth.error

  const { id } = await params
  const body = await req.json()

  const allowed = [
    'status', 'expected_date', 'notes', 'supplier_id',
    // AP invoice fields for three-way match
    'supplier_invoice_no', 'supplier_invoice_date', 'supplier_invoice_amount',
  ]
  const updates: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('purchase_orders')
    .update(updates)
    .eq('id', id)
    .eq('org_id', auth.orgId)
    .select()
    .single()

  if (error) {
    console.error('[PATCH /api/purchase-orders/:id]', error)
    return NextResponse.json({ error: 'Failed to update purchase order' }, { status: 500 })
  }

  return NextResponse.json({ data })
}
