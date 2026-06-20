import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAuth, requireAnyRole } from '@/lib/api-auth'

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const { searchParams } = req.nextUrl
  const type = searchParams.get('type')

  const supabase = createServiceClient()

  let query = supabase.from('categories').select('id, name, type').eq('org_id', auth.orgId).order('name')
  if (type) query = query.eq('type', type)

  const { data, error } = await query
  if (error) {
    console.error('[GET /api/categories]', error)
    return NextResponse.json({ error: 'Failed to fetch categories' }, { status: 500 })
  }

  return NextResponse.json({ data: data ?? [] })
}

/**
 * POST /api/categories — create a new category
 * Body: { name: string, type?: 'inventory' | 'asset' | 'both' }
 * Restricted to: owner, operations, procurement
 */
export async function POST(req: NextRequest) {
  const auth = await requireAnyRole('owner', 'operations', 'procurement')
  if (auth.error) return auth.error

  let body: any
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const name = body.name?.trim()
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })

  const VALID_TYPES = ['inventory', 'fixed_asset', 'both']
  const type = body.type ?? 'inventory'
  if (!VALID_TYPES.includes(type)) {
    return NextResponse.json({ error: `type must be one of: ${VALID_TYPES.join(', ')}` }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Duplicate check within org + type
  const { data: existing } = await supabase
    .from('categories')
    .select('id')
    .eq('org_id', auth.orgId)
    .ilike('name', name)
    .eq('type', type)
    .single()

  if (existing) {
    return NextResponse.json({ error: `A "${type}" category named "${name}" already exists` }, { status: 409 })
  }

  const { data, error } = await supabase
    .from('categories')
    .insert({ org_id: auth.orgId, name, type })
    .select('id, name, type')
    .single()

  if (error) {
    console.error('[POST /api/categories]', error)
    return NextResponse.json({ error: error.message ?? 'Failed to create category' }, { status: 500 })
  }

  return NextResponse.json({ data }, { status: 201 })
}
