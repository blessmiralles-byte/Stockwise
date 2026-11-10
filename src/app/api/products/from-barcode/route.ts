import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAnyRole } from '@/lib/api-auth'
import { lookupBarcode } from '@/lib/barcode-lookup'
import { generateItemCode } from '@/lib/item-code'

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

  // Barcode is optional: the field "Add Item" / receive-by-search flows can
  // create an item by name alone. Require at least one of barcode or name.
  const barcode      = String(body.barcode ?? '').trim()
  const suppliedName = String(body.name ?? '').trim()
  if (!barcode && !suppliedName) {
    return NextResponse.json({ error: 'A barcode or an item name is required' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // 1. Already in the catalog? (only meaningful when we have a barcode to match)
  if (barcode) {
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
  }

  // 2. Prefill from the global barcode catalog (only when we have a barcode)
  const external = barcode ? await lookupBarcode(barcode) : null
  const name = suppliedName || external?.name || `Unknown item ${barcode}`
  const source = external?.found ? 'global' : 'manual'

  const sku = generateItemCode()

  // Optional details supplied by the field "Add Item" form (fall back to
  // sensible defaults for the pure scan-at-the-dock case).
  const unitOfMeasure = String(body.unit_of_measure ?? '').trim() || 'pc'
  const reorderPoint  = Number.isFinite(Number(body.reorder_point)) ? Number(body.reorder_point) : 0

  // Custom attributes (Color, Size, …). Keep only non-empty string pairs, merged
  // over any brand we prefilled from the global catalog.
  const suppliedAttrs: Record<string, string> = {}
  if (body.attributes && typeof body.attributes === 'object') {
    for (const [k, v] of Object.entries(body.attributes)) {
      const key = String(k).trim()
      const val = String(v ?? '').trim()
      if (key && val) suppliedAttrs[key] = val
    }
  }
  const attributes = { ...(external?.brand ? { Brand: external.brand } : {}), ...suppliedAttrs }

  const { data: created, error } = await supabase
    .from('products')
    .insert({
      org_id:          auth.orgId,
      sku,
      barcode:         barcode || null,
      name,
      unit_of_measure: unitOfMeasure,
      cost_method:     'average',
      reorder_point:   reorderPoint,
      attributes,
      needs_review:    true,
      is_active:       true,
    })
    .select('id, sku, barcode, name, unit_of_measure, cost_method, reorder_point, needs_review')
    .single()

  if (error) {
    // The barcode is already ours after all: an archived item (the lookup
    // above only matches active ones), or one created by someone scanning the
    // same delivery a moment ago. Receiving must not stop here — hand back
    // that item, and if it was archived, it's evidently back in use.
    if (error.code === '23505' && barcode) {
      const { data: held } = await supabase
        .from('products')
        .select('id, sku, barcode, name, unit_of_measure, cost_method, reorder_point, needs_review, is_active, category:categories(name)')
        .eq('org_id', auth.orgId)
        .eq('barcode', barcode)
        .maybeSingle()
      if (held) {
        if (!(held as any).is_active) {
          await supabase.from('products').update({ is_active: true }).eq('id', (held as any).id).eq('org_id', auth.orgId)
        }
        const { is_active: _ignored, ...product } = held as any
        return NextResponse.json({ data: product, created: false, source: 'existing' })
      }
    }
    console.error('[POST /api/products/from-barcode]', error)
    return NextResponse.json({ error: 'Failed to create item from barcode' }, { status: 500 })
  }

  return NextResponse.json({ data: created, created: true, source }, { status: 201 })
}
