import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAnyRole } from '@/lib/api-auth'

/**
 * PATCH /api/products/:id
 *
 * Update a product's catalog fields. Primary use: a manager reviewing an item
 * that receiving auto-created (needs_review), confirming its category / cost
 * method / reorder point and clearing the flag.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAnyRole('owner', 'operations', 'procurement', 'manager')
  if (auth.error) return auth.error

  const { id } = await params
  let body: any
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const allowed = ['name', 'category_id', 'unit_of_measure', 'cost_method', 'reorder_point', 'track_expiry', 'needs_review', 'barcode', 'is_active']
  const updates: Record<string, unknown> = {}
  for (const key of allowed) if (key in body) updates[key] = body[key]

  if ('name' in updates) {
    const n = String(updates.name).trim()
    if (!n) return NextResponse.json({ error: 'name cannot be empty' }, { status: 422 })
    updates.name = n
  }
  if ('cost_method' in updates && !['average', 'fifo'].includes(String(updates.cost_method))) {
    return NextResponse.json({ error: 'cost_method must be average or fifo' }, { status: 422 })
  }
  if ('reorder_point' in updates) {
    const r = Number(updates.reorder_point)
    if (!Number.isInteger(r) || r < 0) {
      return NextResponse.json({ error: 'reorder_point must be a non-negative integer' }, { status: 422 })
    }
    updates.reorder_point = r
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 422 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('products')
    .update(updates)
    .eq('id', id)
    .eq('org_id', auth.orgId)
    .select('id, sku, barcode, name, unit_of_measure, cost_method, reorder_point, track_expiry, needs_review, category:categories(id, name)')
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'An item with that SKU or barcode already exists' }, { status: 409 })
    }
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }
    console.error('[PATCH /api/products/:id]', error.code)
    return NextResponse.json({ error: 'Failed to update product' }, { status: 500 })
  }

  return NextResponse.json({ data })
}
