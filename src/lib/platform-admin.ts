'server only'

import { NextResponse } from 'next/server'
import { resolveUserId } from '@/lib/api-auth'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * The people who run Stocked itself, as opposed to the owners of customer
 * companies. Every customer who signs up is an "owner", so a role check is
 * not enough for anything that looks across companies.
 *
 * PLATFORM_ADMIN_EMAILS: comma-separated, case-insensitive. Unset = nobody.
 */
export function platformAdminEmails(raw = process.env.PLATFORM_ADMIN_EMAILS): string[] {
  return (raw ?? '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
}

export function isPlatformAdminEmail(email: string | null | undefined, raw?: string): boolean {
  if (!email) return false
  return platformAdminEmails(raw).includes(email.trim().toLowerCase())
}

/**
 * Signed-in, confirmed email, and on the list. Anyone else gets a plain 404 so
 * the route's existence is not advertised.
 */
export async function requirePlatformAdmin(): Promise<{ error: NextResponse | null; email?: string }> {
  const notFound = { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) }
  if (platformAdminEmails().length === 0) return notFound

  const userId = await resolveUserId()
  if (!userId) return notFound

  const { data, error } = await createServiceClient().auth.admin.getUserById(userId)
  const user = data?.user
  if (error || !user?.email || !user.email_confirmed_at) return notFound
  if (!isPlatformAdminEmail(user.email)) return notFound
  return { error: null, email: user.email }
}
