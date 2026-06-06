import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAuth } from '@/lib/api-auth'

/**
 * GET /api/accounting/payables
 *
 * Accounts Payable feed — open and partially-received purchase orders
 * with three-way match status: PO ordered vs GRN received vs AP invoice.
 *
 * Auth: session cookie OR Authorization: Bearer {ACCOUNTING_API_KEY}
 *
 * Query params:
 *   status   all | open | matched | disputed   (default: all)
 *   from     YYYY-MM-DD  optional
 *   to       YYYY-MM-DD  optional
 *
 * Match status definitions:
 *   pending    — no GRN yet
 *   partial    — GRN received but not fully matched to invoice
 *   matched    — PO qty = GRN qty = invoice amount (within tolerance)
 *   over       — invoice amount > GRN value (over-invoiced)
 *   under      — invoice amount < GRN value (under-invoiced)
 *   no_invoice — goods received but no invoice recorded yet
 */
export async function GET(req: NextRequest) {
  const apiKey    = process.env.ACCOUNTING_API_KEY
  const authHeader = req.headers.get('authorization') ?? ''
  let orgId: string | null = null

  if (apiKey && authHeader === `Bearer ${apiKey}`) {
    const qOrgId = req.nextUrl.searchParams.get('org_id')
    if (!qOrgId) return NextResponse.json({ error: 'org_id required' }, { status: 400 })
    orgId = qOrgId
  } else {
    const auth = await requireAuth()
    if (auth.error) return auth.error
    if (!['owner', 'finance', 'procurement', 'admin'].includes(auth.role)) {
      return NextResponse.json({ error: 'Finance or Owner role required' }, { status: 403 })
    }
    orgId = auth.orgId
  }

  const { searchParams } = req.nextUrl
  const statusFilter = searchParams.get('status') ?? 'all'
  const from = searchParams.get('from')
  const to   = searchParams.get('to')

  const supabase = createServiceClient()

  let query = supabase
    .from('purchase_orders')
    .select(`
      id, po_number, status, created_at, expected_date, notes,
      supplier_invoice_no, supplier_invoice_date, supplier_invoice_amount,
      supplier:suppliers(id, name, email),
      lines:purchase_order_lines(
        id, quantity_ordered, quantity_received, unit_cost,
        product:products(id, sku, name, unit_of_measure)
      )
    `)
    .eq('org_id', orgId)
    .not('status', 'eq', 'cancelled')
    .order('created_at', { ascending: false })
    .limit(200)

  if (from) query = query.gte('created_at', `${from}T00:00:00.000Z`)
  if (to)   query = query.lte('created_at', `${to}T23:59:59.999Z`)

  const { data: pos } = await query

  const result = (pos ?? []).map((po: any) => {
    const lines       = (po.lines ?? []) as any[]
    const totalOrdered  = lines.reduce((s: number, l: any) => s + l.quantity_ordered * l.unit_cost, 0)
    const totalReceived = lines.reduce((s: number, l: any) => s + l.quantity_received * l.unit_cost, 0)
    const qtyOrdered    = lines.reduce((s: number, l: any) => s + l.quantity_ordered, 0)
    const qtyReceived   = lines.reduce((s: number, l: any) => s + l.quantity_received, 0)
    const invoiceAmt    = po.supplier_invoice_amount ?? null

    // Three-way match status
    let matchStatus: string
    const TOLERANCE = 0.01 // 1 cent tolerance for floating point

    if (qtyReceived === 0) {
      matchStatus = 'pending'
    } else if (invoiceAmt === null) {
      matchStatus = 'no_invoice'
    } else {
      const diff = Math.abs(invoiceAmt - totalReceived)
      if (diff <= TOLERANCE) {
        matchStatus = 'matched'
      } else if (invoiceAmt > totalReceived + TOLERANCE) {
        matchStatus = 'over_invoiced'
      } else {
        matchStatus = 'under_invoiced'
      }
    }

    return {
      id:                     po.id,
      po_number:              po.po_number,
      po_status:              po.status,
      created_at:             po.created_at,
      expected_date:          po.expected_date,
      supplier:               po.supplier ? { id: po.supplier.id, name: po.supplier.name, email: po.supplier.email } : null,

      // PO amounts
      po_amount:              totalOrdered,
      po_qty:                 qtyOrdered,

      // GRN amounts
      grn_amount:             totalReceived,
      grn_qty:                qtyReceived,

      // AP invoice
      invoice_no:             po.supplier_invoice_no   ?? null,
      invoice_date:           po.supplier_invoice_date ?? null,
      invoice_amount:         invoiceAmt,

      // Variance
      variance:               invoiceAmt !== null ? invoiceAmt - totalReceived : null,
      variance_pct:           invoiceAmt !== null && totalReceived > 0
                                ? ((invoiceAmt - totalReceived) / totalReceived) * 100
                                : null,

      // Match result
      match_status:           matchStatus,

      // Line detail
      lines: lines.map((l: any) => ({
        id:                l.id,
        product_sku:       l.product?.sku,
        product_name:      l.product?.name,
        unit:              l.product?.unit_of_measure,
        qty_ordered:       l.quantity_ordered,
        qty_received:      l.quantity_received,
        qty_outstanding:   l.quantity_ordered - l.quantity_received,
        unit_cost:         l.unit_cost,
        ordered_value:     l.quantity_ordered  * l.unit_cost,
        received_value:    l.quantity_received * l.unit_cost,
      })),
    }
  })

  // Apply match status filter
  const filtered = statusFilter === 'all'
    ? result
    : result.filter(r => {
        if (statusFilter === 'open')     return ['pending', 'no_invoice', 'partial'].includes(r.match_status)
        if (statusFilter === 'matched')  return r.match_status === 'matched'
        if (statusFilter === 'disputed') return ['over_invoiced', 'under_invoiced'].includes(r.match_status)
        return true
      })

  // Summary totals
  const summary = {
    total_pos:         filtered.length,
    total_po_value:    filtered.reduce((s, r) => s + r.po_amount, 0),
    total_grn_value:   filtered.reduce((s, r) => s + r.grn_amount, 0),
    total_invoiced:    filtered.reduce((s, r) => s + (r.invoice_amount ?? 0), 0),
    by_status: {
      pending:         filtered.filter(r => r.match_status === 'pending').length,
      no_invoice:      filtered.filter(r => r.match_status === 'no_invoice').length,
      matched:         filtered.filter(r => r.match_status === 'matched').length,
      over_invoiced:   filtered.filter(r => r.match_status === 'over_invoiced').length,
      under_invoiced:  filtered.filter(r => r.match_status === 'under_invoiced').length,
    },
  }

  return NextResponse.json({ data: filtered, summary }, { headers: { 'Cache-Control': 'no-store' } })
}
