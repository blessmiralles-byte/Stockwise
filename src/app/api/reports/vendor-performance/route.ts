import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAnyRole } from '@/lib/api-auth'
import { loadPurchaseOrders, loadReceiptDates, parseRange } from '@/lib/report-data'
import { vendorPerformance } from '@/lib/procurement-reports'

/**
 * GET /api/reports/vendor-performance?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Per vendor, for orders raised in the period: on-time rate, fill rate, real
 * lead time against the quoted one, and orders overdue right now. Defaults to
 * the last year. Scoped to the caller's org_id.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAnyRole('owner', 'procurement', 'operations', 'manager', 'finance')
  if (auth.error) return auth.error

  const range = parseRange(req, 365)
  const supabase = createServiceClient()

  const { rows: pos, truncated, error } = await loadPurchaseOrders(supabase, auth.orgId, {
    statuses: ['approved', 'sent', 'partial', 'received'],
    createdFrom: range.fromTs, createdTo: range.toTs,
  })
  if (error) {
    console.error('[GET /api/reports/vendor-performance]', error)
    return NextResponse.json({ error: 'Failed to load purchase orders' }, { status: 500 })
  }

  // Deliveries can only follow their order, so the period start is early enough.
  const receipts = await loadReceiptDates(supabase, auth.orgId, pos, range.fromTs)

  return NextResponse.json({
    data: vendorPerformance(pos, receipts, new Date()),
    meta: { from: range.from, to: range.to, orders: pos.length },
    truncated: truncated || undefined,
  })
}
