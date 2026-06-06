import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAuth } from '@/lib/api-auth'

// GET /api/user/profile — current user's own profile
export async function GET() {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('user_profiles')
    .select('id, full_name, email, role, is_active, created_at')
    .eq('id', auth.userId)
    .single()

  if (error || !data) {
    // Profile row not yet created — return safe defaults
    return NextResponse.json({ id: auth.userId, full_name: '', email: '', role: auth.role })
  }

  return NextResponse.json(data)
}

// PATCH /api/user/profile — update own display name
export async function PATCH(req: Request) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const { full_name } = await req.json()
  if (!full_name?.trim()) {
    return NextResponse.json({ error: 'full_name is required' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('user_profiles')
    .update({ full_name: full_name.trim() })
    .eq('id', auth.userId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
