import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAuth } from '@/lib/api-auth'
import { isRecurrence, nextDueDate } from '@/lib/maintenance-recurrence'

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
  // Select only what we use — selecting an unused column here meant a schema
  // mismatch surfaced as a misleading "not found" 404 instead of a real error.
  const { data: existing, error: fetchErr } = await supabase
    .from('maintenance_schedules')
    .select('id, asset_id, title, description, scheduled_date, notify_days_before, recurrence_every, recurrence_unit, recurrence_parent_id')
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

  // Preventive maintenance: completing a recurring occurrence schedules the
  // next one, so the cadence continues without anyone remembering to re-create
  // it. Best-effort — a failure here must not fail the completion itself.
  let next_occurrence: string | null = null
  const e = existing as any
  if (update.status === 'completed' && isRecurrence(e.recurrence_every, e.recurrence_unit)) {
    try {
      const nextDate = nextDueDate(
        e.scheduled_date,
        Number(e.recurrence_every),
        e.recurrence_unit,
        typeof update.completed_date === 'string' ? update.completed_date : undefined,
      )
      // Don't duplicate if this series already has an open occurrence.
      const seriesId = e.recurrence_parent_id ?? e.id
      const { count: openInSeries } = await supabase
        .from('maintenance_schedules')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', auth.orgId)
        .in('status', ['scheduled', 'overdue'])
        .or(`id.eq.${seriesId},recurrence_parent_id.eq.${seriesId}`)

      if ((openInSeries ?? 0) === 0) {
        const { data: created } = await supabase
          .from('maintenance_schedules')
          .insert({
            org_id:               auth.orgId,
            asset_id:             e.asset_id,
            title:                e.title,
            description:          e.description,
            scheduled_date:       nextDate,
            status:               'scheduled',
            notify_days_before:   e.notify_days_before ?? 7,
            reported_by:          auth.userId,
            recurrence_every:     e.recurrence_every,
            recurrence_unit:      e.recurrence_unit,
            recurrence_parent_id: seriesId,
          })
          .select('scheduled_date')
          .single()
        next_occurrence = created?.scheduled_date ?? null
      }
    } catch (err) {
      console.error('[PATCH /api/maintenance/[id]] next occurrence failed', err)
    }
  }

  // Completing maintenance returns the asset to service — but only once it has
  // no other open work. Reporting an issue flags the asset "maintenance"; without
  // this it stayed flagged forever, so the asset looked permanently unavailable.
  if (update.status === 'completed' && e.asset_id) {
    // Only OVERDUE work keeps an asset out of service. A future scheduled
    // service (including the recurrence just created above) is planned work,
    // not a breakdown, and must not pin the asset in "maintenance".
    const { count: stillOpen } = await supabase
      .from('maintenance_schedules')
      .select('id', { count: 'exact', head: true })
      .eq('asset_id', e.asset_id)
      .eq('org_id', auth.orgId)
      .eq('status', 'overdue')

    if ((stillOpen ?? 0) === 0) {
      await supabase
        .from('fixed_assets')
        .update({ status: 'active' })
        .eq('id', existing.asset_id)
        .eq('org_id', auth.orgId)
        .eq('status', 'maintenance')   // leave disposed/retired/sold alone
    }
  }

  return NextResponse.json({ data, next_occurrence })
}
