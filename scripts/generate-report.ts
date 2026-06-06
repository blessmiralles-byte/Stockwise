import PDFDocument from 'pdfkit'
import fs from 'fs'
import path from 'path'

const OUT = path.join(process.cwd(), 'StockWise-Supply-Chain-Review.pdf')
const doc = new PDFDocument({ margin: 60, size: 'A4', bufferPages: true })
doc.pipe(fs.createWriteStream(OUT))

// ── Palette ────────────────────────────────────────────────────────────────
const C = {
  indigo:    '#4F46E5',
  indigoDark:'#3730A3',
  red:       '#DC2626',
  yellow:    '#D97706',
  green:     '#16A34A',
  gray900:   '#111827',
  gray600:   '#4B5563',
  gray400:   '#9CA3AF',
  gray100:   '#F3F4F6',
  white:     '#FFFFFF',
}

const PAGE_W = doc.page.width - 120   // usable width (margins 60 each side)

// ── Helpers ────────────────────────────────────────────────────────────────
function hRule(y?: number) {
  if (y !== undefined) doc.y = y
  doc.moveTo(60, doc.y).lineTo(doc.page.width - 60, doc.y)
    .strokeColor(C.gray100).lineWidth(1).stroke()
  doc.moveDown(0.4)
}

function sectionHeading(text: string) {
  doc.moveDown(1)
  hRule()
  doc.fontSize(11).fillColor(C.indigo).font('Helvetica-Bold')
    .text(text.toUpperCase(), { characterSpacing: 0.8 })
  doc.moveDown(0.5)
}

function bullet(text: string, indent = 0) {
  const x = 60 + indent
  doc.fontSize(10).fillColor(C.gray900).font('Helvetica')
  const bullet = indent ? '◦' : '•'
  doc.text(`${bullet}  ${text}`, x, doc.y, { width: PAGE_W - indent, lineGap: 2 })
  doc.moveDown(0.25)
}

function findingBlock(
  emoji: string,
  title: string,
  body: string,
  rec: string,
  accent: string
) {
  const startY = doc.y
  // left accent bar
  doc.rect(60, startY, 3, 1).fillColor(accent)   // placeholder height — drawn after

  doc.fontSize(10.5).fillColor(accent).font('Helvetica-Bold')
    .text(`${emoji}  ${title}`, 72, startY, { width: PAGE_W - 12 })
  doc.moveDown(0.3)

  doc.fontSize(9.5).fillColor(C.gray600).font('Helvetica')
    .text(body, 72, doc.y, { width: PAGE_W - 12, lineGap: 2 })
  doc.moveDown(0.3)

  doc.fontSize(9).fillColor(C.gray900).font('Helvetica-Bold').text('Recommendation: ', 72, doc.y, { continued: true })
  doc.font('Helvetica').fillColor(C.gray600).text(rec, { width: PAGE_W - 12, lineGap: 2 })

  const endY = doc.y
  // draw the left accent bar now that we know height
  doc.rect(60, startY, 3, endY - startY + 4).fillColor(accent).fill()

  doc.moveDown(0.9)
}

function tableRow(cells: string[], widths: number[], isHeader = false, bg?: string) {
  const rowH = 20
  const x0   = 60
  let x = x0
  const y = doc.y

  if (bg) doc.rect(x0, y, PAGE_W, rowH).fillColor(bg).fill()

  cells.forEach((cell, i) => {
    doc.fontSize(isHeader ? 8 : 9)
      .fillColor(isHeader ? C.indigo : C.gray900)
      .font(isHeader ? 'Helvetica-Bold' : 'Helvetica')
      .text(cell, x + 5, y + 5, { width: widths[i] - 10, lineBreak: false })
    x += widths[i]
  })

  doc.moveTo(x0, y + rowH).lineTo(x0 + PAGE_W, y + rowH)
    .strokeColor(C.gray100).lineWidth(0.5).stroke()

  doc.y = y + rowH + 2
}

// ══════════════════════════════════════════════════════════════════════════════
// COVER
// ══════════════════════════════════════════════════════════════════════════════
doc.rect(0, 0, doc.page.width, 200).fillColor(C.indigoDark).fill()

doc.fontSize(26).fillColor(C.white).font('Helvetica-Bold')
  .text('StockWise', 60, 55, { characterSpacing: 1 })

doc.fontSize(13).fillColor('#A5B4FC').font('Helvetica')
  .text('Supply Chain Consultant Review', 60, 90)

doc.fontSize(9).fillColor('#C7D2FE')
  .text(`Prepared: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, 60, 115)
  .text('Classification: Internal / Confidential', 60, 130)

doc.y = 220

// ── Exec summary ──────────────────────────────────────────────────────────
sectionHeading('Executive Summary')

doc.fontSize(10).fillColor(C.gray900).font('Helvetica')
  .text(
    'StockWise demonstrates a solid operational foundation: multi-location tracking, FIFO/average costing, ' +
    'batch and expiry management, job-order consumption, atomic database transactions, and a per-item ledger ' +
    'with debit/credit running balances. These are capabilities many SME systems handle poorly or not at all.',
    { lineGap: 3 }
  )
doc.moveDown(0.5)
doc.text(
  'However, several structural gaps — particularly around procurement workflows, lead-time-aware reorder logic, ' +
  'and material planning — limit the system\'s ability to drive reliable supply chain decisions. ' +
  'This report prioritises those gaps and provides an actionable improvement roadmap.',
  { lineGap: 3 }
)

// ── Strengths ──────────────────────────────────────────────────────────────
sectionHeading('What Is Working Well')
const strengths = [
  'FIFO and weighted-average costing implemented correctly with atomic DB-level transactions',
  'Multi-location hierarchy (warehouse → room → shelf) with per-location stock balances',
  'Batch and expiry tracking with visual alerts (critical / soon / expired)',
  'Job order consumption — materials issued against a job with cost roll-up',
  'Per-item inventory ledger with debit / credit columns and running balance',
  'Demand forecasting baseline with configurable lookback and forecast windows',
  'Role-based access control (admin / manager / viewer) enforced at the API layer',
  'Barcode scan integrated directly into the transaction form — reduces keying errors',
]
strengths.forEach(s => bullet(s))

// ══════════════════════════════════════════════════════════════════════════════
// FINDINGS
// ══════════════════════════════════════════════════════════════════════════════
doc.addPage()

// ── Critical ──────────────────────────────────────────────────────────────
sectionHeading('🔴  Critical — Process Gaps That Will Cause Data Problems')

findingBlock(
  '1.',
  'No Purchase Order workflow',
  'A "purchase" transaction adds stock but there is no PO → GRN (Goods Received Note) cycle. ' +
  'You cannot track what was ordered versus what arrived, detect short shipments or over-deliveries, ' +
  'or give receiving staff a document to receive against.',
  'Add a purchase_orders table with line items. A purchase transaction should reference a PO line and close it. ' +
  'This also gives management a committed cost figure before goods physically arrive.',
  C.red
)

findingBlock(
  '2.',
  'Reorder trigger ignores supplier lead time',
  'The current model flags an item when "days remaining" is low. The correct trigger is:\n' +
  'Reorder when: current_stock ≤ (avg_daily × lead_time_days) + safety_stock\n' +
  'An item with a 14-day supplier lead time showing "15 days remaining" looks fine — it is not.',
  'Add lead_time_days to products or a suppliers table. Recalculate reorder points as ' +
  'avg_daily × (lead_time + review_period). Add a safety stock field derived from demand ' +
  'variability (σ of daily consumption × service-level Z-score).',
  C.red
)

findingBlock(
  '3.',
  'No cycle count / physical inventory reconciliation workflow',
  'Adjustments exist but are ad hoc. There is no structured process to schedule a count, ' +
  'freeze a snapshot, record physical counts, review variances, and post approved adjustments. ' +
  'Without this, inventory accuracy drifts silently — shrinkage and mis-picks become invisible.',
  'Add a stock_counts module with the workflow: Create count → freeze snapshot → enter physical counts → ' +
  'system shows variance by line → manager approves → adjustments post automatically.',
  C.red
)

// ── High ──────────────────────────────────────────────────────────────────
doc.addPage()
sectionHeading('🟡  High — Missing Capabilities That Limit Usefulness')

findingBlock(
  '4.',
  'No Bill of Materials (BOM)',
  'Job orders consume individual items, but there is no way to define a standard material list for a job type. ' +
  'Every job requires manually selecting items one by one, which is slow and error-prone.',
  'Add bom_templates linked to job types. When a job order is created, pre-populate the expected ' +
  'materials list. This also enables MRP-lite: given N open jobs, calculate what stock is required.',
  C.yellow
)

findingBlock(
  '5.',
  'No supplier management',
  'There are no supplier records. You cannot track who you buy each product from, their lead times, ' +
  'pricing history, or which supplier was used for a given purchase batch.',
  'Add a suppliers table (name, contact, lead_time_days, payment_terms). Link purchase orders and ' +
  'inventory batches to suppliers. This also feeds directly into fixing the forecasting lead-time gap.',
  C.yellow
)

findingBlock(
  '6.',
  'Forecasting model has no velocity classification (ABC/XYZ)',
  'All items receive equal forecast weight regardless of consumption value or variability. ' +
  'ABC = value classification (A: top 70% of stock value). XYZ = demand stability (X: stable, Z: erratic). ' +
  'A+X items need tight safety stock; C+Z items should be managed on-demand only.',
  'Add an ABC/XYZ classification page under Forecasting. Compute automatically from transaction history ' +
  'and use the classification to adjust reorder recommendations and safety stock targets.',
  C.yellow
)

findingBlock(
  '7.',
  'No inventory valuation / COGS report',
  'There is no period-end report showing: opening stock value, purchases, issues (COGS), and closing stock value. ' +
  'Finance cannot close their books using StockWise data without this.',
  'Add a /reports/valuation page with a date-range selector. Compute the standard inventory movement statement ' +
  'from transactions and unit costs.',
  C.yellow
)

findingBlock(
  '8.',
  'Job orders have no material availability check',
  'Given current open job orders, the system cannot answer: "Do I have enough stock to complete all of them?" ' +
  'This forces planners to check manually or rely on memory.',
  'Add a "Check Materials" action on the Job Orders page that compares BOM-required materials against ' +
  'current stock and flags shortages. This is the highest single-value feature for job-based businesses.',
  C.yellow
)

// ── Medium ─────────────────────────────────────────────────────────────────
doc.addPage()
sectionHeading('🟢  Medium — Quality and Accuracy Improvements')

findingBlock(
  '9.',
  'Batch traceability is one-directional',
  'You can see what batches are in stock, but cannot answer: "Which job orders used batch LOT-2025-003?" ' +
  'or "Which customers received items from the recalled batch?" Critical for food, pharma, and regulated products.',
  'Link inventory_transactions to inventory_batches when consuming FIFO items. Add a batch trace report: ' +
  'enter a batch number, see its complete journey from purchase to consumption.',
  C.green
)

findingBlock(
  '10.',
  'Forecasting does not account for seasonality',
  'A 90-day summer average will systematically under-predict peak-season demand. ' +
  'The model will recommend too little stock before high-demand periods.',
  'Add a year-over-year comparison view — current 30-day consumption vs the same 30 days last year. ' +
  'Not a full seasonal model, but enough for an SME operator to see the pattern and adjust manually.',
  C.green
)

findingBlock(
  '11.',
  'No stock aging / slow-mover report',
  'Current stock is visible but not how long items have been sitting. Dead stock is invisible until ' +
  'a cycle count is performed. Cash tied up in ageing inventory goes undetected.',
  'Add a stock aging report using inventory_batches.purchase_date. Show items with no consumption ' +
  'in 90 / 180 / 365 days. Flag them as slow-moving and surface their total tied-up value.',
  C.green
)

findingBlock(
  '12.',
  'Transfers have no approval step',
  'Any manager can transfer stock anywhere without review. For multi-site businesses an unauthorised ' +
  'transfer from a high-performing location to a slow one is a real risk.',
  'Add an optional requires_approval flag per location. Transfers out of flagged locations generate ' +
  'a pending request that the location manager must approve before stock physically moves.',
  C.green
)

// ══════════════════════════════════════════════════════════════════════════════
// ROADMAP
// ══════════════════════════════════════════════════════════════════════════════
doc.addPage()
sectionHeading('Prioritised Improvement Roadmap')

const colW = [60, 170, 220, 85]
tableRow(['Phase', 'Feature', 'Business Justification', 'Impact'], colW, true, C.gray100)

const roadmap = [
  ['1', 'Supplier management + lead times',         'Fixes broken reorder logic immediately',                    'Critical'],
  ['1', 'Purchase Order → GRN workflow',            'Closes the biggest procurement process gap',                'Critical'],
  ['2', 'BOM templates per job type',               'Enables material planning for job-based operations',        'High'],
  ['2', 'Cycle counting module',                    'Maintains inventory accuracy over time',                    'High'],
  ['2', 'Inventory valuation / COGS report',        'Required for finance to close books from system data',      'High'],
  ['3', 'MRP-lite: job material availability check','Prevents job delays due to stock shortages',               'High'],
  ['3', 'ABC/XYZ classification',                   'Makes forecasting actionable, not just informational',      'Medium'],
  ['3', 'Reverse batch traceability',               'Required for recalls and regulated products',               'Medium'],
  ['4', 'Safety stock calculator',                  'Makes reorder points statistically defensible',             'Medium'],
  ['4', 'Stock aging / slow-mover report',          'Surfaces dead stock and unlocks tied-up cash',              'Medium'],
]

roadmap.forEach((row, i) => {
  if (doc.y > doc.page.height - 100) doc.addPage()
  tableRow(row, colW, false, i % 2 === 0 ? undefined : '#FAFAFA')
})

// ── Bottom line ────────────────────────────────────────────────────────────
sectionHeading('Bottom Line')

doc.fontSize(10).fillColor(C.gray900).font('Helvetica')
  .text(
    'StockWise is already ahead of most off-the-shelf SME tools on costing rigour and job-order tracking. ' +
    'The two gaps that hurt most operationally right now are the absence of a PO workflow (blind receiving) ' +
    'and the lead-time blind spot in forecasting (reorders trigger too late).',
    { lineGap: 3 }
  )
doc.moveDown(0.5)
doc.text(
  'Fix those two first and the system becomes genuinely reliable for procurement decisions. ' +
  'Everything else in this report is an enhancement layer built on what is already a strong foundation.',
  { lineGap: 3 }
)

// ── Footers on all pages ───────────────────────────────────────────────────
const range  = doc.bufferedPageRange()
const total  = range.count

for (let i = 0; i < total; i++) {
  doc.switchToPage(i)
  doc.fontSize(8).fillColor(C.gray400).font('Helvetica')
    .text(
      `StockWise Supply Chain Review  ·  Page ${i + 1} of ${total}  ·  Confidential`,
      60, doc.page.height - 40,
      { width: PAGE_W, align: 'center' }
    )
}

doc.end()
console.log(`\n✅  Report saved to: ${OUT}\n`)
