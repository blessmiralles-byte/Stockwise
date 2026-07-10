import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAuth } from '@/lib/api-auth'

const ASSET_SELECT = `
  id, asset_tag, barcode, name, description, status, serial_number,
  purchase_date, purchase_cost, current_value,
  depreciation_method, useful_life_years, salvage_value,
  warranty_provider, warranty_number, warranty_expires, warranty_contact, warranty_notes,
  notes,
  requires_checkout_approval, current_checkout_id, checked_out_to, checked_out_job, checkout_due_at,
  category:categories(id, name),
  location:locations(id, name, code),
  accountable_person:accountable_persons(id, name, department)
`

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const { searchParams } = req.nextUrl
  const status = searchParams.get('status')

  const supabase = createServiceClient()

  let query = supabase
    .from('fixed_assets')
    .select(ASSET_SELECT)
    .eq('org_id', auth.orgId)
    .order('created_at', { ascending: false })

  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) {
    console.error('[GET /api/assets]', error)
    return NextResponse.json({ error: 'Failed to fetch assets' }, { status: 500 })
  }

  return NextResponse.json({ data: data ?? [], count: data?.length ?? 0 })
}

// POST /api/assets — create a new fixed asset
export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  let body: any
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const {
    name, asset_tag, serial_number, barcode, description, status,
    category_id, location_id, accountable_person_id,
    purchase_date, purchase_cost, current_value,
    // depreciation
    depreciation_method, useful_life_years, salvage_value,
    // warranty
    warranty_provider, warranty_number, warranty_expires,
    warranty_contact, warranty_notes,
    // tool tracking
    requires_checkout_approval,
  } = body

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Asset name is required' }, { status: 400 })
  }

  // H-3: Auto-generate asset_tag using atomic DB sequence (no race condition)
  const supabase = createServiceClient()
  let tag = asset_tag?.trim()
  if (!tag) {
    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const { data: seqVal, error: seqErr } = await supabase
      .rpc('next_ref_number', { p_seq: 'public.asset_seq' })
    if (seqErr || seqVal == null) {
      console.error('[POST /api/assets] sequence', seqErr?.message)
      return NextResponse.json({ error: 'Failed to generate asset tag' }, { status: 500 })
    }
    tag = `AST-${datePart}-${String(seqVal).padStart(4, '0')}`
  }

  // Resolve the checkout-approval requirement: explicit value wins, else inherit
  // the category default (if set), else the org-wide default.
  let approvalRequired: boolean
  if (typeof requires_checkout_approval === 'boolean') {
    approvalRequired = requires_checkout_approval
  } else {
    let catDefault: boolean | null = null
    if (category_id) {
      const { data: cat } = await supabase
        .from('categories').select('require_checkout_approval').eq('id', category_id).single()
      catDefault = cat?.require_checkout_approval ?? null
    }
    if (catDefault !== null) {
      approvalRequired = catDefault
    } else {
      const { data: org } = await supabase
        .from('organizations').select('require_checkout_approval').eq('id', auth.orgId).single()
      approvalRequired = !!org?.require_checkout_approval
    }
  }

  const insert: Record<string, any> = {
    org_id:             auth.orgId,
    name:               name.trim(),
    asset_tag:          tag,
    status:             status ?? 'active',
    requires_checkout_approval: approvalRequired,
    created_by:         auth.userId,
  }

  // Optional scalar fields
  const optFields: Record<string, any> = {
    serial_number, barcode, description, category_id, location_id,
    accountable_person_id, purchase_date, purchase_cost,
    current_value: current_value ?? purchase_cost,
    depreciation_method, useful_life_years, salvage_value,
    warranty_provider, warranty_number, warranty_expires,
    warranty_contact, warranty_notes,
  }
  for (const [k, v] of Object.entries(optFields)) {
    if (v !== undefined && v !== null && v !== '') insert[k] = v
  }

  const { data, error } = await supabase
    .from('fixed_assets')
    .insert(insert)
    .select(ASSET_SELECT)
    .single()

  if (error) {
    console.error('[POST /api/assets]', error)
    if (error.code === '23505') {
      return NextResponse.json({ error: `Asset tag "${tag}" is already in use` }, { status: 409 })
    }
    return NextResponse.json({ error: error.message ?? 'Failed to create asset' }, { status: 500 })
  }

  return NextResponse.json({ data }, { status: 201 })
}
