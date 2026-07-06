import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAuth, requireAnyRole } from '@/lib/api-auth'
import { logAudit } from '@/lib/audit'

/**
 * GET /api/org — return the current user's organization details
 */
export async function GET() {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  if (!auth.orgId) {
    return NextResponse.json({ error: 'No organization found for this account' }, { status: 404 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('organizations')
    .select('id, name, slug, plan, plan_status, trial_ends_at, max_users, created_at')
    .eq('id', auth.orgId)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
  }

  return NextResponse.json({ data })
}

/**
 * PATCH /api/org — update organization name (owner only)
 */
export async function PATCH(req: NextRequest) {
  const auth = await requireAnyRole('owner')
  if (auth.error) return auth.error

  if (!auth.orgId) {
    return NextResponse.json({ error: 'No organization found for this account' }, { status: 404 })
  }

  let body: any
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const allowed = ['name']
  const updates: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }

  if ('name' in updates) {
    const name = String(updates.name).trim()
    if (!name || name.length < 2) {
      return NextResponse.json({ error: 'Organization name must be at least 2 characters' }, { status: 400 })
    }
    if (name.length > 100) {
      return NextResponse.json({ error: 'Organization name must be 100 characters or less' }, { status: 400 })
    }
    updates.name = name
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // One-time attribution stamp: signup carried first-touch channel data in the
  // owner's auth metadata; persist it on the org the first time it's updated
  // (i.e. during onboarding) so trials/customers can be reported by channel.
  try {
    const { data: org } = await supabase
      .from('organizations')
      .select('attribution')
      .eq('id', auth.orgId)
      .single()
    if (org && org.attribution == null) {
      const { data: userData } = await supabase.auth.admin.getUserById(auth.userId)
      const attribution = userData?.user?.user_metadata?.attribution
      if (attribution && typeof attribution === 'object') {
        updates.attribution = attribution
      }
    }
  } catch { /* attribution is best-effort — never block an org update on it */ }

  const { data, error } = await supabase
    .from('organizations')
    .update(updates)
    .eq('id', auth.orgId)
    .select('id, name, slug, plan, plan_status, trial_ends_at, max_users, created_at')
    .single()

  if (error) {
    console.error('[PATCH /api/org]', error)
    return NextResponse.json({ error: 'Failed to update organization' }, { status: 500 })
  }

  await logAudit({
    actorId:   auth.userId,
    orgId:     auth.orgId,
    action:    'user.role_change', // reusing closest existing audit type
    tableName: 'organizations',
    recordId:  auth.orgId,
    newValue:  updates,
  })

  return NextResponse.json({ data })
}
