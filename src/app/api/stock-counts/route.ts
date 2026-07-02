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
  const { location_id, notes, counts } = body

  // Location is required — a count is always scoped to one place
  if (!location_id) {
    return NextResponse.json({ error: 'A location is required' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Attendees: team members (each must confirm from their mobile app) plus
  // external people such as auditors (free text, no confirmation required).
  const userIds: string[] = Array.isArray(body.attendee_user_ids)
    ? body.attendee_user_ids.filter(Boolean)
    : []
  const externalNames: string[] = Array.isArray(body.external_attendees)
    ? body.external_attendees.map((s: any) => String(s).trim()).filter(Boolean)
    : Array.isArray(body.attendees)   // legacy field
      ? body.attendees.map((s: any) => String(s).trim()).filter(Boolean)
      : []

  if (userIds.length + externalNames.length === 0) {
    return NextResponse.json({ error: 'Log at least one person present during the count' }, { status: 400 })
  }

  // Resolve team-member display names
  let userAttendees: { user_id: string; name: string }[] = []
  if (userIds.length > 0) {
    const { data: profs } = await supabase
      .from('user_profiles')
      .select('id, full_name, email')
      .eq('org_id', auth.orgId)
      .in('id', userIds)
    userAttendees = (profs ?? []).map((p: any) => ({
      user_id: p.id,
      name: p.full_name?.trim() || p.email || 'Team member',
    }))
  }

  const allNames = [...userAttendees.map(u => u.name), ...externalNames]

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
      location_id,
      attendees: allNames.join(', '),
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

  // Attendee rows: users start 'pending' (must confirm), externals 'not_required'
  const attendeeRows = [
    ...userAttendees.map(u => ({
      org_id: auth.orgId, stock_count_id: sc.id, user_id: u.user_id,
      name: u.name, is_external: false, confirmation_status: 'pending',
    })),
    ...externalNames.map(n => ({
      org_id: auth.orgId, stock_count_id: sc.id, user_id: null,
      name: n, is_external: true, confirmation_status: 'not_required',
    })),
  ]
  if (attendeeRows.length > 0) {
    await supabase.from('stock_count_attendees').insert(attendeeRows)
  }

  // Snapshot current inventory_balances at this location as system_qty
  const { data: balances, error: balErr } = await supabase
    .from('inventory_balances')
    .select('product_id, location_id, quantity')
    .eq('org_id', auth.orgId)
    .eq('location_id', location_id)

  if (balErr) {
    await supabase.from('stock_counts').delete().eq('id', sc.id)
    return NextResponse.json({ error: 'Failed to snapshot inventory' }, { status: 500 })
  }

  const systemByProduct = new Map<string, number>()
  if (balances && balances.length > 0) {
    const lineRows = balances.map((b: any) => {
      systemByProduct.set(b.product_id, Number(b.quantity))
      return {
        org_id: auth.orgId,
        stock_count_id: sc.id,
        product_id: b.product_id,
        location_id: b.location_id,
        system_qty: b.quantity,
        counted_qty: null,
      }
    })

    const { error: lineErr } = await supabase.from('stock_count_lines').insert(lineRows)
    if (lineErr) {
      await supabase.from('stock_counts').delete().eq('id', sc.id)
      return NextResponse.json({ error: 'Failed to snapshot stock count lines' }, { status: 500 })
    }
  }

  // Apply any counted items entered during creation. Items not in the snapshot
  // (system shows zero stock here) are added as new lines with system_qty 0.
  if (Array.isArray(counts) && counts.length > 0) {
    for (const c of counts) {
      const productId = c.product_id
      const countedQty = Number(c.counted_qty)
      if (!productId || !Number.isFinite(countedQty) || countedQty < 0) continue

      if (systemByProduct.has(productId)) {
        await supabase
          .from('stock_count_lines')
          .update({ counted_qty: countedQty })
          .eq('stock_count_id', sc.id)
          .eq('product_id', productId)
          .eq('location_id', location_id)
      } else {
        await supabase.from('stock_count_lines').insert({
          org_id: auth.orgId,
          stock_count_id: sc.id,
          product_id: productId,
          location_id,
          system_qty: 0,
          counted_qty: countedQty,
        })
        systemByProduct.set(productId, 0)
      }
    }

    // Counting has begun — move it out of 'open'
    await supabase.from('stock_counts').update({ status: 'counting' }).eq('id', sc.id)
    sc.status = 'counting'
  }

  return NextResponse.json({ data: sc }, { status: 201 })
}
