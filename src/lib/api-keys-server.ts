'server only'

import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireFeature } from '@/lib/entitlements-server'
import { apiKeyFromHeader, hashApiKey, scopeOfKey, SCOPE_INFO, type ApiKeyScope } from '@/lib/api-keys'

export type ApiKeyAuth =
  | { ok: true;  orgId: string; keyId: string }
  | { ok: false; error: NextResponse }

const unauthorized = () =>
  NextResponse.json({ error: 'Unauthorized: send an API key from Settings → API keys as "Authorization: Bearer stk_…".' }, { status: 401 })

/**
 * Authenticate a machine caller by its per-organization API key.
 *
 * - The key must exist, not be revoked, and carry `scope`.
 * - The organization comes from the key. If the caller also names an org id
 *   (older clients such as JobLedger send `org_id`), it must match — a
 *   mismatch is refused rather than silently ignored, so a misconfigured
 *   client finds out.
 * - The organization's plan must include the scope's feature.
 */
export async function authenticateApiKey(
  authorization: string | null,
  scope: ApiKeyScope,
  claimedOrgId?: string | null,
): Promise<ApiKeyAuth> {
  const key = apiKeyFromHeader(authorization)
  if (!key) return { ok: false, error: unauthorized() }
  if (scopeOfKey(key) !== scope) {
    return {
      ok: false,
      error: NextResponse.json({ error: `This key is for ${SCOPE_INFO[scopeOfKey(key)!].label}, not ${SCOPE_INFO[scope].label}.` }, { status: 403 }),
    }
  }

  const supabase = createServiceClient()
  const { data: row, error } = await supabase
    .from('api_keys')
    .select('id, org_id, scope, revoked_at, last_used_at')
    .eq('key_hash', hashApiKey(key))
    .maybeSingle()

  if (error) {
    console.error('[api-keys] lookup failed:', error.message)
    return { ok: false, error: NextResponse.json({ error: 'Could not check the API key. Please try again.' }, { status: 503 }) }
  }
  if (!row || row.revoked_at || row.scope !== scope) return { ok: false, error: unauthorized() }

  if (claimedOrgId && claimedOrgId !== row.org_id) {
    return {
      ok: false,
      error: NextResponse.json({ error: 'org_id does not match the organization this API key belongs to.' }, { status: 403 }),
    }
  }

  const gate = await requireFeature(row.org_id, SCOPE_INFO[scope].feature)
  if (gate) return { ok: false, error: gate }

  // Record use at most once a minute per key; never block the request on it.
  const last = row.last_used_at ? Date.parse(row.last_used_at) : 0
  if (Date.now() - last > 60_000) {
    supabase.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', row.id)
      .then(({ error: e }) => { if (e) console.error('[api-keys] last_used_at:', e.message) })
  }

  return { ok: true, orgId: row.org_id, keyId: row.id }
}
