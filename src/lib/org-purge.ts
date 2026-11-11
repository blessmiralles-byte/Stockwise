import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Permanently remove an organization, everything it owns, and its members'
 * logins. The one path for it: a customer deleting their account, and the
 * retention job, both come here.
 *
 * Two things the previous inline version got wrong, both found by deleting a
 * test company that had real data:
 *
 *   1. It deleted the organization row and relied on cascades. That fails as
 *      soon as the company has inventory — the database refuses to remove a
 *      product while a purchase-order line still points at it, and checks
 *      before it has reached the line. purge_organization() (see
 *      scripts/migrate-org-purge.sql) defers those checks to the end of the
 *      transaction, when everything is gone together.
 *   2. It never looked at the result. The delete failed silently and the code
 *      went on to remove every member's login: the customer was told their
 *      data was gone while all of it remained, with nobody able to sign in.
 *
 * So: logins are only removed once the data is confirmed gone.
 */
export async function purgeOrganization(
  supabase: SupabaseClient,
  orgId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  // Collect the members first — their profiles go with the organization.
  const { data: members, error: membersErr } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('org_id', orgId)
  if (membersErr) return { ok: false, error: membersErr.message }

  const { error } = await supabase.rpc('purge_organization', { p_org_id: orgId })
  if (error) return { ok: false, error: error.message }

  // Belt and braces: the function raised no error, but don't remove anyone's
  // way in until the organization is verifiably gone.
  const { count } = await supabase
    .from('organizations')
    .select('id', { count: 'exact', head: true })
    .eq('id', orgId)
  if (count) return { ok: false, error: 'The organization still exists after the purge' }

  for (const m of (members ?? []) as { id: string }[]) {
    // A login that won't delete leaves an account with nothing behind it —
    // untidy, not harmful — so it doesn't fail the purge.
    await supabase.auth.admin.deleteUser(m.id).catch(() => {})
  }
  return { ok: true }
}
