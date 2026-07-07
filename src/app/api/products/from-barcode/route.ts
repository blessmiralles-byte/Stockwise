import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAnyRole } from '@/lib/api-auth'
import { lookupBarcode } from '@/lib/barcode-lookup'

/**
 * POST /api/products/from-barcode
 * Body: { barcode: string, name?: string }
 *
 * Resolve a barcode to a catalog product for on-the-fly receiving:
 *   1. If a product with this barcode already exists in the org, return it.
 *   2. Otherwise create one — prefilled from the global barcode catalog when
 *      available — flagged needs_review = true so a manager can confirm the
 *      details later. Never blocks the receiving flow.
 *
 * Response: { data: product, created: boolean, source: 'existing' | 'global' | 'manual' }
 */
export async function POST(req: NextRequest) {
  // Receivers/operations create these at the dock; owner/procurement too
  const auth = await requireAnyRole('owner', 'operations', 'procurement', 'receiver', 'manager')
  if (auth.error) return auth.error

  let body: any
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const barcode = String(body.barcode ?? '').trim()
  if (!barcode) {
    return NextResponse.json({ error: 'barcode is required' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // 1. Already in the catalog?
  const { data: existing } = await supabase
    .from('products')
    .select('id, sku, barcode, name, unit_of_measure, cost_method, reorder_point, needs_review, category:categories(name)')
    .eq('org_id', auth.orgId)
    .eq('barcode', barcode)
    .eq('is_active', true)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ data: existing, created: false, source: 'existing' })
  }

  // 2. Prefill from the global barcode catalog (name; category is text-only here)
  const external = await lookupBarcode(barcode)
  const suppliedName = String(body.name ?? '').trim()
  const name = suppliedName || external?.name || `Unknown item ${barcode}`
  const source = external?.found ? 'global' : 'manual'

  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase()
  const sku = `ITM-${datePart}-${rand}`

  const { data: created, error } = await supabase
    .from('products')
    .insert({
      org_id:          auth.orgId,
      sku,
      barcode,
      name,
      unit_of_measure: 'pc',
      cost_method:     'average',
      reorder_point:   0,
      attributes:      external?.brand ? { Brand: external.brand } : {},
      needs_review:    true,
      is_active:       true,
    })
    .select('id, sku, barcode, name, unit_of_measure, cost_method, reorder_point, needs_review')
    .single()

  if (error) {
    console.error('[POST /api/products/from-barcode]', error)
    return NextResponse.json({ error: 'Failed to create item from barcode' }, { status: 500 })
  }

  return NextResponse.json({ data: created, created: true, source }, { status: 201 })
}
