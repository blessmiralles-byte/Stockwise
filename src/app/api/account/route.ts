import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAuth } from '@/lib/api-auth'
import { claimTrialEmail } from '@/lib/trial-claims'
import { purgeOrganization } from '@/lib/org-purge'

/**
 * DELETE /api/account
 * Permanently deletes the caller's account (Google Play data-deletion
 * requirement + privacy compliance).
 *
 *   - Owner  → deletes the entire organization and ALL its data, and removes
 *              every member's login. (An owner's account is the workspace.)
 *   - Member → deletes only their own login; the organization is untouched.
 *
 * Cannot be undone. The client signs out afterward.
 */
export async function DELETE() {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const supabase = createServiceClient()

  const { data: me } = await supabase
    .from('user_profiles')
    .select('id, role, org_id, email')
    .eq('id', auth.userId)
    .single()

  if (!me) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 })
  }

  const isOwner = me.role === 'owner' || me.role === 'admin'

  try {
    if (isOwner && me.org_id) {
      // The free trial is one per person: record this owner's email before the
      // account disappears, so deleting and signing up again doesn't hand out
      // another one. Only a hash is stored.
      if (me.email) await claimTrialEmail(supabase, me.email, me.org_id)

      // Removes the organization's data, then — only once that is confirmed
      // gone — each member's login. Scoped to the caller's own org_id.
      const purged = await purgeOrganization(supabase, me.org_id)
      if (!purged.ok) {
        // Nothing has been removed and nobody is locked out. Say so plainly
        // rather than report a deletion that did not happen.
        console.error('[DELETE /api/account] purge failed for org', me.org_id, '-', purged.error)
        return NextResponse.json(
          { error: 'We could not delete your account. Nothing has been removed. Please contact support.' },
          { status: 500 },
        )
      }
    } else {
      // Member: delete only this login.
      await supabase.auth.admin.deleteUser(auth.userId)
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[DELETE /api/account]', err)
    return NextResponse.json({ error: 'Failed to delete account. Please contact support.' }, { status: 500 })
  }
}
