import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAnyRole } from '@/lib/api-auth'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAnyRole('owner', 'operations', 'procurement')
  if (auth.error) return auth.error

  const { id } = await params
  let body: any
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const updates: Record<string, any> = {}
  if ('name' in body) updates.name = body.name?.trim()
  if ('type' in body) updates.type = body.type

  if ('name' in updates && !updates.name) return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 })
  if (Object.keys(updates).length === 0)  return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('categories')
    .update(updates)
    .eq('id', id)
    .eq('org_id', auth.orgId)
    .select('id, name, type')
    .single()

  if (error) return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ data })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAnyRole('owner', 'operations', 'procurement')
  if (auth.error) return auth.error

  const { id } = await params
  const supabase = createServiceClient()

  // Soft-nullify: unset category on products and assets that use it
  await supabase.from('products').update({ category_id: null }).eq('org_id', auth.orgId).eq('category_id', id)
  await supabase.from('fixed_assets').update({ category_id: null }).eq('org_id', auth.orgId).eq('category_id', id)

  const { error } = await supabase.from('categories').delete().eq('id', id).eq('org_id', auth.orgId)
  if (error) return NextResponse.json({ error: 'Failed to delete' }, { status: 500 })
  return NextResponse.json({ success: true })
}
