import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAnyRole } from '@/lib/api-auth'
import { logAudit } from '@/lib/audit'

// PATCH /api/users/:id — update role or is_active (owner only)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAnyRole('owner')
  if (auth.error) return auth.error

  const { id } = await params
  const body = await req.json()

  // Prevent owner from demoting themselves — would lock them out
  if (id === auth.userId && 'role' in body && !['owner', 'admin'].includes(body.role)) {
    return NextResponse.json({ error: 'You cannot change your own role' }, { status: 400 })
  }

  // Prevent deactivating yourself
  if (id === auth.userId && 'is_active' in body && body.is_active === false) {
    return NextResponse.json({ error: 'You cannot deactivate your own account' }, { status: 400 })
  }

  const allowed = ['role', 'is_active', 'full_name']
  const updates: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }

  if ('role' in updates) {
    const validRoles = ['owner', 'procurement', 'operations', 'receiver', 'finance', 'viewer', 'admin', 'manager']
    if (!validRoles.includes(updates.role as string)) {
      return NextResponse.json(
        { error: 'Invalid role. Use: owner, procurement, operations, receiver, finance, or viewer' },
        { status: 400 }
      )
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Fetch current values before update for audit trail (must be in same org)
  const { data: before } = await supabase
    .from('user_profiles')
    .select('role, is_active, full_name')
    .eq('id', id)
    .eq('org_id', auth.orgId)
    .single()

  if (!before) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const { data, error } = await supabase
    .from('user_profiles')
    .update(updates)
    .eq('id', id)
    .eq('org_id', auth.orgId)
    .select()
    .single()

  if (error) {
    console.error('[PATCH /api/users/:id]', error.code)
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 })
  }

  // M-4: Audit log — record sensitive user management actions
  if ('role' in updates) {
    await logAudit({
      actorId:   auth.userId,
      orgId:     auth.orgId,
      action:    'user.role_change',
      tableName: 'user_profiles',
      recordId:  id,
      oldValue:  { role: before?.role },
      newValue:  { role: updates.role },
    })
  }
  if ('is_active' in updates) {
    await logAudit({
      actorId:   auth.userId,
      orgId:     auth.orgId,
      action:    updates.is_active ? 'user.reactivate' : 'user.deactivate',
      tableName: 'user_profiles',
      recordId:  id,
      oldValue:  { is_active: before?.is_active },
      newValue:  { is_active: updates.is_active },
    })
  }

  return NextResponse.json({ data })
}
