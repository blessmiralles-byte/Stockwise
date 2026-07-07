import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAuth } from '@/lib/api-auth'
import { lookupBarcode } from '@/lib/barcode-lookup'

/**
 * GET /api/scan/resolve?q=<any_code>
 *
 * Universal barcode / reference resolver.
 * Accepts ANY code string and searches across all entity types in priority order:
 *
 *   1. products       — barcode field (exact)
 *   2. products       — SKU (exact, case-insensitive)
 *   3. fixed_assets   — barcode field (exact)
 *   4. fixed_assets   — asset_tag (exact, case-insensitive)
 *   5. locations      — code (exact, case-insensitive)
 *   6. requisitions   — req_number (exact)
 *   7. purchase_orders— po_number (exact)
 *   8. stock_counts   — count_number (exact)
 *
 * Response shape:
 * {
 *   type:       'product' | 'asset' | 'location' | 'requisition' | 'purchase_order' | 'stock_count'
 *   id:         string
 *   display:    string          — human-readable name/title
 *   code:       string          — the matched code
 *   match_field: string         — which field matched
 *   action_url: string          — page to navigate to after scan
 *   data:       object          — full entity record (subset)
 * }
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const q = req.nextUrl.searchParams.get('q')?.trim()
  if (!q) return NextResponse.json({ error: 'q param is required' }, { status: 400 })

  const supabase = createServiceClient()
  const upper    = q.toUpperCase()

  // ── 1 & 2: Products (barcode OR SKU) ──────────────────────────────────────
  const { data: productByBarcode } = await supabase
    .from('products')
    .select(`
      id, sku, barcode, name, unit_of_measure, is_active,
      category:categories(id, name),
      inventory_balances(quantity, avg_cost,
        location:locations(id, name, code)
      )
    `)
    .eq('org_id', auth.orgId)
    .eq('barcode', q)
    .eq('is_active', true)
    .single()

  if (productByBarcode) {
    return NextResponse.json({ data: formatProduct(productByBarcode, q, 'barcode') })
  }

  const { data: productBySku } = await supabase
    .from('products')
    .select(`
      id, sku, barcode, name, unit_of_measure, is_active,
      category:categories(id, name),
      inventory_balances(quantity, avg_cost,
        location:locations(id, name, code)
      )
    `)
    .eq('org_id', auth.orgId)
    .ilike('sku', q)
    .eq('is_active', true)
    .single()

  if (productBySku) {
    return NextResponse.json({ data: formatProduct(productBySku, q, 'sku') })
  }

  // ── 3 & 4: Fixed assets (barcode OR asset_tag) ────────────────────────────
  const { data: assetByBarcode } = await supabase
    .from('fixed_assets')
    .select(`
      id, asset_tag, barcode, name, status, serial_number,
      purchase_cost, current_value, depreciation_method,
      category:categories(id, name),
      location:locations(id, name, code),
      accountable_person:accountable_persons(id, name, department)
    `)
    .eq('org_id', auth.orgId)
    .eq('barcode', q)
    .single()

  if (assetByBarcode) {
    return NextResponse.json({ data: formatAsset(assetByBarcode, q, 'barcode') })
  }

  const { data: assetByTag } = await supabase
    .from('fixed_assets')
    .select(`
      id, asset_tag, barcode, name, status, serial_number,
      purchase_cost, current_value, depreciation_method,
      category:categories(id, name),
      location:locations(id, name, code),
      accountable_person:accountable_persons(id, name, department)
    `)
    .eq('org_id', auth.orgId)
    .ilike('asset_tag', q)
    .single()

  if (assetByTag) {
    return NextResponse.json({ data: formatAsset(assetByTag, q, 'asset_tag') })
  }

  // ── 5: Location ───────────────────────────────────────────────────────────
  const { data: location } = await supabase
    .from('locations')
    .select('id, name, code, type, address')
    .eq('org_id', auth.orgId)
    .ilike('code', q)
    .single()

  if (location) {
    return NextResponse.json({
      data: {
        type:        'location',
        id:          location.id,
        display:     location.name,
        code:        location.code,
        match_field: 'code',
        action_url:  `/locations`,
        data: location,
      }
    })
  }

  // ── 6: Requisition ────────────────────────────────────────────────────────
  const { data: requisition } = await supabase
    .from('requisitions')
    .select('id, req_number, type, status, created_at, requested_by:user_profiles!requested_by(full_name)')
    .eq('org_id', auth.orgId)
    .ilike('req_number', q)
    .single()

  if (requisition) {
    return NextResponse.json({
      data: {
        type:        'requisition',
        id:          (requisition as any).id,
        display:     (requisition as any).req_number,
        code:        (requisition as any).req_number,
        match_field: 'req_number',
        action_url:  `/requisitions`,
        data:        requisition,
      }
    })
  }

  // ── 7: Purchase Order ─────────────────────────────────────────────────────
  const { data: po } = await supabase
    .from('purchase_orders')
    .select('id, po_number, status, created_at, supplier:suppliers(name)')
    .eq('org_id', auth.orgId)
    .ilike('po_number', q)
    .single()

  if (po) {
    return NextResponse.json({
      data: {
        type:        'purchase_order',
        id:          po.id,
        display:     po.po_number,
        code:        po.po_number,
        match_field: 'po_number',
        action_url:  `/purchase-orders/${po.id}`,
        data:        po,
      }
    })
  }

  // ── 8: Stock Count ────────────────────────────────────────────────────────
  const { data: sc } = await supabase
    .from('stock_counts')
    .select('id, count_number, status, created_at, location:locations(name)')
    .eq('org_id', auth.orgId)
    .ilike('count_number', q)
    .single()

  if (sc) {
    return NextResponse.json({
      data: {
        type:        'stock_count',
        id:          sc.id,
        display:     sc.count_number,
        code:        sc.count_number,
        match_field: 'count_number',
        action_url:  `/stock-counts/${sc.id}`,
        data:        sc,
      }
    })
  }

  // ── Not in this org — try the global barcode catalog before giving up ──────
  const external = await lookupBarcode(q)
  if (external?.found) {
    return NextResponse.json({
      data: {
        type:        'external_barcode',
        id:          null,
        display:     external.name ?? q,
        code:        q,
        match_field: 'global_catalog',
        // Prefill the New Item form
        action_url:  `/inventory/new?barcode=${encodeURIComponent(q)}&name=${encodeURIComponent(external.name ?? '')}`,
        data: {
          barcode:   q,
          name:      external.name ?? null,
          brand:     external.brand ?? null,
          category:  external.category ?? null,
          image_url: external.image_url ?? null,
          source:    external.source,
          in_catalog: false,
        },
      },
    })
  }

  // ── Nothing found anywhere ──────────────────────────────────────────────────
  return NextResponse.json(
    { data: null, error: `No record found for code: ${q}` },
    { status: 404 }
  )
}

// ── Formatters ────────────────────────────────────────────────────────────────
function formatProduct(p: any, q: string, matchField: string) {
  const balances   = (p.inventory_balances ?? []) as any[]
  const totalQty   = balances.reduce((s: number, b: any) => s + Number(b.quantity), 0)
  const stockStatus = totalQty === 0 ? 'out_of_stock' : totalQty <= 5 ? 'low_stock' : 'in_stock'

  return {
    type:        'product',
    id:          p.id,
    display:     p.name,
    code:        q,
    match_field: matchField,
    action_url:  `/inventory`,
    data: {
      id:           p.id,
      sku:          p.sku,
      barcode:      p.barcode,
      name:         p.name,
      unit:         p.unit_of_measure,
      category:     p.category?.name ?? null,
      total_qty:    totalQty,
      stock_status: stockStatus,
      balances:     balances.map((b: any) => ({
        location_id:   b.location?.id,
        location_name: b.location?.name,
        location_code: b.location?.code,
        quantity:      Number(b.quantity),
        avg_cost:      Number(b.avg_cost),
      })),
    },
  }
}

function formatAsset(a: any, q: string, matchField: string) {
  return {
    type:        'asset',
    id:          a.id,
    display:     a.name,
    code:        q,
    match_field: matchField,
    action_url:  `/assets`,
    data: {
      id:                 a.id,
      asset_tag:          a.asset_tag,
      barcode:            a.barcode,
      name:               a.name,
      status:             a.status,
      serial_number:      a.serial_number,
      category:           a.category?.name ?? null,
      location:           a.location?.name ?? null,
      location_id:        a.location?.id   ?? null,
      accountable_person: a.accountable_person?.name ?? null,
      purchase_cost:      Number(a.purchase_cost ?? 0),
      current_value:      Number(a.current_value ?? 0),
    },
  }
}
