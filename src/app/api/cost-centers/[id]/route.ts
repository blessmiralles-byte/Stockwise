import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAnyRole } from '@/lib/api-auth'

/** PATCH /api/cost-centers/:id */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAnyRole('owner', 'finance', 'procurement')
  if (auth.error) return auth.error

  const { id } = await params
  let body: any
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const allowed = ['code', 'name', 'description', 'is_active']
  const updates: Record<string, unknown> = {}
  for (const k of allowed) {
    if (k in body) updates[k] = body[k]
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }
  if ('code' in updates) updates.code = String(updates.code).trim().toUpperCase()

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('cost_centers')
    .update(updates)
    .eq('id', id)
    .eq('org_id', auth.orgId)
    .select('id, code, name, description, is_active')
    .single()

  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'Code already in use' }, { status: 409 })
    return NextResponse.json({ error: 'Failed to update cost center' }, { status: 500 })
  }
  return NextResponse.json({ data })
}
