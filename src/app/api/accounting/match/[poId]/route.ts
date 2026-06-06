import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAnyRole } from '@/lib/api-auth'

/**
 * POST /api/accounting/match/[poId]
 *
 * Record a supplier invoice against a purchase order (for three-way match).
 * Body: { invoice_no: string, invoice_date: string, invoice_amount: number }
 *
 * Restricted to: owner, finance, procurement
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ poId: string }> }) {
  const auth = await requireAnyRole('owner', 'finance', 'procurement')
  if (auth.error) return auth.error

  const { poId } = await params
  let body: any
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { invoice_no, invoice_date, invoice_amount } = body
  if (!invoice_no?.trim())    return NextResponse.json({ error: 'invoice_no is required' },    { status: 400 })
  if (!invoice_date)          return NextResponse.json({ error: 'invoice_date is required' },   { status: 400 })
  if (invoice_amount == null) return NextResponse.json({ error: 'invoice_amount is required' }, { status: 400 })

  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('purchase_orders')
    .update({
      supplier_invoice_no:     invoice_no.trim(),
      supplier_invoice_date:   invoice_date,
      supplier_invoice_amount: Number(invoice_amount),
    })
    .eq('id', poId)
    .eq('org_id', auth.orgId)
    .select(`
      id, po_number, status,
      supplier_invoice_no, supplier_invoice_date, supplier_invoice_amount,
      lines:purchase_order_lines(quantity_ordered, quantity_received, unit_cost)
    `)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 })
  }

  // Compute match status
  const po = data as any
  const lines = (po.lines ?? []) as any[]
  const grn_amount = lines.reduce((s: number, l: any) => s + l.quantity_received * l.unit_cost, 0)
  const variance   = po.supplier_invoice_amount - grn_amount
  const matched    = Math.abs(variance) <= 0.01

  return NextResponse.json({
    data: {
      po_number:      po.po_number,
      invoice_no:     po.supplier_invoice_no,
      invoice_date:   po.supplier_invoice_date,
      invoice_amount: po.supplier_invoice_amount,
      grn_amount,
      variance,
      match_status:   matched ? 'matched' : variance > 0 ? 'over_invoiced' : 'under_invoiced',
    },
  })
}

/**
 * DELETE /api/accounting/match/[poId]
 * Remove invoice recording from a PO (e.g. wrong invoice entered).
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ poId: string }> }) {
  const auth = await requireAnyRole('owner', 'finance', 'procurement')
  if (auth.error) return auth.error

  const { poId } = await params
  const supabase  = createServiceClient()

  const { error } = await supabase
    .from('purchase_orders')
    .update({ supplier_invoice_no: null, supplier_invoice_date: null, supplier_invoice_amount: null })
    .eq('id', poId)
    .eq('org_id', auth.orgId)

  if (error) return NextResponse.json({ error: 'Failed to clear invoice' }, { status: 500 })
  return NextResponse.json({ success: true })
}
