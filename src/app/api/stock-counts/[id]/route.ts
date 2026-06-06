import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAuth } from '@/lib/api-auth'

// GET /api/stock-counts/:id
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const { id } = await params
  const supabase = createServiceClient()

  const { data: sc, error: scErr } = await supabase
    .from('stock_counts')
    .select(`*, location:locations(id, name, code, type, level, parent:locations(id, name, code))`)
    .eq('id', id)
    .eq('org_id', auth.orgId)
    .single()

  if (scErr || !sc) {
    return NextResponse.json({ error: 'Stock count not found' }, { status: 404 })
  }

  const { data: lines, error: lineErr } = await supabase
    .from('stock_count_lines')
    .select(`
      *,
      product:products(id, sku, name, unit_of_measure, category:categories(name)),
      location:locations(
        id, name, code, type, level,
        parent:locations(
          id, name, code, type, level,
          parent:locations(id, name, code, type, level)
        )
      )
    `)
    .eq('stock_count_id', id)
    .order('location_id')
    .order('product_id')

  if (lineErr) {
    return NextResponse.json({ error: 'Failed to fetch count lines' }, { status: 500 })
  }

  return NextResponse.json({ data: { ...sc, lines: lines ?? [] } })
}

/**
 * PATCH /api/stock-counts/:id
 * Two uses:
 *  1. Update counted_qty for lines: { lines: [{ line_id, counted_qty }] }
 *  2. Update status: { status: 'counting' | 'reviewing' | 'cancelled' }
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const { id } = await params
  const body = await req.json()
  const supabase = createServiceClient()

  if ('status' in body) {
    const allowed = ['counting', 'reviewing', 'cancelled']
    if (!allowed.includes(body.status)) {
      return NextResponse.json({ error: `Invalid status. Use: ${allowed.join(', ')}` }, { status: 400 })
    }
    const { data, error } = await supabase
      .from('stock_counts')
      .update({ status: body.status })
      .eq('id', id)
      .eq('org_id', auth.orgId)
      .select()
      .single()
    if (error) return NextResponse.json({ error: 'Failed to update status' }, { status: 500 })
    return NextResponse.json({ data })
  }

  if (Array.isArray(body.lines)) {
    const errors: string[] = []
    for (const l of body.lines) {
      if (!l.line_id || l.counted_qty == null || l.counted_qty < 0) {
        errors.push(`line ${l.line_id}: invalid counted_qty`)
        continue
      }
      const { error } = await supabase
        .from('stock_count_lines')
        .update({ counted_qty: l.counted_qty })
        .eq('id', l.line_id)
        .eq('stock_count_id', id)

      if (error) errors.push(`line ${l.line_id}: ${error.message}`)
    }

    if (errors.length > 0) {
      return NextResponse.json({ error: errors.join('; ') }, { status: 400 })
    }
    return NextResponse.json({ data: { updated: body.lines.length } })
  }

  return NextResponse.json({ error: 'Provide status or lines to update' }, { status: 400 })
}
