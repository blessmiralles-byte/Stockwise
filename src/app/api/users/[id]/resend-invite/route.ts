import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAnyRole } from '@/lib/api-auth'
import { sendInviteEmail } from '@/lib/email'

/**
 * POST /api/users/:id/resend-invite  (owner only)
 *
 * Re-sends the invitation to a member who has never signed in. The original
 * invite link is single-use and expires, so this issues a fresh sign-in link
 * that lands them on the set-password page, same as the first invite.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAnyRole('owner')
  if (auth.error) return auth.error

  const { id } = await params
  const supabase = createServiceClient()

  const { data: member } = await supabase
    .from('user_profiles')
    .select('id, email, role, is_active')
    .eq('id', id)
    .eq('org_id', auth.orgId)
    .maybeSingle()
  if (!member?.email) return NextResponse.json({ error: 'Member not found' }, { status: 404 })
  if (member.is_active === false) {
    return NextResponse.json({ error: 'Reactivate this member before resending their invite' }, { status: 400 })
  }

  const { data: au } = await supabase.auth.admin.getUserById(id)
  if (au?.user?.last_sign_in_at) {
    return NextResponse.json({ error: 'This member has already set up their account' }, { status: 400 })
  }

  const email = member.email.toLowerCase()

  if (process.env.RESEND_API_KEY) {
    const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email,
    })
    const hashedToken = (linkData?.properties as any)?.hashed_token
    if (linkErr || !hashedToken) {
      console.error('[resend-invite] generateLink', linkErr)
      return NextResponse.json({ error: linkErr?.message ?? 'Could not create an invite link' }, { status: 500 })
    }
    const actionLink =
      `${req.nextUrl.origin}/auth/confirm?token_hash=${encodeURIComponent(hashedToken)}` +
      `&type=magiclink&next=${encodeURIComponent('/reset-password')}`

    const [{ data: org }, { data: inviter }] = await Promise.all([
      supabase.from('organizations').select('name').eq('id', auth.orgId).single(),
      supabase.from('user_profiles').select('full_name, email').eq('id', auth.userId).single(),
    ])
    try {
      await sendInviteEmail({
        to: email,
        inviterName: inviter?.full_name?.trim() || inviter?.email || 'The account owner',
        businessName: org?.name ?? 'your team',
        role: member.role ?? 'viewer',
        actionLink,
      })
    } catch (mailErr) {
      console.error('[resend-invite] sendInviteEmail', mailErr)
      return NextResponse.json(
        { error: `The email could not be sent: ${(mailErr as Error)?.message ?? 'unknown error'}` },
        { status: 502 },
      )
    }
  } else {
    // No branded sender configured: fall back to Supabase's password email,
    // which lets them set a password and sign in.
    const redirectTo = `${process.env.NEXT_PUBLIC_SITE_URL ?? req.nextUrl.origin}/reset-password`
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ message: `Invite re-sent to ${email}` })
}
