import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAuth } from '@/lib/api-auth'

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const { searchParams } = req.nextUrl
  const productId     = searchParams.get('product_id')
  const expiringDays  = parseInt(searchParams.get('expiring_within_days') ?? '0')

  const supabase = createServiceClient()

  let query = supabase
    .from('inventory_batches')
    .select(`
      id, purchase_date, quantity_remaining, unit_cost,
      reference_no, batch_no, expiration_date,
      product:products(id, name, sku, unit_of_measure, track_expiry),
      location:locations(id, name)
    `)
    .eq('org_id', auth.orgId)
    .gt('quantity_remaining', 0)
    .order('expiration_date', { ascending: true, nullsFirst: false })
    .order('purchase_date', { ascending: true })

  if (productId)      query = query.eq('product_id', productId)

  if (expiringDays > 0) {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() + expiringDays)
    query = query.lte('expiration_date', cutoff.toISOString().split('T')[0])
    query = query.not('expiration_date', 'is', null)
  }

  const { data, error } = await query
  if (error) {
    console.error('[GET /api/inventory/batches]', error)
    return NextResponse.json({ error: 'Failed to fetch batches' }, { status: 500 })
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const rows = (data ?? []).map((b: any) => {
    if (!b.expiration_date) return { ...b, expiry_status: 'none' }
    const exp = new Date(b.expiration_date)
    const daysLeft = Math.ceil((exp.getTime() - today.getTime()) / 86_400_000)
    const expiry_status =
      daysLeft < 0   ? 'expired'  :
      daysLeft <= 7  ? 'critical' :
      daysLeft <= 30 ? 'soon'     : 'ok'
    return { ...b, days_until_expiry: daysLeft, expiry_status }
  })

  return NextResponse.json({ data: rows, count: rows.length })
}
