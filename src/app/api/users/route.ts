import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAnyRole } from '@/lib/api-auth'

// GET /api/users — list all user profiles (owner only)
export async function GET() {
  const auth = await requireAnyRole('owner')
  if (auth.error) return auth.error

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('user_profiles')
    .select('id, full_name, email, role, is_active, reports_to, requisition_approval_limit, po_approval_limit, created_at')
    .eq('org_id', auth.orgId)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[GET /api/users]', error)
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
  }

  return NextResponse.json({ data: data ?? [] })
}
