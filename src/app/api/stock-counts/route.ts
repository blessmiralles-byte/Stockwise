import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAuth, requireRole } from '@/lib/api-auth'

// GET /api/stock-counts?status=open
export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')

  const supabase = createServiceClient()
  let query = supabase
    .from('stock_counts')
    .select(`*, location:locations(id, name)`)
    .eq('org_id', auth.orgId)
    .order('created_at', { ascending: false })

  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) {
    console.error('[GET /api/stock-counts]', error)
    return NextResponse.json({ error: 'Failed to fetch stock counts' }, { status: 500 })
  }

  return NextResponse.json({ data })
}

/**
 * POST /api/stock-counts
 * Creates a stock count and snapshots current inventory balances.
 */
export async function POST(req: NextRequest) {
  const auth = await requireRole('manager')
  if (auth.error) return auth.error

  const body = await req.json()
  const { location_id, notes } = body

  const supabase = createServiceClient()

  // H-3: Atomic DB sequence prevents duplicate count numbers under concurrency
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const { data: seqVal, error: seqErr } = await supabase
    .rpc('next_ref_number', { p_seq: 'public.stock_count_seq' })
  if (seqErr || seqVal == null) {
    console.error('[POST /api/stock-counts] sequence', seqErr?.message)
    return NextResponse.json({ error: 'Failed to generate count number' }, { status: 500 })
  }
  const count_number = `CC-${datePart}-${String(seqVal).padStart(4, '0')}`

  const { data: sc, error: scErr } = await supabase
    .from('stock_counts')
    .insert({
      org_id: auth.orgId,
      count_number,
      location_id: location_id || null,
      notes: notes?.trim() || null,
      created_by: auth.userId,
      status: 'open',
    })
    .select()
    .single()

  if (scErr) {
    console.error('[POST /api/stock-counts] header', scErr)
    return NextResponse.json({ error: 'Failed to create stock count' }, { status: 500 })
  }

  // Snapshot current inventory_balances as system_qty
  let balancesQuery = supabase
    .from('inventory_balances')
    .select('product_id, location_id, quantity')
    .eq('org_id', auth.orgId)

  if (location_id) balancesQuery = balancesQuery.eq('location_id', location_id)

  const { data: balances, error: balErr } = await balancesQuery
  if (balErr) {
    await supabase.from('stock_counts').delete().eq('id', sc.id)
    return NextResponse.json({ error: 'Failed to snapshot inventory' }, { status: 500 })
  }

  if (balances && balances.length > 0) {
    const lineRows = balances.map((b: any) => ({
      org_id: auth.orgId,
      stock_count_id: sc.id,
      product_id: b.product_id,
      location_id: b.location_id,
      system_qty: b.quantity,
      counted_qty: null,
    }))

    const { error: lineErr } = await supabase.from('stock_count_lines').insert(lineRows)
    if (lineErr) {
      await supabase.from('stock_counts').delete().eq('id', sc.id)
      return NextResponse.json({ error: 'Failed to snapshot stock count lines' }, { status: 500 })
    }
  }

  return NextResponse.json({ data: sc }, { status: 201 })
}
