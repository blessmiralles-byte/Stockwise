import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAuth, requireAnyRole } from '@/lib/api-auth'

/**
 * GET  /api/job-codes — list all active job codes
 * POST /api/job-codes — create a new job code (owner, operations, procurement)
 */

export async function GET() {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('job_codes')
    .select('id, code, name, description, is_active')
    .eq('org_id', auth.orgId)
    .order('code')

  if (error) {
    // Table may not exist yet — return empty list instead of crashing
    if (error.code === '42P01') return NextResponse.json({ data: [] })
    console.error('[GET /api/job-codes]', error)
    return NextResponse.json({ error: 'Failed to fetch job codes' }, { status: 500 })
  }

  return NextResponse.json({ data: data ?? [] })
}

export async function POST(req: NextRequest) {
  const auth = await requireAnyRole('owner', 'operations', 'procurement')
  if (auth.error) return auth.error

  let body: any
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const code = body.code?.trim()?.toUpperCase()
  const name = body.name?.trim()

  if (!code) return NextResponse.json({ error: 'code is required' }, { status: 400 })
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('job_codes')
    .insert({
      org_id:      auth.orgId,
      code,
      name,
      description: body.description?.trim() || null,
      is_active:   true,
    })
    .select('id, code, name, description, is_active')
    .single()

  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: `Job code "${code}" already exists` }, { status: 409 })
    if (error.code === '42P01') return NextResponse.json({ error: 'Job codes table not found. Run scripts/migrate-job-codes.sql in Supabase first.' }, { status: 503 })
    console.error('[POST /api/job-codes]', error)
    return NextResponse.json({ error: 'Failed to create job code' }, { status: 500 })
  }

  return NextResponse.json({ data }, { status: 201 })
}
