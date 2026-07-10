import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAuth } from '@/lib/api-auth'

/**
 * GET /api/assets/:id/checkouts — full custody history for one tool, newest first.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const { id } = await params
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('asset_checkouts')
    .select(`
      id, status, holder_name, job_code, job_reference, due_at, notes, reject_reason,
      checked_out_at, approved_at, returned_at,
      checked_out_by:user_profiles!checked_out_by(full_name),
      returned_location:locations!returned_to_location_id(name)
    `)
    .eq('org_id', auth.orgId)
    .eq('asset_id', id)
    .order('checked_out_at', { ascending: false })
    .limit(100)

  if (error) {
    console.error('[GET /api/assets/:id/checkouts]', error)
    return NextResponse.json({ error: 'Failed to fetch custody history' }, { status: 500 })
  }

  return NextResponse.json({ data: data ?? [] })
}
