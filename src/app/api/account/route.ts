import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAuth } from '@/lib/api-auth'

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
    .select('id, role, org_id')
    .eq('id', auth.userId)
    .single()

  if (!me) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 })
  }

  const isOwner = me.role === 'owner' || me.role === 'admin'

  try {
    if (isOwner && me.org_id) {
      // Collect every member before we remove the org.
      const { data: members } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('org_id', me.org_id)

      // Deleting the organization cascades all org-scoped data
      // (org_id … ON DELETE CASCADE across the tenant tables).
      await supabase.from('organizations').delete().eq('id', me.org_id)

      // Remove each member's auth login (cascades their user_profiles row).
      for (const m of members ?? []) {
        await supabase.auth.admin.deleteUser(m.id).catch(() => {})
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
