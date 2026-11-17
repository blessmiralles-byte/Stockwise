import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAnyRole } from '@/lib/api-auth'
import { logAudit } from '@/lib/audit'

/**
 * DELETE /api/api-keys/:id — revoke a key. It stops working immediately.
 * The row is kept (revoked_at set) so the history stays readable.
 * Restricted to: owner
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAnyRole('owner')
  if (auth.error) return auth.error
  const { id } = await params

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('api_keys')
    .update({ revoked_at: new Date().toISOString(), revoked_by: auth.userId })
    .eq('id', id)
    .eq('org_id', auth.orgId)
    .is('revoked_at', null)
    .select('id, name, scope, key_prefix')
    .maybeSingle()

  if (error) {
    console.error('[DELETE /api/api-keys]', error.message)
    return NextResponse.json({ error: 'Could not revoke the key' }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: 'Key not found, or already revoked' }, { status: 404 })

  await logAudit({
    actorId: auth.userId, orgId: auth.orgId ?? undefined, action: 'api_key.revoke',
    tableName: 'api_keys', recordId: data.id, oldValue: { name: data.name, scope: data.scope, key_prefix: data.key_prefix },
  })

  return NextResponse.json({ ok: true })
}
