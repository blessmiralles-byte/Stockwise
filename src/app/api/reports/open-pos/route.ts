import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAnyRole } from '@/lib/api-auth'
import { loadPurchaseOrders } from '@/lib/report-data'
import { openPurchaseOrders } from '@/lib/procurement-reports'

/**
 * GET /api/reports/open-pos
 *
 * Every purchase order that has been placed and isn't fully in: what is still
 * to arrive, what it is worth, and how late it is. Scoped to the caller's
 * org_id; no date range — an open order is open however old it is.
 */
export async function GET() {
  const auth = await requireAnyRole('owner', 'procurement', 'operations', 'manager', 'finance', 'receiver')
  if (auth.error) return auth.error

  const supabase = createServiceClient()
  const { rows: pos, truncated, error } = await loadPurchaseOrders(supabase, auth.orgId, {
    statuses: ['approved', 'sent', 'partial'],
  })
  if (error) {
    console.error('[GET /api/reports/open-pos]', error)
    return NextResponse.json({ error: 'Failed to load purchase orders' }, { status: 500 })
  }

  const rows = openPurchaseOrders(pos, new Date())
  return NextResponse.json({
    data: rows,
    summary: {
      orders:            rows.length,
      outstanding_value: Math.round(rows.reduce((s, r) => s + r.outstanding_value, 0) * 100) / 100,
      late:              rows.filter(r => r.days_late > 0).length,
      late_value:        Math.round(rows.filter(r => r.days_late > 0).reduce((s, r) => s + r.outstanding_value, 0) * 100) / 100,
    },
    truncated: truncated || undefined,
  })
}
