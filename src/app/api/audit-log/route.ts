import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAnyRole } from '@/lib/api-auth'

/**
 * GET /api/audit-log
 *
 * Returns paginated audit log entries, newest first.
 * Restricted to owner, admin, and finance roles (SOD — auditors only).
 *
 * Query params:
 *   page      number   (default 1)
 *   limit     number   (default 50, max 200)
 *   action    string   filter by action type prefix
 *   actor_id  uuid     filter by user
 *   from      date     ISO date (inclusive)
 *   to        date     ISO date (inclusive)
 */
export async function GET(req: NextRequest) {
  const auth = await requireAnyRole('owner', 'admin', 'finance')
  if (auth.error) return auth.error

  const sp    = req.nextUrl.searchParams
  const page  = Math.max(1, Number(sp.get('page')  ?? 1))
  const limit = Math.min(200, Math.max(1, Number(sp.get('limit') ?? 50)))
  const from  = sp.get('from')
  const to    = sp.get('to')
  const action   = sp.get('action')   ?? ''
  const actorId  = sp.get('actor_id') ?? ''

  const supabase = createServiceClient()
  const offset   = (page - 1) * limit

  let query = supabase
    .from('audit_log')
    .select(`
      id, action, actor_id, table_name, record_id, old_value, new_value, created_at
    `, { count: 'exact' })
    .eq('org_id', auth.orgId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (action)  query = query.ilike('action', `${action}%`)
  if (actorId) query = query.eq('actor_id', actorId)
  if (from)    query = query.gte('created_at', `${from}T00:00:00`)
  if (to)      query = query.lte('created_at', `${to}T23:59:59`)

  const { data, error, count } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const actorIds = [...new Set((data ?? []).map(r => r.actor_id).filter(Boolean))]
  let actorMap: Record<string, { id: string; full_name: string; role: string }> = {}
  if (actorIds.length > 0) {
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('user_id, full_name, role')
      .in('user_id', actorIds)
    for (const p of profiles ?? []) {
      actorMap[p.user_id] = { id: p.user_id, full_name: p.full_name, role: p.role }
    }
  }

  const enriched = (data ?? []).map(r => ({
    ...r,
    actor: r.actor_id ? actorMap[r.actor_id] ?? { id: r.actor_id, full_name: 'Unknown', role: '' } : null,
  }))

  return NextResponse.json({
    data: enriched,
    meta: { page, limit, total: count ?? 0, pages: Math.ceil((count ?? 0) / limit) },
  })
}
