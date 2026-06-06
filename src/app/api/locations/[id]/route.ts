import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAnyRole } from '@/lib/api-auth'

/**
 * PATCH /api/locations/[id] — update name, code, type, address
 * DELETE /api/locations/[id] — soft-delete (sets is_active = false)
 *
 * Restricted to: owner, operations
 */

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAnyRole('owner', 'operations')
  if (auth.error) return auth.error

  const { id } = await params

  let body: any
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const VALID_TYPES = ['warehouse', 'office', 'store', 'room', 'shelf', 'other']
  const updates: Record<string, any> = {}

  if ('name'    in body) updates.name    = body.name?.trim()
  if ('code'    in body) updates.code    = body.code?.trim()?.toUpperCase()
  if ('type'    in body) updates.type    = body.type
  if ('address' in body) updates.address = body.address?.trim() || null

  if ('name' in updates && !updates.name) {
    return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 })
  }
  if ('code' in updates && !updates.code) {
    return NextResponse.json({ error: 'code cannot be empty' }, { status: 400 })
  }
  if ('type' in updates && !VALID_TYPES.includes(updates.type)) {
    return NextResponse.json({ error: `type must be one of: ${VALID_TYPES.join(', ')}` }, { status: 400 })
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Check for duplicate code (excluding this record)
  if (updates.code) {
    const { data: dup } = await supabase
      .from('locations')
      .select('id')
      .eq('org_id', auth.orgId)
      .eq('code', updates.code)
      .neq('id', id)
      .single()

    if (dup) {
      return NextResponse.json({ error: `Location code "${updates.code}" is already in use` }, { status: 409 })
    }
  }

  const { data, error } = await supabase
    .from('locations')
    .update(updates)
    .eq('id', id)
    .eq('org_id', auth.orgId)
    .select('id, name, code, type, level, parent_id, address, is_active')
    .single()

  if (error) {
    console.error('[PATCH /api/locations/[id]]', error)
    return NextResponse.json({ error: 'Failed to update location' }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: 'Location not found' }, { status: 404 })

  return NextResponse.json({ data })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAnyRole('owner', 'operations')
  if (auth.error) return auth.error

  const { id } = await params
  const supabase = createServiceClient()

  // Block if there is stock at this location or any child
  const { data: allLocs } = await supabase
    .from('locations')
    .select('id, parent_id')
    .eq('org_id', auth.orgId)

  function descendants(pid: string): string[] {
    const kids = (allLocs ?? []).filter(l => l.parent_id === pid)
    return [pid, ...kids.flatMap(k => descendants(k.id))]
  }

  const ids = descendants(id)

  const { count: stockCount } = await supabase
    .from('inventory_balances')
    .select('*', { count: 'exact', head: true })
    .eq('org_id', auth.orgId)
    .in('location_id', ids)
    .gt('quantity', 0)

  if ((stockCount ?? 0) > 0) {
    return NextResponse.json(
      { error: 'Cannot delete — this location has stock. Transfer inventory out first.' },
      { status: 409 }
    )
  }

  // Soft delete: mark inactive
  const { error } = await supabase
    .from('locations')
    .update({ is_active: false })
    .eq('id', id)
    .eq('org_id', auth.orgId)

  if (error) {
    console.error('[DELETE /api/locations/[id]]', error)
    return NextResponse.json({ error: 'Failed to delete location' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
