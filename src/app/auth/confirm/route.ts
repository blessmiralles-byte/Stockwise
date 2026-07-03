import { NextRequest, NextResponse } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /auth/confirm?token_hash=...&type=invite&next=/reset-password
 *
 * Server-side verification for email links (invite, recovery, signup, magic
 * link). Unlike the hash-fragment flow, the token_hash arrives as a query
 * param the server can read: we verify it, which sets the session cookie, then
 * redirect the now-signed-in user onward (invited users go set a password).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type       = searchParams.get('type') as EmailOtpType | null
  const next       = searchParams.get('next') ?? '/dashboard'

  if (token_hash && type) {
    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({ type, token_hash })
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
    console.error('[auth/confirm] verifyOtp', error.message)
  }

  return NextResponse.redirect(`${origin}/login?error=invite_link_invalid`)
}
