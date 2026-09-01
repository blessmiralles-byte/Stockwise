import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAuth } from '@/lib/api-auth'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // H-2: Any authenticated user can update operational fields (field workers mark tasks done).
  // Financial fields (cost) are restricted to operations/finance/owner.
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const { id } = await params

  let body: any
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  // Fields any authenticated user (incl. field workers) can update
  const FIELD_ALLOWED  = ['status', 'completed_date', 'performed_by', 'notes']
  // Fields restricted to operations / finance / owner
  const FINANCE_ROLES  = new Set(['owner', 'admin', 'operations', 'manager', 'finance'])

  const update: Record<string, any> = {}

  for (const key of FIELD_ALLOWED) {
    if (key in body) {
      // Trim string values, cap length to prevent abuse (L-4)
      update[key] = typeof body[key] === 'string'
        ? body[key].trim().slice(0, 500)
        : body[key]
    }
  }

  if ('cost' in body) {
    if (!FINANCE_ROLES.has(auth.role)) {
      return NextResponse.json(
        { error: 'Only operations or finance roles can update maintenance cost' },
        { status: 403 }
      )
    }
    const cost = Number(body.cost)
    if (isNaN(cost) || cost < 0) {
      return NextResponse.json({ error: 'cost must be a non-negative number' }, { status: 400 })
    }
    update.cost = cost
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 422 })
  }

  const supabase = createServiceClient()

  // Verify the record exists before patching (must be in same org).
  // Select only `id` — selecting an unused column here meant a schema mismatch
  // surfaced as a misleading "not found" 404 instead of a real error.
  const { data: existing, error: fetchErr } = await supabase
    .from('maintenance_schedules')
    .select('id')
    .eq('id', id)
    .eq('org_id', auth.orgId)
    .maybeSingle()

  if (fetchErr) {
    console.error('[PATCH /api/maintenance/[id]] lookup failed', fetchErr)
    return NextResponse.json(
      { error: `Could not load the maintenance record: ${fetchErr.message}` },
      { status: 500 },
    )
  }
  if (!existing) {
    return NextResponse.json({ error: 'Maintenance record not found' }, { status: 404 })
  }

  const { data, error } = await supabase
    .from('maintenance_schedules')
    .update(update)
    .eq('id', id)
    .eq('org_id', auth.orgId)
    .select()
    .single()

  if (error) {
    // Log the whole error (code alone made schema problems undiagnosable) and
    // return the DB message so the cause is visible in the UI.
    console.error('[PATCH /api/maintenance/[id]]', error)
    return NextResponse.json(
      { error: `Failed to update maintenance record: ${error.message}` },
      { status: 500 },
    )
  }

  return NextResponse.json({ data })
}
