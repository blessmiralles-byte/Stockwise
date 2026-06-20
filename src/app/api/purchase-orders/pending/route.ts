import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAuth } from '@/lib/api-auth'

// GET /api/purchase-orders/pending — POs with outstanding quantities
export async function GET() {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('purchase_orders')
    .select(`
      id, po_number, status,
      supplier:suppliers(id, name),
      lines:purchase_order_lines(id, quantity_ordered, quantity_received, unit_cost,
        product:products(id, name, sku, unit_of_measure))
    `)
    .eq('org_id', auth.orgId)
    .in('status', ['draft', 'sent', 'partial'])
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[GET /api/purchase-orders/pending]', error)
    return NextResponse.json({ error: 'Failed to fetch pending POs' }, { status: 500 })
  }

  // Only return POs that still have at least one outstanding line
  const withOutstanding = (data ?? []).filter((po: any) =>
    po.lines?.some((l: any) => l.quantity_ordered > l.quantity_received)
  )

  return NextResponse.json({ data: withOutstanding })
}
