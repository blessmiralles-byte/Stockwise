import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAnyRole } from '@/lib/api-auth'
import { logAudit } from '@/lib/audit'
import { normaliseItemCode, validateItemCode } from '@/lib/item-code'
import { findCodeHolder, clashedField, clashMessage } from '@/lib/item-code-server'

/**
 * PATCH /api/products/:id
 *
 * Update a product's catalog fields. Primary use: a manager reviewing an item
 * that receiving auto-created (needs_review), confirming its category / cost
 * method / reorder point and clearing the flag — and giving it the company's
 * own item code in place of the generated one.
 *
 * Items are linked everywhere by id, so changing the code rewrites no history:
 * past transactions, POs and counts simply show the new code.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAnyRole('owner', 'operations', 'procurement', 'manager')
  if (auth.error) return auth.error

  const { id } = await params
  let body: any
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const allowed = ['name', 'sku', 'category_id', 'unit_of_measure', 'cost_method', 'reorder_point', 'keep_in_stock', 'track_expiry', 'needs_review', 'barcode', 'is_active']
  const updates: Record<string, unknown> = {}
  for (const key of allowed) if (key in body) updates[key] = body[key]

  if ('sku' in updates) {
    const code = normaliseItemCode(updates.sku)
    const invalid = validateItemCode(code)
    if (invalid) return NextResponse.json({ error: invalid }, { status: 422 })
    updates.sku = code
  }
  if ('barcode' in updates) {
    updates.barcode = normaliseItemCode(updates.barcode) || null
  }

  if ('name' in updates) {
    const n = String(updates.name).trim()
    if (!n) return NextResponse.json({ error: 'name cannot be empty' }, { status: 422 })
    updates.name = n
  }
  if ('cost_method' in updates && !['average', 'fifo'].includes(String(updates.cost_method))) {
    return NextResponse.json({ error: 'cost_method must be average or fifo' }, { status: 422 })
  }
  if ('keep_in_stock' in updates) updates.keep_in_stock = !!updates.keep_in_stock

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

  // The current code, for the audit trail and to know whether it's changing.
  const { data: before } = await supabase
    .from('products')
    .select('sku')
    .eq('id', id)
    .eq('org_id', auth.orgId)
    .maybeSingle()
  if (!before) return NextResponse.json({ error: 'Product not found' }, { status: 404 })
  const codeChanging = 'sku' in updates && updates.sku !== (before as any).sku

  // Say which item already has it, rather than a bare "already exists".
  for (const field of ['sku', 'barcode'] as const) {
    if (field === 'sku' && !codeChanging) continue
    const value = updates[field]
    if (typeof value !== 'string' || !value) continue
    const holder = await findCodeHolder(supabase, auth.orgId, field, value, id)
    if (holder) return NextResponse.json({ error: clashMessage(field, holder.name), field }, { status: 409 })
  }

  const { data, error } = await supabase
    .from('products')
    .update(updates)
    .eq('id', id)
    .eq('org_id', auth.orgId)
    .select('id, sku, barcode, name, unit_of_measure, cost_method, reorder_point, track_expiry, needs_review, category:categories(id, name)')
    .single()

  if (error) {
    if (error.code === '23505') {
      // Someone took it between our check and the write.
      const field = clashedField(error)
      return NextResponse.json({ error: clashMessage(field), field }, { status: 409 })
    }
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }
    console.error('[PATCH /api/products/:id]', error.code)
    return NextResponse.json({ error: 'Failed to update product' }, { status: 500 })
  }

  if (codeChanging) {
    await logAudit({
      actorId:   auth.userId,
      orgId:     auth.orgId,
      action:    'product.code_change',
      tableName: 'products',
      recordId:  id,
      oldValue:  { sku: (before as any).sku },
      newValue:  { sku: updates.sku },
    })
  }

  return NextResponse.json({ data })
}
