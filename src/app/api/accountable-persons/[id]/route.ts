import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAnyRole } from '@/lib/api-auth'

/**
 * PATCH /api/accountable-persons/[id]  — update name / department / email / phone
 * DELETE /api/accountable-persons/[id] — remove person (fails if assigned to any asset)
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

  const allowed = ['name', 'employee_no', 'department', 'email', 'phone']
  const updates: Record<string, any> = {}
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]?.trim() || null
  }

  if ('name' in updates && !updates.name) {
    return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 })
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('accountable_persons')
    .update(updates)
    .eq('id', id)
    .eq('org_id', auth.orgId)  // org isolation
    .select('id, name, employee_no, department, email, phone')
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'That employee number is already used by another person.' }, { status: 409 })
    }
    console.error('[PATCH /api/accountable-persons/[id]]', error)
    return NextResponse.json({ error: 'Failed to update person' }, { status: 500 })
  }

  if (!data) return NextResponse.json({ error: 'Person not found' }, { status: 404 })

  return NextResponse.json({ data })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAnyRole('owner', 'operations')
  if (auth.error) return auth.error

  const { id } = await params
  const supabase = createServiceClient()

  // Prevent deletion if person is still assigned to any asset
  const { count } = await supabase
    .from('fixed_assets')
    .select('*', { count: 'exact', head: true })
    .eq('org_id', auth.orgId)
    .eq('accountable_person_id', id)

  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: `Cannot delete — this person is assigned to ${count} asset${count === 1 ? '' : 's'}. Reassign them first.` },
      { status: 409 }
    )
  }

  const { error } = await supabase
    .from('accountable_persons')
    .delete()
    .eq('id', id)
    .eq('org_id', auth.orgId)

  if (error) {
    console.error('[DELETE /api/accountable-persons/[id]]', error)
    return NextResponse.json({ error: 'Failed to delete person' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
