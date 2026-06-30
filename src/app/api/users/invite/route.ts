import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAnyRole } from '@/lib/api-auth'
import { sendInviteEmail } from '@/lib/email'

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

  // Inviting owner's name (for the email — "invited by …")
  const { data: inviter } = await supabase
    .from('user_profiles')
    .select('full_name, email')
    .eq('id', auth.userId)
    .single()
  const inviterName = inviter?.full_name?.trim() || inviter?.email || 'The account owner'
  const businessName = org?.name ?? 'your team'

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

  const cleanEmail  = email.trim().toLowerCase()
  const inviteMeta  = {
    org_id:    auth.orgId,
    role:      role,
    full_name: full_name?.trim() ?? null,
  }
  const redirectTo = `${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/auth/callback`

  const alreadyRegistered = () =>
    NextResponse.json(
      { error: 'A Supabase account with that email already exists. Ask them to sign in.' },
      { status: 409 }
    )

  // When Resend is configured, generate the invite link ourselves and send a
  // branded email that names the owner and lists what this role can do. Falls
  // back to Supabase's default invite email when Resend is unavailable.
  let userId: string | null = null

  if (process.env.RESEND_API_KEY) {
    const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
      type:  'invite',
      email: cleanEmail,
      options: { data: inviteMeta, redirectTo },
    })

    if (linkErr) {
      console.error('[POST /api/users/invite] generateLink', linkErr)
      if (linkErr.message?.toLowerCase().includes('already')) return alreadyRegistered()
      return NextResponse.json({ error: linkErr.message }, { status: 500 })
    }

    userId = linkData.user?.id ?? null
    const actionLink = (linkData.properties as any)?.action_link

    try {
      await sendInviteEmail({
        to: cleanEmail,
        inviterName,
        businessName,
        role,
        actionLink,
      })
    } catch (mailErr) {
      console.error('[POST /api/users/invite] sendInviteEmail', mailErr)
      // User exists; surface a soft failure so the owner can resend
      return NextResponse.json(
        { error: 'Invite created but the email failed to send. Please try again.' },
        { status: 502 }
      )
    }
  } else {
    // Fallback: Supabase sends its default invite email
    const { data: inviteData, error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(
      cleanEmail,
      { data: inviteMeta, redirectTo }
    )
    if (inviteErr) {
      console.error('[POST /api/users/invite]', inviteErr)
      if (inviteErr.message?.toLowerCase().includes('already registered')) return alreadyRegistered()
      return NextResponse.json({ error: inviteErr.message }, { status: 500 })
    }
    userId = inviteData.user?.id ?? null
  }

  return NextResponse.json({
    data: {
      email:   cleanEmail,
      role,
      user_id: userId,
    },
    message: `Invitation sent to ${email}`,
  }, { status: 201 })
}
