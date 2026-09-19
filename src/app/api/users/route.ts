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
    .select('id, full_name, email, role, job_title, is_active, reports_to, requisition_approval_limit, po_approval_limit, created_at')
    .eq('org_id', auth.orgId)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[GET /api/users]', error)
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
  }

  // Flag members who were invited but have never signed in, so the owner can
  // resend the invite. Teams are small (plan-capped), so one lookup each is fine.
  const rows = await Promise.all((data ?? []).map(async u => {
    const { data: au } = await supabase.auth.admin.getUserById(u.id)
    return { ...u, invite_pending: !!au?.user && !au.user.last_sign_in_at }
  }))

  return NextResponse.json({ data: rows })
}
