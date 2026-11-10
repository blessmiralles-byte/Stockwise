import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAuth } from '@/lib/api-auth'
import { requireFeature } from '@/lib/entitlements-server'

/**
 * GET /api/assets/checkouts?status=pending|out|overdue|returned|rejected|all
 *
 * List tool checkouts for the approvals queue, the overdue view and the
 * history report.
 *   pending  — awaiting approval
 *   out      — currently checked out
 *   overdue  — 'out' and past due_at
 *   all      — every checkout, newest first: the custody history
 *
 * History can be narrowed with ?from=YYYY-MM-DD&to=YYYY-MM-DD (by the date
 * the tool went out) and is capped, so it stays bounded as the log grows.
 */
const HISTORY_LIMIT = 1000

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const sp = req.nextUrl.searchParams
  const status = sp.get('status') ?? 'pending'
  // The full history is part of paid Stocked Tools; what's out now is not.
  if (status === 'all') {
    const gate = await requireFeature(auth.orgId, 'tool_reports')
    if (gate) return gate
  }

  const supabase = createServiceClient()

  let query = supabase
    .from('asset_checkouts')
    .select(`
      id, status, holder_name, job_code, job_reference, due_at, notes,
      checked_out_at, approved_at, returned_at, return_condition, return_note,
      asset:fixed_assets(id, asset_tag, name),
      holder:accountable_persons!holder_person_id(id, name, employee_no),
      requester:user_profiles!checked_out_by(id, full_name)
    `)
    .eq('org_id', auth.orgId)
    .order('checked_out_at', { ascending: false })
    .limit(status === 'all' ? HISTORY_LIMIT : 200)

  if (status === 'overdue') {
    query = query.eq('status', 'out').not('due_at', 'is', null).lt('due_at', new Date().toISOString())
  } else if (['pending', 'out', 'returned', 'rejected'].includes(status)) {
    query = query.eq('status', status)
  }

  const from = sp.get('from')
  const to   = sp.get('to')
  const isDate = (v: string | null): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v)
  if (isDate(from)) query = query.gte('checked_out_at', `${from}T00:00:00.000Z`)
  if (isDate(to))   query = query.lte('checked_out_at', `${to}T23:59:59.999Z`)

  const { data, error } = await query
  if (error) {
    console.error('[GET /api/assets/checkouts]', error)
    return NextResponse.json({ error: 'Failed to fetch checkouts' }, { status: 500 })
  }

  const rows = data ?? []
  return NextResponse.json({
    data: rows,
    // The report says so when there is more history than it is showing.
    truncated: status === 'all' && rows.length === HISTORY_LIMIT ? true : undefined,
  })
}
