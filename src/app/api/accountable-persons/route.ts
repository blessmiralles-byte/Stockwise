import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAuth, requireAnyRole } from '@/lib/api-auth'

/**
 * Accountable Persons — restricted to Owner and Operations Manager.
 *
 * GET  /api/accountable-persons        — list all persons in the org
 * POST /api/accountable-persons        — create a new person
 */

export async function GET() {
  // Any authenticated user can READ persons (needed for the Add Asset dropdown).
  // Write operations (POST/PATCH/DELETE) are still restricted to owner/operations.
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('accountable_persons')
    .select('id, name, department, email, phone')
    .eq('org_id', auth.orgId)
    .order('name')

  if (error) {
    console.error('[GET /api/accountable-persons]', error)
    return NextResponse.json({ error: 'Failed to fetch accountable persons' }, { status: 500 })
  }

  return NextResponse.json({ data: data ?? [] })
}

export async function POST(req: NextRequest) {
  const auth = await requireAnyRole('owner', 'operations')
  if (auth.error) return auth.error

  let body: any
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const name = body.name?.trim()
  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('accountable_persons')
    .insert({
      org_id:     auth.orgId,
      name,
      department: body.department?.trim() || null,
      email:      body.email?.trim()      || null,
      phone:      body.phone?.trim()      || null,
    })
    .select('id, name, department, email, phone')
    .single()

  if (error) {
    console.error('[POST /api/accountable-persons]', error)
    return NextResponse.json({ error: 'Failed to create person' }, { status: 500 })
  }

  return NextResponse.json({ data }, { status: 201 })
}
