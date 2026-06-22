import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAuth } from '@/lib/api-auth'
// @ts-ignore — pdfkit has types but no default export typing in some setups
import PDFDocument from 'pdfkit'

export const runtime = 'nodejs'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const { id } = await params
  const supabase = createServiceClient()

  const { data: po, error } = await supabase
    .from('purchase_orders')
    .select(`
      id, po_number, status, order_date, expected_date, notes,
      supplier:suppliers(name, contact_email, contact_phone, address),
      lines:purchase_order_lines(
        id, quantity_ordered, quantity_received, unit_cost, notes,
        product:products(id, sku, name, unit_of_measure)
      )
    `)
    .eq('id', id)
    .eq('org_id', auth.orgId)
    .single()

  if (error || !po) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // ── Build PDF ─────────────────────────────────────────────────────────────
  const chunks: Buffer[] = []
  const doc = new PDFDocument({ margin: 50, size: 'A4' })

  doc.on('data', (chunk: Buffer) => chunks.push(chunk))

  await new Promise<void>((resolve, reject) => {
    doc.on('end', resolve)
    doc.on('error', reject)

    const INDIGO  = '#4F46E5'
    const SLATE   = '#64748B'
    const DARK    = '#0F172A'
    const LIGHT   = '#F8FAFC'
    const BORDER  = '#E2E8F0'
    const W       = 595 - 100          // usable width (A4 minus margins)
    const fmt     = (n: number) => `$${n.toFixed(2)}`
    const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '—'

    // ── Header bar ────────────────────────────────────────────────────────
    doc.rect(50, 40, W, 60).fill(INDIGO)
    doc.fillColor('white').fontSize(22).font('Helvetica-Bold').text('PURCHASE ORDER', 65, 55)
    doc.fontSize(11).font('Helvetica').text((po as any).po_number, 65, 80)

    // Status badge (top right)
    const statusLabel = String((po as any).status ?? '').toUpperCase()
    doc.fontSize(9).font('Helvetica-Bold').text(statusLabel, 430, 68, { width: 115, align: 'right' })

    doc.y = 120

    // ── Supplier + dates ──────────────────────────────────────────────────
    const supplier = (po as any).supplier
    doc.fillColor(DARK).fontSize(9).font('Helvetica-Bold').text('SUPPLIER', 50, doc.y)
    doc.font('Helvetica').fillColor(SLATE)
    if (supplier) {
      doc.text(supplier.name ?? '—', 50, doc.y + 4)
      if (supplier.address)       doc.text(supplier.address, 50, doc.y + 4)
      if (supplier.contact_email) doc.text(supplier.contact_email, 50, doc.y + 4)
      if (supplier.contact_phone) doc.text(supplier.contact_phone, 50, doc.y + 4)
    } else {
      doc.text('—', 50, doc.y + 4)
    }

    const dateX = 370
    let dateY = 120
    const dateRow = (label: string, value: string) => {
      doc.fillColor(DARK).font('Helvetica-Bold').fontSize(9).text(label, dateX, dateY, { width: 80 })
      doc.fillColor(SLATE).font('Helvetica').text(value, dateX + 85, dateY, { width: 160 })
      dateY += 16
    }
    dateRow('Order Date:',    fmtDate((po as any).order_date))
    dateRow('Expected Date:', fmtDate((po as any).expected_date))

    doc.y = Math.max(doc.y + 16, dateY + 10)

    if ((po as any).notes) {
      doc.fillColor(DARK).font('Helvetica-Bold').fontSize(9).text('NOTES', 50, doc.y)
      doc.fillColor(SLATE).font('Helvetica').text((po as any).notes, 50, doc.y + 4, { width: W })
      doc.y += 20
    }

    doc.moveDown(0.5)

    // ── Line items table ──────────────────────────────────────────────────
    const tableTop = doc.y
    const COL = { item: 50, sku: 230, qty: 310, unit: 375, total: 455 }

    // Header row
    doc.rect(50, tableTop, W, 22).fill(SLATE)
    doc.fillColor('white').font('Helvetica-Bold').fontSize(8)
    doc.text('ITEM', COL.item + 4, tableTop + 7)
    doc.text('SKU',  COL.sku  + 4, tableTop + 7)
    doc.text('QTY',  COL.qty  + 4, tableTop + 7)
    doc.text('UNIT PRICE', COL.unit + 4, tableTop + 7)
    doc.text('LINE TOTAL', COL.total + 4, tableTop + 7)

    let rowY = tableTop + 22
    let grandTotal = 0
    const lines: any[] = (po as any).lines ?? []

    lines.forEach((l, idx) => {
      const lineTotal = (l.quantity_ordered ?? 0) * (l.unit_cost ?? 0)
      grandTotal += lineTotal
      const rowH = 28

      if (idx % 2 === 0) doc.rect(50, rowY, W, rowH).fill(LIGHT)
      doc.rect(50, rowY, W, rowH).strokeColor(BORDER).stroke()

      doc.fillColor(DARK).font('Helvetica-Bold').fontSize(8)
         .text(l.product?.name ?? '—', COL.item + 4, rowY + 6, { width: 175, ellipsis: true })
      doc.fillColor(SLATE).font('Helvetica').fontSize(8)
         .text(`${l.product?.unit_of_measure ?? ''}`, COL.item + 4, rowY + 17, { width: 175 })

      doc.fillColor(SLATE).font('Helvetica').fontSize(8)
         .text(l.product?.sku ?? '—', COL.sku + 4, rowY + 10, { width: 74 })
         .text(String(l.quantity_ordered ?? 0), COL.qty + 4, rowY + 10, { width: 60 })
         .text(fmt(l.unit_cost ?? 0), COL.unit + 4, rowY + 10, { width: 75 })
      doc.fillColor(DARK).font('Helvetica-Bold').fontSize(8)
         .text(fmt(lineTotal), COL.total + 4, rowY + 10, { width: 90 })

      rowY += rowH
    })

    // Total row
    doc.rect(50, rowY, W, 28).fill(INDIGO)
    doc.fillColor('white').font('Helvetica-Bold').fontSize(10)
       .text('TOTAL', COL.total - 60, rowY + 8, { width: 55, align: 'right' })
       .text(fmt(grandTotal), COL.total + 4, rowY + 8, { width: 90 })

    rowY += 40

    // ── Footer ────────────────────────────────────────────────────────────
    doc.fillColor(SLATE).font('Helvetica').fontSize(8)
       .text('Generated by Stocked', 50, rowY, { align: 'center', width: W })

    doc.end()
  })

  const pdf = Buffer.concat(chunks)
  const filename = `${(po as any).po_number}.pdf`

  return new NextResponse(pdf, {
    headers: {
      'Content-Type':        'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length':      String(pdf.length),
    },
  })
}
