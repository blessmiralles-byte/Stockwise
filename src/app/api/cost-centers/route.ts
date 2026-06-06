import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAuth, requireAnyRole } from '@/lib/api-auth'

/** GET /api/cost-centers — all authenticated users */
export async function GET(_req: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('cost_centers')
    .select('id, code, name, description, is_active')
    .eq('org_id', auth.orgId)
    .order('code')

  if (error) return NextResponse.json({ error: 'Failed to fetch cost centers' }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}

/** POST /api/cost-centers — owner / procurement / finance only */
export async function POST(req: NextRequest) {
  const auth = await requireAnyRole('owner', 'finance', 'procurement')
  if (auth.error) return auth.error

  let body: any
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { code, name, description } = body
  if (!code?.trim() || !name?.trim()) {
    return NextResponse.json({ error: 'code and name are required' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('cost_centers')
    .insert({ org_id: auth.orgId, code: code.trim().toUpperCase(), name: name.trim(), description: description?.trim() ?? null, created_by: auth.userId })
    .select('id, code, name, description, is_active')
    .single()

  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: `Code "${code.toUpperCase()}" already exists` }, { status: 409 })
    return NextResponse.json({ error: 'Failed to create cost center' }, { status: 500 })
  }
  return NextResponse.json({ data }, { status: 201 })
}
