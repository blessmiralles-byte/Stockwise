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
  if ('name'           in body) updates.name           = body.name?.trim()
  if ('code'           in body) updates.code           = body.code?.trim()?.toUpperCase()
  if ('description'    in body) updates.description    = body.description?.trim()    || null
  if ('billing_entity' in body) updates.billing_entity = body.billing_entity?.trim() || null
  if ('address'        in body) updates.address        = body.address?.trim()        || null
  if ('contact_name'   in body) updates.contact_name   = body.contact_name?.trim()   || null
  if ('contact_phone'  in body) updates.contact_phone  = body.contact_phone?.trim()  || null
  if ('contact_email'  in body) updates.contact_email  = body.contact_email?.trim()  || null
  if ('is_active'      in body) updates.is_active      = !!body.is_active

  if ('name' in updates && !updates.name) return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 })
  if ('code' in updates && !updates.code) return NextResponse.json({ error: 'code cannot be empty' }, { status: 400 })
  if (Object.keys(updates).length === 0)  return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('job_codes')
    .update(updates)
    .eq('id', id)
    .eq('org_id', auth.orgId)
    .select('id, code, name, description, billing_entity, address, contact_name, contact_phone, contact_email, is_active')
    .single()

  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'That code is already in use' }, { status: 409 })
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ data })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAnyRole('owner', 'operations', 'procurement')
  if (auth.error) return auth.error

  const { id } = await params
  const supabase = createServiceClient()
  const { error } = await supabase
    .from('job_codes')
    .update({ is_active: false })
    .eq('id', id)
    .eq('org_id', auth.orgId)

  if (error) return NextResponse.json({ error: 'Failed to delete' }, { status: 500 })
  return NextResponse.json({ success: true })
}
