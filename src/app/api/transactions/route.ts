import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAuth } from '@/lib/api-auth'

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const { searchParams } = req.nextUrl
  const type  = searchParams.get('type')
  const limit = parseInt(searchParams.get('limit') ?? '50')

  const supabase = createServiceClient()

  let query = supabase
    .from('inventory_transactions')
    .select(`
      id, transaction_type, quantity, unit_cost, reference_no,
      customer_id, job_order_id, notes, created_at, created_by,
      product:products(id, sku, name),
      from_location:locations!inventory_transactions_from_location_id_fkey(id, name),
      to_location:locations!inventory_transactions_to_location_id_fkey(id, name)
    `)
    .eq('org_id', auth.orgId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (type) query = query.eq('transaction_type', type)

  const { data, error } = await query
  if (error) {
    console.error('[GET /api/transactions]', error)
    return NextResponse.json({ error: 'Failed to fetch transactions' }, { status: 500 })
  }

  return NextResponse.json({ data: data ?? [], count: data?.length ?? 0 })
}
