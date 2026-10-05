/**
 * Generates the Stocked workflow diagram as a PDF.
 *
 *   node scripts/workflow-diagram.mjs [output.pdf]
 *
 * Three landscape pages:
 *   1. Materials — request to job cost, and the accounting that follows
 *   2. Tools & fixed assets — register, custody, certificates, disposal
 *   3. The controls that run alongside both
 *
 * Drawn with pdfkit (already used for purchase-order PDFs) so it needs no
 * extra tooling: re-run it whenever the product changes.
 */
import PDFDocument from 'pdfkit'
import { createWriteStream } from 'fs'

const OUT = process.argv[2] ?? 'stocked-workflow.pdf'

// ── Palette ───────────────────────────────────────────────────────────────────
const INK      = '#0F172A'
const MUTED    = '#64748B'
const LINE     = '#CBD5E1'
const PAGE_BG  = '#FFFFFF'

/** One colour per owner, so a glance tells you who does what. */
const ACTORS = {
  crew:    { fill: '#EEF2FF', stroke: '#6366F1', text: '#3730A3', label: 'Field crew'            },
  approve: { fill: '#FEF3C7', stroke: '#D97706', text: '#92400E', label: 'Approver (manager)'    },
  procure: { fill: '#DCFCE7', stroke: '#16A34A', text: '#166534', label: 'Procurement'           },
  finance: { fill: '#E0F2FE', stroke: '#0284C7', text: '#075985', label: 'Finance'               },
  system:  { fill: '#F1F5F9', stroke: '#94A3B8', text: '#334155', label: 'Stocked (automatic)'   },
}

const PAGE = { size: 'A4', layout: 'landscape', margin: 32 }
const W = 842, H = 595

// ── Drawing helpers ───────────────────────────────────────────────────────────
function pageFrame(doc, title, subtitle, pageNo) {
  doc.rect(0, 0, W, H).fill(PAGE_BG)

  doc.roundedRect(32, 26, 10, 10, 2).fill('#4F46E5')
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(16).text('Stocked', 50, 24)
  doc.fillColor(MUTED).font('Helvetica').fontSize(9)
     .text('stocked.tech', 50, 42)

  doc.fillColor(INK).font('Helvetica-Bold').fontSize(13).text(title, 160, 26, { width: 560 })
  doc.fillColor(MUTED).font('Helvetica').fontSize(9).text(subtitle, 160, 44, { width: 560 })

  doc.fillColor(MUTED).fontSize(8).text(`Page ${pageNo} of 3`, W - 120, 30, { width: 88, align: 'right' })
  doc.moveTo(32, 62).lineTo(W - 32, 62).strokeColor(LINE).lineWidth(1).stroke()
}

function footer(doc, note) {
  doc.moveTo(32, H - 44).lineTo(W - 32, H - 44).strokeColor(LINE).lineWidth(1).stroke()
  doc.fillColor(MUTED).font('Helvetica').fontSize(8)
     .text(note, 32, H - 36, { width: W - 64 })
}

/** A step box. Returns its anchor points so arrows can attach. */
function box(doc, { x, y, w = 118, h = 56, actor = 'system', title, sub, badge }) {
  const a = ACTORS[actor]
  doc.roundedRect(x, y, w, h, 7).fillAndStroke(a.fill, a.stroke)
  doc.lineWidth(1)

  doc.fillColor(a.text).font('Helvetica-Bold').fontSize(8.5)
     .text(title, x + 8, y + 9, { width: w - 16, align: 'center' })
  if (sub) {
    doc.fillColor(MUTED).font('Helvetica').fontSize(7)
       .text(sub, x + 8, y + h - 20, { width: w - 16, align: 'center' })
  }
  if (badge) {
    const bw = doc.widthOfString(badge, { fontSize: 6 }) + 10
    doc.roundedRect(x + w - bw - 5, y - 7, bw, 13, 6).fillAndStroke('#FFFFFF', a.stroke)
    doc.fillColor(a.text).font('Helvetica-Bold').fontSize(6)
       .text(badge, x + w - bw - 5, y - 3.5, { width: bw, align: 'center' })
  }
  return {
    left:   { x, y: y + h / 2 },
    right:  { x: x + w, y: y + h / 2 },
    top:    { x: x + w / 2, y },
    bottom: { x: x + w / 2, y: y + h },
  }
}

function arrowHead(doc, x, y, dir, color) {
  const s = 5
  doc.save().fillColor(color)
  if (dir === 'right')      doc.moveTo(x, y).lineTo(x - s, y - s).lineTo(x - s, y + s).fill()
  else if (dir === 'left')  doc.moveTo(x, y).lineTo(x + s, y - s).lineTo(x + s, y + s).fill()
  else if (dir === 'down')  doc.moveTo(x, y).lineTo(x - s, y - s).lineTo(x + s, y - s).fill()
  else                      doc.moveTo(x, y).lineTo(x - s, y + s).lineTo(x + s, y + s).fill()
  doc.restore()
}

/** Straight connector with an arrowhead, and an optional label on the line. */
function arrow(doc, from, to, { label, dashed, color = '#94A3B8' } = {}) {
  doc.save().strokeColor(color).lineWidth(1.2)
  if (dashed) doc.dash(3, { space: 3 })
  doc.moveTo(from.x, from.y).lineTo(to.x, to.y).stroke()
  doc.undash().restore()

  const dir = Math.abs(to.x - from.x) > Math.abs(to.y - from.y)
    ? (to.x > from.x ? 'right' : 'left')
    : (to.y > from.y ? 'down' : 'up')
  arrowHead(doc, to.x, to.y, dir, color)

  if (label) {
    const mx = (from.x + to.x) / 2, my = (from.y + to.y) / 2
    const tw = 54
    doc.fillColor(MUTED).font('Helvetica').fontSize(6)
       .text(label, mx - tw / 2, my - 13, { width: tw, align: 'center', height: 9 })
  }
}

/** Elbow connector: along x first, then y (or the reverse). */
function elbow(doc, from, to, { via = 'x', label, color = '#94A3B8' } = {}) {
  const mid = via === 'x' ? { x: to.x, y: from.y } : { x: from.x, y: to.y }
  doc.save().strokeColor(color).lineWidth(1.2)
  doc.moveTo(from.x, from.y).lineTo(mid.x, mid.y).lineTo(to.x, to.y).stroke()
  doc.restore()
  const dir = via === 'x'
    ? (to.y > from.y ? 'down' : 'up')
    : (to.x > from.x ? 'right' : 'left')
  arrowHead(doc, to.x, to.y, dir, color)
  if (label) {
    doc.fillColor(MUTED).font('Helvetica').fontSize(6.5)
       .text(label, mid.x + 6, (mid.y + to.y) / 2 - 4, { width: 90 })
  }
}

function legend(doc, y, actors) {
  let x = 32
  for (const key of actors) {
    const a = ACTORS[key]
    doc.roundedRect(x, y, 9, 9, 2).fillAndStroke(a.fill, a.stroke)
    doc.fillColor(MUTED).font('Helvetica').fontSize(7.5).text(a.label, x + 14, y + 1)
    x += doc.widthOfString(a.label, { fontSize: 7.5 }) + 34
  }
}

function sectionLabel(doc, x, y, text) {
  doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(7.5)
     .text(text.toUpperCase(), x, y, { characterSpacing: 0.8 })
}

// ── Page 1: materials ─────────────────────────────────────────────────────────
function pageMaterials(doc) {
  pageFrame(doc, 'How materials flow', 'From a crew request to a costed job - and the accounting that follows.', 1)
  legend(doc, 74, ['crew', 'approve', 'procure', 'finance', 'system'])

  const R1 = 112, R2 = 266, R3 = 420
  const col = i => 32 + i * 158

  sectionLabel(doc, 32, R1 - 16, 'Request and approve')
  const a1 = box(doc, { x: col(0), y: R1, actor: 'crew',    title: 'Crew requests materials', sub: 'Phone, with job + cost center' })
  const a2 = box(doc, { x: col(1), y: R1, actor: 'approve', title: 'Direct manager endorses', sub: 'Always sees it first', badge: 'Pro' })
  const a3 = box(doc, { x: col(2), y: R1, actor: 'approve', title: 'Climbs the reporting line', sub: 'Until a limit covers it' })
  const a4 = box(doc, { x: col(3), y: R1, actor: 'procure', title: 'Procurement raises a PO', sub: 'Prices carried over' })
  const a5 = box(doc, { x: col(4), y: R1, actor: 'approve', title: 'PO approved', sub: 'Price change is shown' })

  arrow(doc, a1.right, { x: a2.left.x - 6, y: a2.left.y })
  arrow(doc, a2.right, { x: a3.left.x - 6, y: a3.left.y }, { label: 'over limit' })
  arrow(doc, a3.right, { x: a4.left.x - 6, y: a4.left.y }, { label: 'approved' })
  arrow(doc, a4.right, { x: a5.left.x - 6, y: a5.left.y })

  sectionLabel(doc, 32, R2 - 16, 'Order, receive and issue')
  const b5 = box(doc, { x: col(4), y: R2, actor: 'procure', title: 'Sent to vendor', sub: 'PDF purchase order' })
  const b4 = box(doc, { x: col(3), y: R2, actor: 'crew',    title: 'Goods received', sub: 'Scan on delivery (GRN)' })
  const b3 = box(doc, { x: col(2), y: R2, actor: 'system',  title: 'Stock on hand', sub: 'Valued, by location' })
  const b2 = box(doc, { x: col(1), y: R2, actor: 'crew',    title: 'Issued to the job', sub: 'Cost center + job code' })
  const b1 = box(doc, { x: col(0), y: R2, actor: 'system',  title: 'Job cost', sub: 'Cost Analysis report' })

  elbow(doc, a5.bottom, b5.top, { via: 'y' })
  arrow(doc, b5.left, { x: b4.right.x + 6, y: b4.right.y })
  arrow(doc, b4.left, { x: b3.right.x + 6, y: b3.right.y }, { label: 'stock up' })
  arrow(doc, b3.left, { x: b2.right.x + 6, y: b2.right.y })
  arrow(doc, b2.left, { x: b1.right.x + 6, y: b1.right.y }, { label: 'stock down' })

  sectionLabel(doc, 32, R3 - 16, 'Accounting')
  const c1 = box(doc, { x: col(0), y: R3, actor: 'system',  title: 'Dr Inventory / Cr GR/IR', sub: 'Posted at goods receipt' })
  const c2 = box(doc, { x: col(1), y: R3, actor: 'finance', title: 'Vendor invoice recorded', sub: 'Dr GR/IR / Cr Payables' })
  const c3 = box(doc, { x: col(2), y: R3, actor: 'finance', title: 'Three-way match', sub: 'PO vs receipt vs invoice' })
  const c4 = box(doc, { x: col(3), y: R3, actor: 'system',  title: 'Journal export', sub: 'Excel or CSV' })
  const c5 = box(doc, { x: col(4), y: R3, actor: 'finance', title: 'Your accounting system', sub: 'QuickBooks, Xero, MYOB' })

  elbow(doc, b1.bottom, c1.top, { via: 'y' })
  arrow(doc, c1.right, { x: c2.left.x - 6, y: c2.left.y })
  arrow(doc, c2.right, { x: c3.left.x - 6, y: c3.left.y })
  arrow(doc, c3.right, { x: c4.left.x - 6, y: c4.left.y }, { label: 'variance' })
  arrow(doc, c4.right, { x: c5.left.x - 6, y: c5.left.y })

  // Side notes
  doc.fillColor(MUTED).font('Helvetica').fontSize(7.5)
  doc.text('GR/IR clearing keeps a receipt and its invoice from being counted twice.', 32, R3 + 68, { width: 360 })
  doc.text('On Starter, a purchase order goes straight from draft to the vendor - no approval step.', 420, R3 + 68, { width: 390 })

  footer(doc, 'Every movement is recorded against the job that consumed it, so job costs do not depend on anyone remembering to write them down.')
}

// ── Page 2: tools and assets ──────────────────────────────────────────────────
function pageAssets(doc) {
  pageFrame(doc, 'Tools and fixed assets', 'One register: what you own, who has it, whether it is in date, and what it is worth.', 2)
  legend(doc, 74, ['crew', 'approve', 'system', 'finance'])

  const R1 = 110, R2 = 262, R3 = 414
  const col = i => 32 + i * 158

  sectionLabel(doc, 32, R1 - 16, 'Custody')
  const t1 = box(doc, { x: col(0), y: R1, actor: 'system',  title: 'Asset registered', sub: 'Tag, serial, cost, category' })
  const t2 = box(doc, { x: col(1), y: R1, actor: 'crew',    title: 'Checked out', sub: 'To a person, van, or job' })
  const t3 = box(doc, { x: col(2), y: R1, actor: 'approve', title: 'Approval (optional)', sub: 'Per tool or per category', badge: 'Pro' })
  const t4 = box(doc, { x: col(3), y: R1, actor: 'system',  title: 'Due back', sub: 'Overdue list and alerts' })
  const t5 = box(doc, { x: col(4), y: R1, actor: 'crew',    title: 'Checked in', sub: 'Back on the shelf' })

  arrow(doc, t1.right, { x: t2.left.x - 6, y: t2.left.y })
  arrow(doc, t2.right, { x: t3.left.x - 6, y: t3.left.y })
  arrow(doc, t3.right, { x: t4.left.x - 6, y: t4.left.y })
  arrow(doc, t4.right, { x: t5.left.x - 6, y: t5.left.y })
  // Return loop
  doc.save().strokeColor('#94A3B8').lineWidth(1.2).dash(3, { space: 3 })
  doc.moveTo(t5.bottom.x, t5.bottom.y).lineTo(t5.bottom.x, R1 + 80)
     .lineTo(t2.bottom.x, R1 + 80).lineTo(t2.bottom.x, t2.bottom.y + 2).stroke()
  doc.undash().restore()
  arrowHead(doc, t2.bottom.x, t2.bottom.y + 2, 'up', '#94A3B8')
  doc.fillColor(MUTED).font('Helvetica').fontSize(6.5)
     .text('available again', t2.bottom.x + 54, R1 + 84)

  sectionLabel(doc, 32, R2 - 16, 'Safety and losses')
  const s1 = box(doc, { x: col(0), y: R2, actor: 'system',  title: 'Inspection due', sub: 'Repeats on its cycle' })
  const s2 = box(doc, { x: col(1), y: R2, actor: 'crew',    title: 'Check carried out', sub: 'Signed off by the user' })
  const s3 = box(doc, { x: col(2), y: R2, actor: 'system',  title: 'Certificate recorded', sub: 'Number and expiry' })
  const s4 = box(doc, { x: col(3), y: R2, actor: 'system',  title: 'Expiry flagged', sub: '30 days ahead' })
  const s5 = box(doc, { x: col(4), y: R2, actor: 'crew',    title: 'Reported lost or stolen', sub: 'From site, in seconds' })

  arrow(doc, s1.right, { x: s2.left.x - 6, y: s2.left.y })
  arrow(doc, s2.right, { x: s3.left.x - 6, y: s3.left.y })
  arrow(doc, s3.right, { x: s4.left.x - 6, y: s4.left.y })
  elbow(doc, s4.top, { x: t4.bottom.x, y: t4.bottom.y + 2 }, { via: 'y', color: '#DC2626' })
  doc.fillColor('#DC2626').font('Helvetica').fontSize(6.5)
     .text('out of date: warn or block check-out', col(2) + 10, R2 - 30, { width: 160 })

  sectionLabel(doc, 32, R3 - 16, 'Value on your books')
  const v1 = box(doc, { x: col(0), y: R3, actor: 'finance', title: 'Depreciation run', sub: 'Straight line or reducing' })
  const v2 = box(doc, { x: col(1), y: R3, actor: 'system',  title: 'Book value updated', sub: 'Roll-forward report' })
  const v3 = box(doc, { x: col(2), y: R3, actor: 'finance', title: 'Sold, scrapped, written off', sub: 'Gain or loss recognised' })
  const v4 = box(doc, { x: col(3), y: R3, actor: 'system',  title: 'Journal entries', sub: 'Into the same export' })

  arrow(doc, v1.right, { x: v2.left.x - 6, y: v2.left.y })
  arrow(doc, v2.right, { x: v3.left.x - 6, y: v3.left.y })
  arrow(doc, v3.right, { x: v4.left.x - 6, y: v4.left.y })
  elbow(doc, { x: s5.bottom.x, y: s5.bottom.y + 16 }, { x: v3.top.x, y: v3.top.y - 2 }, { via: 'x', color: '#94A3B8' })
  doc.save().strokeColor('#94A3B8').lineWidth(1.2)
     .moveTo(s5.bottom.x, s5.bottom.y).lineTo(s5.bottom.x, s5.bottom.y + 16).stroke().restore()

  doc.fillColor(MUTED).font('Helvetica').fontSize(7.5)
     .text('A lost tool leaves service immediately and the loss register carries the value until it is found or written off.',
           col(3) + 6, R3 + 64, { width: 300 })

  footer(doc, 'The same record is the tool on site and the asset on the balance sheet - no second register to keep in step.')
}

// ── Page 3: controls ──────────────────────────────────────────────────────────
function pageControls(doc) {
  pageFrame(doc, 'The controls running alongside', 'What stops the common ways stock, tools and money go missing.', 3)

  const CARDS = [
    ['Separation of duties',   'The person who raises a purchase order cannot approve the receipt of those goods. Six roles, enforced on the server.'],
    ['Delegation of authority','Each member has a manager and an approval limit. Spend climbs the line until someone has the authority. Nobody approves their own.'],
    ['Approval trail',         'Every endorsement, approval and rejection is kept on the document with names, job titles, times and notes.'],
    ['Stock counts',           'Physical counts logged with who was present, variances approved before they post to the ledger.'],
    ['Cost attribution',       'Issues can be required to carry a cost center or job code, so spend cannot land in a general bucket.'],
    ['Audit log',              'Who changed what, and when, across the account - searchable and exportable on every plan.'],
    ['Certificates',           'Inspection and calibration dates sit with the tool; uncertified kit can be blocked from leaving the store.'],
    ['Blind receipts',         'Goods received without a purchase order are held as a draft until someone confirms the value.'],
    ['Three-way match',        'Purchase order, goods received and vendor invoice are compared; the difference posts as price variance.'],
  ]

  const cw = 252, ch = 104
  CARDS.forEach(([title, body], i) => {
    const x = 32 + (i % 3) * (cw + 16)
    const y = 86 + Math.floor(i / 3) * (ch + 16)
    doc.roundedRect(x, y, cw, ch, 8).fillAndStroke('#F8FAFC', '#E2E8F0')
    doc.roundedRect(x, y, 3, ch, 2).fill('#4F46E5')
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(9.5).text(title, x + 14, y + 14, { width: cw - 28 })
    doc.fillColor(MUTED).font('Helvetica').fontSize(8).text(body, x + 14, y + 32, { width: cw - 28, lineGap: 1.5 })
  })

  footer(doc, `Generated ${new Date().toISOString().slice(0, 10)} from the live product. Pro features are marked; everything else is on every plan.`)
}

// ── Build ─────────────────────────────────────────────────────────────────────
const doc = new PDFDocument({ ...PAGE, autoFirstPage: false })
const stream = createWriteStream(OUT)
doc.pipe(stream)

/**
 * Every element is positioned absolutely, so the page margins only serve to
 * make pdfkit spill text onto a new page when something sits near the bottom
 * edge (the footer did exactly that). Zero them after each page is added.
 */
function addPage() {
  doc.addPage(PAGE)
  doc.page.margins = { top: 0, bottom: 0, left: 0, right: 0 }
}

addPage(); pageMaterials(doc)
addPage(); pageAssets(doc)
addPage(); pageControls(doc)

doc.end()
stream.on('finish', () => console.log(`wrote ${OUT}`))
