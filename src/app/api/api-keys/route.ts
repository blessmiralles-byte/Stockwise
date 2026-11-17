import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAnyRole } from '@/lib/api-auth'
import { orgHasFeature } from '@/lib/entitlements-server'
import { logAudit } from '@/lib/audit'
import { generateApiKey, isApiKeyScope, API_KEY_SCOPES, SCOPE_INFO } from '@/lib/api-keys'

/** Active keys per organization; plenty for a till, a bookkeeping app and JobLedger. */
const MAX_ACTIVE_KEYS = 10

/**
 * GET /api/api-keys — this organization's keys (never the key itself).
 * Restricted to: owner
 */
export async function GET() {
  const auth = await requireAnyRole('owner')
  if (auth.error) return auth.error

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('api_keys')
    .select('id, name, scope, key_prefix, created_at, last_used_at, revoked_at')
    .eq('org_id', auth.orgId)
    .order('created_at', { ascending: false })
  if (error) {
    console.error('[GET /api/api-keys]', error.message)
    return NextResponse.json({ error: 'Could not load API keys' }, { status: 500 })
  }

  // Which scopes this plan allows, so the screen can offer only those.
  const allowed: Record<string, boolean> = {}
  for (const s of API_KEY_SCOPES) allowed[s] = await orgHasFeature(auth.orgId!, SCOPE_INFO[s].feature)

  return NextResponse.json({ data, allowed_scopes: allowed })
}

/**
 * POST /api/api-keys — create a key. Body: { name: string, scope: 'pos' | 'accounting' | 'jobledger' }
 * Returns the full key ONCE; only its hash is stored.
 * Restricted to: owner
 */
export async function POST(req: NextRequest) {
  const auth = await requireAnyRole('owner')
  if (auth.error) return auth.error

  let body: any
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const name  = String(body?.name ?? '').trim().slice(0, 80)
  const scope = body?.scope
  if (!name)                return NextResponse.json({ error: 'Give the key a name, e.g. "Shop till".' }, { status: 400 })
  if (!isApiKeyScope(scope)) return NextResponse.json({ error: `scope must be one of: ${API_KEY_SCOPES.join(', ')}` }, { status: 400 })

  if (!(await orgHasFeature(auth.orgId!, SCOPE_INFO[scope].feature))) {
    return NextResponse.json({ error: `${SCOPE_INFO[scope].label} keys need a plan with this integration.` }, { status: 403 })
  }

  const supabase = createServiceClient()
  const { count } = await supabase
    .from('api_keys').select('id', { count: 'exact', head: true })
    .eq('org_id', auth.orgId).is('revoked_at', null)
  if ((count ?? 0) >= MAX_ACTIVE_KEYS) {
    return NextResponse.json({ error: `You already have ${MAX_ACTIVE_KEYS} active keys. Revoke one you no longer use first.` }, { status: 409 })
  }

  const { key, hash, prefix } = generateApiKey(scope)
  const { data, error } = await supabase
    .from('api_keys')
    .insert({ org_id: auth.orgId, name, scope, key_prefix: prefix, key_hash: hash, created_by: auth.userId })
    .select('id, name, scope, key_prefix, created_at, last_used_at, revoked_at')
    .single()
  if (error) {
    console.error('[POST /api/api-keys]', error.message)
    return NextResponse.json({ error: 'Could not create the key' }, { status: 500 })
  }

  await logAudit({
    actorId: auth.userId, orgId: auth.orgId ?? undefined, action: 'api_key.create',
    tableName: 'api_keys', recordId: data.id, newValue: { name, scope, key_prefix: prefix },
  })

  return NextResponse.json({ data, key }, { status: 201 })
}
