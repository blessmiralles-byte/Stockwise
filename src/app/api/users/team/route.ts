import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAuth } from '@/lib/api-auth'

/**
 * GET /api/users/team
 * Minimal active-member list (id, name, role) for pickers — e.g. choosing who
 * was present during a stock count. Available to any authenticated org member.
 */
export async function GET() {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('user_profiles')
    .select('id, full_name, email, role')
    .eq('org_id', auth.orgId)
    .eq('is_active', true)
    .order('full_name', { ascending: true })

  if (error) {
    console.error('[GET /api/users/team]', error)
    return NextResponse.json({ error: 'Failed to fetch team' }, { status: 500 })
  }

  return NextResponse.json({ data: data ?? [] })
}
