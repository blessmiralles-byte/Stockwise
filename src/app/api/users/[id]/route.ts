import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAnyRole } from '@/lib/api-auth'
import { logAudit } from '@/lib/audit'
import { handOverApprovals } from '@/lib/approval-chain'

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

  const allowed = ['role', 'is_active', 'full_name', 'job_title', 'reports_to', 'requisition_approval_limit', 'po_approval_limit']
  const updates: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }

  // Job title is free text ("Buyer", "Purchasing Officer"); blank clears it.
  if ('job_title' in updates) {
    const t = String(updates.job_title ?? '').trim().slice(0, 80)
    updates.job_title = t || null
  }

  // A member can't report to themselves; blank clears the reporting line.
  if ('reports_to' in updates) {
    if (!updates.reports_to) updates.reports_to = null
    else if (updates.reports_to === id) {
      return NextResponse.json({ error: 'A member cannot report to themselves' }, { status: 400 })
    }
  }
  // Approval limits: non-negative number, or null to clear (no authority).
  for (const key of ['requisition_approval_limit', 'po_approval_limit'] as const) {
    if (key in updates) {
      if (updates[key] === null || updates[key] === '' || updates[key] === undefined) {
        updates[key] = null
      } else {
        const n = Number(updates[key])
        if (!Number.isFinite(n) || n < 0) {
          return NextResponse.json({ error: 'Approval limits must be a non-negative amount' }, { status: 400 })
        }
        updates[key] = n
      }
    }
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
    .select('role, is_active, full_name, reports_to')
    .eq('id', id)
    .eq('org_id', auth.orgId)
    .single()

  if (!before) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  if ('full_name' in updates) {
    const name = String(updates.full_name ?? '').trim().slice(0, 100)
    updates.full_name = name || null
  }

  // Reactivating takes a seat back — respect the plan's user limit.
  if (updates.is_active === true && before.is_active === false) {
    const [{ count }, { data: org }] = await Promise.all([
      supabase.from('user_profiles').select('*', { count: 'exact', head: true })
        .eq('org_id', auth.orgId).eq('is_active', true),
      supabase.from('organizations').select('max_users').eq('id', auth.orgId).single(),
    ])
    if (org && (count ?? 0) >= (org.max_users ?? 5)) {
      return NextResponse.json(
        { error: `Your plan allows up to ${org.max_users} active users. Deactivate someone or upgrade to restore this member.` },
        { status: 403 },
      )
    }
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

  // Deactivating hands their work over so nothing is left stuck with them:
  // approvals waiting on them move up their reporting line, and anyone who
  // reported to them now reports to their manager. History keeps their name.
  let message: string | undefined
  if (updates.is_active === false && before.is_active !== false) {
    const moved = await handOverApprovals(supabase, auth.orgId, id)
    const { data: reports } = await supabase
      .from('user_profiles')
      .update({ reports_to: before.reports_to && before.reports_to !== id ? before.reports_to : null })
      .eq('org_id', auth.orgId)
      .eq('reports_to', id)
      .select('id')
    const parts = [
      moved ? `${moved} pending approval${moved === 1 ? '' : 's'} reassigned` : null,
      reports?.length ? `${reports.length} direct report${reports.length === 1 ? '' : 's'} moved to their manager` : null,
    ].filter(Boolean)
    message = `${before.full_name || 'Member'} deactivated${parts.length ? ' — ' + parts.join(', ') : ''}.`
  }

  return NextResponse.json({ data, message })
}
