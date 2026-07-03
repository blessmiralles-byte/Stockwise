import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAuth, requireRole } from '@/lib/api-auth'
import { clampTolerance } from '@/lib/utils'

// GET /api/suppliers/:id
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const { id } = await params
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('suppliers')
    .select('*')
    .eq('id', id)
    .eq('org_id', auth.orgId)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Supplier not found' }, { status: 404 })
  }

  return NextResponse.json({ data })
}

// PATCH /api/suppliers/:id
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole('manager')
  if (auth.error) return auth.error

  const { id } = await params
  const body = await req.json()

  const allowed = ['name', 'contact_name', 'email', 'phone', 'lead_time_days', 'payment_terms', 'notes', 'is_active', 'over_receipt_tolerance_pct']
  const updates: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }

  // Clamp tolerance to a sane percentage [0, 100]
  if ('over_receipt_tolerance_pct' in updates) {
    updates.over_receipt_tolerance_pct = clampTolerance(updates.over_receipt_tolerance_pct)
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('suppliers')
    .update(updates)
    .eq('id', id)
    .eq('org_id', auth.orgId)
    .select()
    .single()

  if (error) {
    console.error('[PATCH /api/suppliers/:id]', error)
    return NextResponse.json({ error: 'Failed to update supplier' }, { status: 500 })
  }

  return NextResponse.json({ data })
}
