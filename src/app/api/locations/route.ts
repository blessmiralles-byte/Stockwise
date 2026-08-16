import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAuth, requireAnyRole } from '@/lib/api-auth'

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const { searchParams } = req.nextUrl
  const all = searchParams.get('all') === 'true'

  const supabase = createServiceClient()

  if (all) {
    const { data, error } = await supabase
      .from('locations')
      .select('id, name, code, type, level, parent_id, is_active')
      .eq('org_id', auth.orgId)
      .eq('is_active', true)
      .eq('is_transit', false)   // hide the system In-Transit holding location
      .order('level')
      .order('name')

    if (error) {
      console.error('[GET /api/locations]', error)
      return NextResponse.json({ error: 'Failed to fetch locations' }, { status: 500 })
    }
    return NextResponse.json({ data: data ?? [] })
  }

  // Top-level with item counts
  const { data: locations, error } = await supabase
    .from('locations')
    .select('id, name, code, address, type, level')
    .eq('org_id', auth.orgId)
    .eq('is_active', true)
    .eq('is_transit', false)   // hide the system In-Transit holding location
    .is('parent_id', null)
    .order('name')

  if (error) {
    console.error('[GET /api/locations]', error)
    return NextResponse.json({ error: 'Failed to fetch locations' }, { status: 500 })
  }

  const { data: allLocs } = await supabase
    .from('locations')
    .select('id, parent_id')
    .eq('org_id', auth.orgId)
    .eq('is_active', true)

  const { data: balances } = await supabase
    .from('inventory_balances')
    .select('location_id, quantity, avg_cost')
    .eq('org_id', auth.orgId)

  function getDescendants(parentId: string, all: typeof allLocs): string[] {
    const children = (all ?? []).filter(l => l.parent_id === parentId)
    return [parentId, ...children.flatMap(c => getDescendants(c.id, all))]
  }

  const data = (locations ?? []).map(loc => {
    const ids = new Set(getDescendants(loc.id, allLocs))
    const locBalances = (balances ?? []).filter(b => ids.has(b.location_id))
    const items = locBalances.reduce((s, b) => s + b.quantity, 0)
    const value = locBalances.reduce((s, b) => s + b.quantity * b.avg_cost, 0)
    return { ...loc, items, value }
  })

  return NextResponse.json({ data, count: data.length })
}

/**
 * POST /api/locations — create a new location
 * Restricted to: owner, operations
 */
export async function POST(req: NextRequest) {
  const auth = await requireAnyRole('owner', 'operations')
  if (auth.error) return auth.error

  let body: any
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const name = body.name?.trim()
  const code = body.code?.trim()?.toUpperCase()

  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })
  if (!code) return NextResponse.json({ error: 'code is required' }, { status: 400 })

  const VALID_TYPES = ['building', 'floor', 'warehouse', 'office', 'store', 'room', 'shelf', 'vehicle', 'other']
  const type = body.type ?? 'other'
  if (!VALID_TYPES.includes(type)) {
    return NextResponse.json({ error: `type must be one of: ${VALID_TYPES.join(', ')}` }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Resolve parent + compute level
  let level     = 0
  let parent_id = body.parent_id || null

  if (parent_id) {
    const { data: parent } = await supabase
      .from('locations')
      .select('id, level')
      .eq('id', parent_id)
      .eq('org_id', auth.orgId)
      .single()

    if (!parent) return NextResponse.json({ error: 'Parent location not found' }, { status: 404 })
    level = (parent.level ?? 0) + 1
  }

  // Check for duplicate code within the org
  const { data: existing } = await supabase
    .from('locations')
    .select('id')
    .eq('org_id', auth.orgId)
    .eq('code', code)
    .single()

  if (existing) {
    return NextResponse.json({ error: `Location code "${code}" already exists in this organization` }, { status: 409 })
  }

  const { data, error } = await supabase
    .from('locations')
    .insert({
      org_id:    auth.orgId,
      name,
      code,
      type,
      level,
      parent_id,
      address:   body.address?.trim() || null,
      is_active: true,
    })
    .select('id, name, code, type, level, parent_id, address, is_active')
    .single()

  if (error) {
    console.error('[POST /api/locations]', error)
    return NextResponse.json({ error: 'Failed to create location' }, { status: 500 })
  }

  return NextResponse.json({ data }, { status: 201 })
}
