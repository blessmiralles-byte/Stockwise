import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAuth, requireAnyRole } from '@/lib/api-auth'
import { postCatchUpDepreciation } from '@/lib/depreciation'

// M-5: Role-split PATCH — field workers can update status/notes only;
//      financial fields and reassignment require operations/owner.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const { id } = await params
  let body: any
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const FIELD_ALLOWED    = ['status', 'notes']                      // any authenticated user
  const MANAGER_FIELDS   = ['location_id', 'accountable_person_id', 'requires_checkout_approval'] // operations / owner
  const FINANCIAL_FIELDS = ['current_value']                        // finance / owner

  const MANAGER_ROLES  = new Set(['owner', 'admin', 'operations', 'manager', 'procurement'])
  const FINANCIAL_ROLES = new Set(['owner', 'admin', 'finance'])

  const update: Record<string, any> = {}

  for (const key of FIELD_ALLOWED) {
    if (key in body) {
      update[key] = typeof body[key] === 'string'
        ? body[key].trim().slice(0, 1000)
        : body[key]
    }
  }

  for (const key of MANAGER_FIELDS) {
    if (key in body) {
      if (!MANAGER_ROLES.has(auth.role)) {
        return NextResponse.json(
          { error: 'Operations or owner role required to reassign asset location or accountable person' },
          { status: 403 }
        )
      }
      update[key] = body[key]
    }
  }

  for (const key of FINANCIAL_FIELDS) {
    if (key in body) {
      if (!FINANCIAL_ROLES.has(auth.role)) {
        return NextResponse.json(
          { error: 'Finance or owner role required to update asset value' },
          { status: 403 }
        )
      }
      const val = Number(body[key])
      if (isNaN(val) || val < 0) {
        return NextResponse.json({ error: 'current_value must be a non-negative number' }, { status: 400 })
      }
      update[key] = val
    }
  }

  // Retirement fields — owner/admin only
  if ('retirement_reason' in body) {
    if (!MANAGER_ROLES.has(auth.role)) {
      return NextResponse.json({ error: 'Operations or owner role required' }, { status: 403 })
    }
    update.retirement_reason = body.retirement_reason ?? null
  }

  // Sale fields — owner/admin only
  for (const key of ['sale_price', 'sale_buyer', 'sale_notes'] as const) {
    if (key in body) {
      if (!MANAGER_ROLES.has(auth.role)) {
        return NextResponse.json({ error: 'Operations or owner role required' }, { status: 403 })
      }
      update[key] = body[key] ?? null
    }
  }

  if ('status' in update) {
    const validStatuses = ['active', 'maintenance', 'inactive', 'disposed', 'retired', 'sold']
    if (!validStatuses.includes(update.status)) {
      return NextResponse.json(
        { error: 'Invalid status. Use: active, maintenance, inactive, disposed, retired, or sold' },
        { status: 400 }
      )
    }
    // Retirement, sale, and disposal require operations or above
    if (['disposed', 'retired', 'sold'].includes(update.status) && !MANAGER_ROLES.has(auth.role)) {
      return NextResponse.json(
        { error: 'Operations or owner role required to retire or sell an asset' },
        { status: 403 }
      )
    }
    // Stamp disposal timestamp so roll-forward reports can place it in the correct period
    if (update.status === 'disposed') {
      update.disposed_at = new Date().toISOString()
      update.disposed_by = auth.userId
    } else if (update.status === 'retired') {
      update.retired_at = new Date().toISOString()
      update.retired_by = auth.userId
    } else if (update.status === 'sold') {
      update.sold_at = new Date().toISOString()
      update.sold_by = auth.userId
    } else {
      // Re-activating: clear all end-of-life stamps
      update.disposed_at = null; update.disposed_by = null
      update.retired_at  = null; update.retired_by  = null
      update.sold_at     = null; update.sold_by     = null
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 422 })
  }

  const supabase = createServiceClient()

  // End-of-life: post catch-up depreciation through the disposal date BEFORE
  // stamping, so accumulated depreciation (and the disposal journal entry
  // derived from current_value) is complete to the date of disposal.
  if (['disposed', 'retired', 'sold'].includes(update.status)) {
    const today = new Date().toISOString().slice(0, 10)
    await postCatchUpDepreciation(supabase, auth.orgId, auth.userId, id, today)
  }

  const { data, error } = await supabase
    .from('fixed_assets')
    .update(update)
    .eq('id', id)
    .eq('org_id', auth.orgId)
    .select()
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 })
    }
    console.error('[PATCH /api/assets/:id]', error.code)
    return NextResponse.json({ error: 'Failed to update asset' }, { status: 500 })
  }

  return NextResponse.json({ data })
}
