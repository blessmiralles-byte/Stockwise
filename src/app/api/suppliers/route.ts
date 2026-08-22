import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAuth } from '@/lib/api-auth'
import { clampTolerance } from '@/lib/utils'

// GET /api/suppliers
export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const { searchParams } = new URL(req.url)
  const activeOnly = searchParams.get('active') !== 'false'

  const supabase = createServiceClient()
  let query = supabase
    .from('suppliers')
    .select('*')
    .eq('org_id', auth.orgId)
    .order('name')

  if (activeOnly) query = query.eq('is_active', true)

  const { data, error } = await query
  if (error) {
    console.error('[GET /api/suppliers]', error)
    return NextResponse.json({ error: 'Failed to fetch suppliers' }, { status: 500 })
  }

  return NextResponse.json({ data })
}

// POST /api/suppliers
export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const body = await req.json()
  const { name, contact_name, email, phone, lead_time_days, payment_terms, notes, over_receipt_tolerance_pct } = body

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Vendor name is required' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('suppliers')
    .insert({
      org_id: auth.orgId,
      name: name.trim(),
      contact_name: contact_name?.trim() || null,
      email: email?.trim() || null,
      phone: phone?.trim() || null,
      lead_time_days: lead_time_days ?? 7,
      payment_terms: payment_terms?.trim() || null,
      notes: notes?.trim() || null,
      over_receipt_tolerance_pct: clampTolerance(over_receipt_tolerance_pct),
    })
    .select()
    .single()

  if (error) {
    console.error('[POST /api/suppliers]', error)
    return NextResponse.json({ error: 'Failed to create supplier' }, { status: 500 })
  }

  return NextResponse.json({ data }, { status: 201 })
}
