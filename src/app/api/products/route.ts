import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAuth, requireAnyRole } from '@/lib/api-auth'

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const { searchParams } = req.nextUrl
  const search = searchParams.get('q') ?? ''

  const supabase = createServiceClient()

  let query = supabase
    .from('products')
    .select('id, sku, barcode, name, unit_of_measure, cost_method, attributes, track_expiry, reorder_point, category:categories(id, name)')
    .eq('org_id', auth.orgId)
    .eq('is_active', true)
    .order('name')

  if (search) {
    query = query.or(`name.ilike.%${search}%,sku.ilike.%${search}%`)
  }

  const { data, error } = await query.limit(100)
  if (error) {
    console.error('[GET /api/products]', error)
    return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 })
  }

  return NextResponse.json({ data: data ?? [] })
}

export async function POST(req: NextRequest) {
  const auth = await requireAnyRole('owner', 'operations', 'procurement', 'manager')
  if (auth.error) return auth.error

  let body: any
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { barcode, name, category_id, unit_of_measure, cost_method, reorder_point, attributes, track_expiry } = body
  let { sku } = body

  if (!name?.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 422 })
  }

  // Auto-generate SKU if not supplied
  if (!sku?.trim()) {
    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const rand = Math.random().toString(36).slice(2, 6).toUpperCase()
    sku = `ITM-${datePart}-${rand}`
  } else {
    sku = sku.trim()
  }

  // M-2 style: basic field validation
  if (reorder_point != null && (!Number.isInteger(reorder_point) || reorder_point < 0)) {
    return NextResponse.json({ error: 'reorder_point must be a non-negative integer' }, { status: 422 })
  }

  const validMethods = ['average', 'fifo']
  if (cost_method && !validMethods.includes(cost_method)) {
    return NextResponse.json({ error: `cost_method must be one of: ${validMethods.join(', ')}` }, { status: 422 })
  }

  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('products')
    .insert({
      org_id:          auth.orgId,
      sku,
      barcode:         barcode ?? null,
      name:            name.trim(),
      category_id:     category_id ?? null,
      unit_of_measure: unit_of_measure ?? 'pc',
      cost_method:     cost_method ?? 'average',
      reorder_point:   reorder_point ?? 0,
      attributes:      attributes ?? {},
      track_expiry:    track_expiry ?? false,
      is_active:       true,
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'An item with that SKU already exists' }, { status: 409 })
    }
    console.error('[POST /api/products]', error)
    return NextResponse.json({ error: 'Failed to create product' }, { status: 500 })
  }

  return NextResponse.json({ data }, { status: 201 })
}
