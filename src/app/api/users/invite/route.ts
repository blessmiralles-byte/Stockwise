import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAnyRole } from '@/lib/api-auth'

/**
 * POST /api/users/invite
 * Invites a new team member to the current organization.
 *
 * Body: { email: string, role: string, full_name?: string }
 *
 * Uses Supabase Admin API to send an invite email.
 * The invited user's metadata includes org_id and role so that
 * handle_new_user() automatically joins the correct org.
 *
 * Restricted to: owner
 */
export async function POST(req: NextRequest) {
  const auth = await requireAnyRole('owner')
  if (auth.error) return auth.error

  if (!auth.orgId) {
    return NextResponse.json({ error: 'No organization found' }, { status: 400 })
  }

  let body: any
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { email, role = 'viewer', full_name } = body

  if (!email?.trim()) {
    return NextResponse.json({ error: 'email is required' }, { status: 400 })
  }

  const validRoles = ['owner', 'procurement', 'operations', 'receiver', 'finance', 'viewer']
  if (!validRoles.includes(role)) {
    return NextResponse.json(
      { error: `role must be one of: ${validRoles.join(', ')}` },
      { status: 400 }
    )
  }

  // Check current user count against plan limit
  const supabase = createServiceClient()
  const { count: currentUsers } = await supabase
    .from('user_profiles')
    .select('*', { count: 'exact', head: true })
    .eq('org_id', auth.orgId)
    .eq('is_active', true)

  const { data: org } = await supabase
    .from('organizations')
    .select('max_users, name')
    .eq('id', auth.orgId)
    .single()

  if (org && (currentUsers ?? 0) >= (org.max_users ?? 5)) {
    return NextResponse.json(
      { error: `Your plan allows up to ${org.max_users} users. Upgrade to invite more.` },
      { status: 403 }
    )
  }

  // Check if user already exists with this email in this org
  const { data: existing } = await supabase
    .from('user_profiles')
    .select('id, email')
    .eq('org_id', auth.orgId)
    .ilike('email', email.trim())
    .single()

  if (existing) {
    return NextResponse.json({ error: 'A user with that email is already in your organization' }, { status: 409 })
  }

  // Send Supabase invite — metadata tells handle_new_user() to join this org
  const { data: inviteData, error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(
    email.trim().toLowerCase(),
    {
      data: {
        org_id:    auth.orgId,
        role:      role,
        full_name: full_name?.trim() ?? null,
      },
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/auth/callback`,
    }
  )

  if (inviteErr) {
    console.error('[POST /api/users/invite]', inviteErr)
    // "User already registered" is a common case
    if (inviteErr.message?.toLowerCase().includes('already registered')) {
      return NextResponse.json(
        { error: 'A Supabase account with that email already exists. Ask them to sign in.' },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: inviteErr.message }, { status: 500 })
  }

  return NextResponse.json({
    data: {
      email:   email.trim().toLowerCase(),
      role,
      user_id: inviteData.user?.id ?? null,
    },
    message: `Invitation sent to ${email}`,
  }, { status: 201 })
}
