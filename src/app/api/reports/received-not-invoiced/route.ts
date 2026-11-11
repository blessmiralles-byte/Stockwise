import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAnyRole } from '@/lib/api-auth'
import { loadPurchaseOrders, loadReceiptDates } from '@/lib/report-data'
import { receivedNotInvoiced } from '@/lib/procurement-reports'

/** Orders older than this are assumed settled one way or another. */
const LOOKBACK_DAYS = 730

/**
 * GET /api/reports/received-not-invoiced?all=1
 *
 * Goods that have arrived with no vendor invoice recorded — the GR/IR accrual
 * to book at period end — plus invoices that don't match what was received.
 * Matched orders are left out unless ?all=1. Scoped to the caller's org_id.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAnyRole('owner', 'finance', 'procurement')
  if (auth.error) return auth.error

  const supabase = createServiceClient()
  const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString()

  const { rows: pos, truncated, error } = await loadPurchaseOrders(supabase, auth.orgId, {
    statuses: ['sent', 'partial', 'received'],
    createdFrom: since,
  })
  if (error) {
    console.error('[GET /api/reports/received-not-invoiced]', error)
    return NextResponse.json({ error: 'Failed to load purchase orders' }, { status: 500 })
  }

  const receipts = await loadReceiptDates(supabase, auth.orgId, pos, since)
  const { rows, summary } = receivedNotInvoiced(pos, receipts, new Date())
  const showAll = req.nextUrl.searchParams.get('all') === '1'

  return NextResponse.json({
    data: showAll ? rows : rows.filter(r => r.state !== 'matched'),
    summary: { ...summary, matched: rows.filter(r => r.state === 'matched').length },
    truncated: truncated || undefined,
  })
}
