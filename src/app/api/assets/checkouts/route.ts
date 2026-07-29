import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAuth } from '@/lib/api-auth'

/**
 * GET /api/assets/checkouts?status=pending|out|overdue
 *
 * List tool checkouts for the approvals queue and the overdue view.
 *   pending  — awaiting approval
 *   out      — currently checked out
 *   overdue  — 'out' and past due_at
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const status = req.nextUrl.searchParams.get('status') ?? 'pending'
  const supabase = createServiceClient()

  let query = supabase
    .from('asset_checkouts')
    .select(`
      id, status, holder_name, job_code, job_reference, due_at, notes,
      checked_out_at, approved_at,
      asset:fixed_assets(id, asset_tag, name),
      holder:accountable_persons!holder_person_id(id, name, employee_no),
      requester:user_profiles!checked_out_by(id, full_name)
    `)
    .eq('org_id', auth.orgId)
    .order('checked_out_at', { ascending: false })
    .limit(200)

  if (status === 'overdue') {
    query = query.eq('status', 'out').not('due_at', 'is', null).lt('due_at', new Date().toISOString())
  } else if (['pending', 'out', 'returned', 'rejected'].includes(status)) {
    query = query.eq('status', status)
  }

  const { data, error } = await query
  if (error) {
    console.error('[GET /api/assets/checkouts]', error)
    return NextResponse.json({ error: 'Failed to fetch checkouts' }, { status: 500 })
  }

  return NextResponse.json({ data: data ?? [] })
}
