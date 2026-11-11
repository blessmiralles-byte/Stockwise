import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAnyRole } from '@/lib/api-auth'
import { fetchAllPaged } from '@/lib/fetch-paged'
import { parseRange } from '@/lib/report-data'
import { stockAdjustments, type AdjustmentTx } from '@/lib/inventory-reports'

/**
 * GET /api/reports/adjustments?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Every stock write-up and write-down in the period, valued, with who posted
 * it and whether it came from a stock count — what shrinkage cost and where it
 * came from. Defaults to the last 90 days. Scoped to the caller's org_id.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAnyRole('owner', 'finance', 'operations', 'manager')
  if (auth.error) return auth.error

  const range = parseRange(req, 90)
  const supabase = createServiceClient()

  const { rows, truncated, error } = await fetchAllPaged<any>((from, to) =>
    supabase
      .from('inventory_transactions')
      .select(`
        id, created_at, quantity, unit_cost, reference_no, notes, created_by,
        product:products(sku, name, unit_of_measure),
        from_location:locations!inventory_transactions_from_location_id_fkey(name),
        to_location:locations!inventory_transactions_to_location_id_fkey(name)
      `)
      .eq('org_id', auth.orgId)
      .eq('transaction_type', 'adjustment')
      .eq('status', 'posted')
      .gte('created_at', range.fromTs)
      .lte('created_at', range.toTs)
      .order('created_at', { ascending: false })
      .order('id')
      .range(from, to))

  if (error) {
    console.error('[GET /api/reports/adjustments]', error)
    return NextResponse.json({ error: 'Failed to load adjustments' }, { status: 500 })
  }

  // created_by points at the auth user; names live on the profile.
  const userIds = [...new Set(rows.map(r => r.created_by).filter(Boolean))] as string[]
  const names = new Map<string, string>()
  if (userIds.length) {
    const { data } = await supabase
      .from('user_profiles')
      .select('id, full_name, email')
      .eq('org_id', auth.orgId)
      .in('id', userIds)
    for (const u of (data ?? []) as any[]) names.set(u.id, u.full_name || u.email || '')
  }

  const txs: AdjustmentTx[] = rows.map(r => ({
    id: r.id,
    created_at:   r.created_at,
    quantity:     Number(r.quantity),
    unit_cost:    Number(r.unit_cost ?? 0),
    reference_no: r.reference_no ?? null,
    notes:        r.notes ?? null,
    sku:          r.product?.sku ?? '',
    name:         r.product?.name ?? 'Unknown item',
    unit:         r.product?.unit_of_measure ?? null,
    location:     r.to_location?.name ?? r.from_location?.name ?? null,
    by:           (r.created_by && names.get(r.created_by)) || null,
  }))

  return NextResponse.json({
    ...stockAdjustments(txs),
    meta: { from: range.from, to: range.to },
    truncated: truncated || undefined,
  })
}
