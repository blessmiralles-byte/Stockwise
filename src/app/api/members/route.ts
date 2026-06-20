import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAuth } from '@/lib/api-auth'

// GET /api/members — active org members (for dropdowns like "Received By")
export async function GET() {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('user_profiles')
    .select('id, full_name, role')
    .eq('org_id', auth.orgId)
    .eq('is_active', true)
    .order('full_name', { ascending: true })

  if (error) {
    console.error('[GET /api/members]', error)
    return NextResponse.json({ error: 'Failed to fetch members' }, { status: 500 })
  }

  return NextResponse.json({ data: data ?? [] })
}
