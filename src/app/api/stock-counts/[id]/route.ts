import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAuth } from '@/lib/api-auth'
import { createNotification } from '@/lib/notify'
import { sendPushToUsers } from '@/lib/push'

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

  const { data: attendees } = await supabase
    .from('stock_count_attendees')
    .select('id, user_id, name, is_external, confirmation_status, confirmed_at, note')
    .eq('stock_count_id', id)
    .order('is_external', { ascending: true })
    .order('name', { ascending: true })

  return NextResponse.json({ data: { ...sc, lines: lines ?? [], attendee_list: attendees ?? [] } })
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
      .select('id, count_number, org_id')
      .single()
    if (error) return NextResponse.json({ error: 'Failed to update status' }, { status: 500 })

    // Submitting for review → ask each team-member attendee to confirm the
    // count on their mobile app (in-app notification + Expo push).
    if (body.status === 'reviewing') {
      const { data: attendees } = await supabase
        .from('stock_count_attendees')
        .select('user_id')
        .eq('stock_count_id', id)
        .eq('is_external', false)
        .eq('confirmation_status', 'pending')
        .not('user_id', 'is', null)

      const userIds = (attendees ?? []).map((a: any) => a.user_id).filter(Boolean)
      if (userIds.length > 0) {
        const title = `Confirm stock count ${data.count_number}`
        const bodyText = 'Please confirm the counted quantities match what you counted.'
        await createNotification({
          userId: userIds,
          orgId: data.org_id ?? auth.orgId,
          type: 'stock_count.confirm',
          title,
          body: bodyText,
          data: { stock_count_id: id, count_number: data.count_number },
          actionUrl: `/stock-counts/${id}`,
        })
        await sendPushToUsers(userIds, {
          title,
          body: bodyText,
          data: { type: 'stock_count.confirm', stock_count_id: id, count_number: data.count_number },
        })
      }
    }

    return NextResponse.json({ data })
  }

  // Live counting: add / update counted quantities by product (item + qty)
  if (Array.isArray(body.add)) {
    const { data: sc } = await supabase
      .from('stock_counts')
      .select('location_id, org_id')
      .eq('id', id)
      .eq('org_id', auth.orgId)
      .single()
    if (!sc?.location_id) {
      return NextResponse.json({ error: 'Count location not found' }, { status: 400 })
    }

    for (const a of body.add) {
      const productId = a.product_id
      const countedQty = Number(a.counted_qty)
      if (!productId || !Number.isFinite(countedQty) || countedQty < 0) continue

      const { data: existing } = await supabase
        .from('stock_count_lines')
        .select('id')
        .eq('stock_count_id', id)
        .eq('product_id', productId)
        .eq('location_id', sc.location_id)
        .maybeSingle()

      if (existing) {
        await supabase.from('stock_count_lines')
          .update({ counted_qty: countedQty })
          .eq('id', existing.id)
      } else {
        // Item not in the snapshot (system shows zero here) — add at system_qty 0
        const { data: bal } = await supabase
          .from('inventory_balances')
          .select('quantity')
          .eq('product_id', productId)
          .eq('location_id', sc.location_id)
          .maybeSingle()
        await supabase.from('stock_count_lines').insert({
          org_id: sc.org_id ?? auth.orgId,
          stock_count_id: id,
          product_id: productId,
          location_id: sc.location_id,
          system_qty: Number(bal?.quantity ?? 0),
          counted_qty: countedQty,
        })
      }
    }
    return NextResponse.json({ data: { added: body.add.length } })
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
