import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * GET /api/jobledger/products?org_id=xxx[&q=search][&limit=50]
 *
 * Product catalog enriched with last PO price + supplier info.
 * Used by JobLedger's BOM (Bill of Materials) planning screen.
 *
 * Response shape matches StockedProduct in JobLedger's stockedClient.ts.
 * Auth: Authorization: Bearer {JOBLEDGER_API_KEY}
 */
export async function GET(req: NextRequest) {
  const apiKey = process.env.JOBLEDGER_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'JOBLEDGER_API_KEY is not configured' }, { status: 503 })
  }
  if (req.headers.get('authorization') !== `Bearer ${apiKey}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = req.nextUrl
  const orgId  = searchParams.get('org_id')
  const search = searchParams.get('q')?.trim()
  const limit  = Math.min(Number(searchParams.get('limit') ?? '50'), 200)

  if (!orgId) return NextResponse.json({ error: 'org_id is required' }, { status: 400 })

  const supabase = createServiceClient()

  // ── 1. Fetch products ────────────────────────────────────────────────────────
  let prodQ = supabase
    .from('products')
    .select('id, name, sku, unit_of_measure')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .order('name')
    .limit(limit)

  if (search) prodQ = prodQ.or(`name.ilike.%${search}%,sku.ilike.%${search}%`)

  const { data: products, error: prodErr } = await prodQ
  if (prodErr) {
    console.error('[GET /api/jobledger/products] products', prodErr)
    return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 })
  }
  if (!products || products.length === 0) {
    return NextResponse.json({ products: [] })
  }

  const productIds = products.map((p: any) => p.id as string)

  // ── 2. Fetch latest PO line per product (with supplier) ──────────────────────
  const { data: poLines, error: poErr } = await supabase
    .from('purchase_order_lines')
    .select(`
      product_id,
      unit_cost,
      purchase_order:purchase_orders(
        created_at,
        supplier:suppliers(name, lead_time_days, payment_terms)
      )
    `)
    .eq('org_id', orgId)
    .in('product_id', productIds)
    .order('created_at', { referencedTable: 'purchase_orders', ascending: false })

  if (poErr) {
    console.error('[GET /api/jobledger/products] po lines', poErr)
    // Non-fatal — return products without pricing
  }

  // Build latest-PO map per product
  const poMap = new Map<string, {
    unitCost:       number
    supplierName:   string | null
    leadTimeDays:   number | null
    paymentTerms:   string | null
  }>()

  for (const line of (poLines ?? []) as any[]) {
    const pid = line.product_id as string
    if (poMap.has(pid)) continue   // already captured most recent
    const po       = Array.isArray(line.purchase_order) ? line.purchase_order[0] : line.purchase_order
    const supplier = po ? (Array.isArray(po.supplier) ? po.supplier[0] : po.supplier) : null
    poMap.set(pid, {
      unitCost:     Number(line.unit_cost),
      supplierName: supplier?.name          ?? null,
      leadTimeDays: supplier?.lead_time_days ?? null,
      paymentTerms: supplier?.payment_terms  ?? null,
    })
  }

  // ── 3. Combine ────────────────────────────────────────────────────────────────
  const result = (products as any[]).map(p => {
    const po = poMap.get(p.id)
    return {
      productId:       p.id,
      productName:     p.name,
      sku:             p.sku,
      unitOfMeasure:   p.unit_of_measure,
      lastPoPrice:     po?.unitCost       ?? null,
      supplierName:    po?.supplierName   ?? null,
      leadTimeDays:    po?.leadTimeDays   ?? null,
      paymentTerms:    po?.paymentTerms   ?? null,   // string e.g. "Net 30"
    }
  })

  return NextResponse.json({ products: result }, { headers: { 'Cache-Control': 'no-store' } })
}
