import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAnyRole } from '@/lib/api-auth'
import { importLimiter } from '@/lib/rate-limit'
import * as XLSX from 'xlsx'

/**
 * POST /api/import/[entity]
 *
 * Accepts a multipart/form-data body with a `file` field (CSV or XLSX).
 * Parses the rows and bulk-inserts them into the appropriate table.
 *
 * Supported entities: products | assets | locations | suppliers
 *
 * Returns:
 *   { imported: number, skipped: number, errors: string[] }
 */

type Entity = 'products' | 'assets' | 'locations' | 'suppliers' | 'categories' | 'job_codes' | 'cost_centers'
const VALID_ENTITIES: Entity[] = ['products', 'assets', 'locations', 'suppliers', 'categories', 'job_codes', 'cost_centers']

// ── Column mappers ────────────────────────────────────────────────────────────
// Normalise common header variations (lowercase, no spaces) → field name

function normaliseHeader(h: string) {
  return h.toLowerCase().replace(/[\s_\-]+/g, '_')
}

function parseNumber(v: any, fallback = 0): number {
  const n = Number(v)
  return isNaN(n) ? fallback : n
}

function parseDate(v: any): string | null {
  if (!v) return null
  // XLSX numeric date serial → JS date
  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v)
    if (d) return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`
  }
  const d = new Date(v)
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

// ── Per-entity row transformers ───────────────────────────────────────────────

function transformProduct(row: Record<string, any>) {
  const r = Object.fromEntries(
    Object.entries(row).map(([k, v]) => [normaliseHeader(k), v])
  )
  if (!r.name && !r.product_name) return null
  return {
    name:            String(r.name ?? r.product_name ?? '').trim().slice(0, 200),
    sku:             r.sku ? String(r.sku).trim().slice(0, 50) : null,
    barcode:         r.barcode ? String(r.barcode).trim().slice(0, 100) : null,
    unit_of_measure: r.unit ?? r.unit_of_measure ?? r.uom ?? 'pcs',
    reorder_point:   parseNumber(r.reorder_point ?? r.reorder ?? 0),
    description:     r.description ? String(r.description).slice(0, 500) : null,
    is_active:       true,
  }
}

function transformAsset(row: Record<string, any>) {
  const r = Object.fromEntries(
    Object.entries(row).map(([k, v]) => [normaliseHeader(k), v])
  )
  if (!r.name && !r.asset_name) return null
  if (!r.asset_tag && !r.tag) return null
  const validMethods = ['straight_line', 'declining_balance', 'double_declining', 'units_of_production', 'none']
  const rawMethod    = (r.depreciation_method ?? r.method ?? 'none').toLowerCase().replace(/\s+/g,'_')
  const method       = validMethods.includes(rawMethod) ? rawMethod : 'none'
  const validStatuses = ['active', 'maintenance', 'retired', 'disposed']
  const rawStatus     = (r.status ?? 'active').toLowerCase()
  return {
    name:                String(r.name ?? r.asset_name ?? '').trim().slice(0, 200),
    asset_tag:           String(r.asset_tag ?? r.tag ?? '').trim().slice(0, 50),
    serial_number:       r.serial_number ?? r.serial ?? null,
    purchase_cost:       parseNumber(r.purchase_cost ?? r.cost ?? 0),
    current_value:       parseNumber(r.current_value ?? r.book_value ?? r.purchase_cost ?? r.cost ?? 0),
    purchase_date:       parseDate(r.purchase_date ?? r.date_purchased),
    useful_life_years:   parseNumber(r.useful_life_years ?? r.useful_life ?? 0),
    salvage_value:       parseNumber(r.salvage_value ?? 0),
    depreciation_method: method,
    status:              validStatuses.includes(rawStatus) ? rawStatus : 'active',
    notes:               r.notes ?? r.description ?? null,
  }
}

function transformLocation(row: Record<string, any>) {
  const r = Object.fromEntries(
    Object.entries(row).map(([k, v]) => [normaliseHeader(k), v])
  )
  if (!r.name && !r.location_name) return null
  if (!r.code && !r.location_code) return null
  return {
    name:    String(r.name ?? r.location_name ?? '').trim().slice(0, 200),
    code:    String(r.code ?? r.location_code ?? '').trim().toUpperCase().slice(0, 20),
    type:    r.type ?? r.location_type ?? null,
    address: r.address ?? null,
  }
}

function transformSupplier(row: Record<string, any>) {
  const r = Object.fromEntries(
    Object.entries(row).map(([k, v]) => [normaliseHeader(k), v])
  )
  if (!r.name && !r.supplier_name && !r.company) return null
  return {
    name:           String(r.name ?? r.supplier_name ?? r.company ?? '').trim().slice(0, 200),
    contact_name:   r.contact_name ?? r.contact ?? null,
    email:          r.email ?? null,
    phone:          r.phone ?? r.telephone ?? null,
    address:        r.address ?? null,
    payment_terms:  r.payment_terms ?? r.terms ?? null,
    lead_time_days: parseNumber(r.lead_time_days ?? r.lead_time ?? 0),
    notes:          r.notes ?? null,
  }
}

function transformCategory(row: Record<string, any>) {
  const r = Object.fromEntries(Object.entries(row).map(([k, v]) => [normaliseHeader(k), v]))
  if (!r.name && !r.category_name) return null
  const validTypes = ['inventory', 'fixed_asset', 'both']
  const rawType = (r.type ?? r.applies_to ?? 'inventory').toLowerCase().replace(/\s+/g, '_')
  return {
    name: String(r.name ?? r.category_name ?? '').trim().slice(0, 200),
    type: validTypes.includes(rawType) ? rawType : 'inventory',
  }
}

function transformJobCode(row: Record<string, any>) {
  const r = Object.fromEntries(Object.entries(row).map(([k, v]) => [normaliseHeader(k), v]))
  if (!r.code && !r.job_code) return null
  if (!r.name && !r.job_name) return null
  return {
    code:           String(r.code ?? r.job_code ?? '').trim().toUpperCase().slice(0, 50),
    name:           String(r.name ?? r.job_name ?? '').trim().slice(0, 200),
    description:    r.description ?? r.desc ?? null,
    billing_entity: r.billing_entity ?? r.client ?? null,
    address:        r.address ?? null,
    contact_name:   r.contact_name ?? r.contact ?? null,
    contact_phone:  r.contact_phone ?? r.phone ?? null,
    contact_email:  r.contact_email ?? r.email ?? null,
    is_active:      true,
  }
}

function transformCostCenter(row: Record<string, any>) {
  const r = Object.fromEntries(Object.entries(row).map(([k, v]) => [normaliseHeader(k), v]))
  if (!r.code && !r.cost_center_code) return null
  if (!r.name && !r.cost_center_name) return null
  return {
    code:      String(r.code ?? r.cost_center_code ?? '').trim().toUpperCase().slice(0, 20),
    name:      String(r.name ?? r.cost_center_name ?? '').trim().slice(0, 200),
    is_active: true,
  }
}

const TRANSFORMERS: Record<Entity, (row: any) => any> = {
  products:     transformProduct,
  assets:       transformAsset,
  locations:    transformLocation,
  suppliers:    transformSupplier,
  categories:   transformCategory,
  job_codes:    transformJobCode,
  cost_centers: transformCostCenter,
}

const TABLE_NAMES: Record<Entity, string> = {
  products:     'products',
  assets:       'fixed_assets',
  locations:    'locations',
  suppliers:    'suppliers',
  categories:   'categories',
  job_codes:    'job_codes',
  cost_centers: 'cost_centers',
}

// ── Handler ───────────────────────────────────────────────────────────────────
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ entity: string }> }
) {
  const auth = await requireAnyRole('owner', 'admin', 'procurement', 'operations')
  if (auth.error) return auth.error

  // Rate limit by user (distributed when Upstash is configured)
  const { ok } = await importLimiter(auth.userId)
  if (!ok) return NextResponse.json({ error: 'Too many import requests — wait 1 minute.' }, { status: 429 })

  const { entity } = await params
  if (!VALID_ENTITIES.includes(entity as Entity)) {
    return NextResponse.json({ error: `Unknown entity: ${entity}` }, { status: 400 })
  }

  let formData: FormData
  try { formData = await req.formData() }
  catch { return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 }) }

  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })

  const MAX_SIZE = 5 * 1024 * 1024  // 5 MB
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'File too large (max 5 MB)' }, { status: 400 })
  }

  const buf  = Buffer.from(await file.arrayBuffer())
  const name = file.name.toLowerCase()

  let rows: Record<string, any>[]
  try {
    if (name.endsWith('.csv')) {
      const text = buf.toString('utf-8')
      const wb   = XLSX.read(text, { type: 'string', raw: false })
      const ws   = wb.Sheets[wb.SheetNames[0]]
      rows       = XLSX.utils.sheet_to_json(ws, { defval: '' })
    } else if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
      const wb = XLSX.read(buf, { type: 'buffer', cellDates: true })
      const ws = wb.Sheets[wb.SheetNames[0]]
      rows     = XLSX.utils.sheet_to_json(ws, { defval: '' })
    } else {
      return NextResponse.json({ error: 'Only .csv, .xlsx, and .xls files are supported' }, { status: 400 })
    }
  } catch (err: any) {
    return NextResponse.json({ error: `Could not parse file: ${err.message}` }, { status: 400 })
  }

  if (rows.length === 0) return NextResponse.json({ error: 'File is empty or has no data rows' }, { status: 400 })
  if (rows.length > 1000) return NextResponse.json({ error: 'Maximum 1 000 rows per import' }, { status: 400 })

  const transformer = TRANSFORMERS[entity as Entity]
  const tableName   = TABLE_NAMES[entity as Entity]
  const supabase    = createServiceClient()

  const errors:   string[] = []
  const toInsert: any[]    = []

  rows.forEach((row, i) => {
    try {
      const transformed = transformer(row)
      if (!transformed) {
        errors.push(`Row ${i + 2}: Missing required fields — skipped.`)
        return
      }
      toInsert.push({ ...transformed, org_id: auth.orgId })
    } catch (err: any) {
      errors.push(`Row ${i + 2}: ${err.message}`)
    }
  })

  if (toInsert.length === 0) {
    return NextResponse.json({ imported: 0, skipped: rows.length, errors })
  }

  // Batch insert in chunks of 100
  const CHUNK = 100
  let imported = 0
  for (let i = 0; i < toInsert.length; i += CHUNK) {
    const chunk = toInsert.slice(i, i + CHUNK)
    const { error, data } = await supabase.from(tableName).insert(chunk).select('id')
    if (error) {
      errors.push(`Batch ${Math.floor(i / CHUNK) + 1} insert error: ${error.message}`)
    } else {
      imported += data?.length ?? 0
    }
  }

  return NextResponse.json({
    imported,
    skipped: rows.length - toInsert.length,
    errors,
  })
}

/**
 * GET /api/import/[entity] — download CSV template
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ entity: string }> }
) {
  const auth = await requireAnyRole('owner', 'admin', 'procurement', 'operations')
  if (auth.error) return auth.error

  const { entity } = await params

  const TEMPLATES: Record<string, string> = {
    products:     'name,sku,barcode,unit_of_measure,reorder_point,description\nWD-40 Spray,WD40-350ML,,pcs,10,Lubricant spray',
    assets:       'name,asset_tag,serial_number,purchase_cost,purchase_date,useful_life_years,depreciation_method,status,notes\nLaptop Dell XPS,LAP-001,SN12345,1200,2024-01-15,5,straight_line,active,IT Equipment',
    locations:    'name,code,type,address\nMain Warehouse,WH-01,warehouse,123 Industrial Ave',
    suppliers:    'name,contact_name,email,phone,payment_terms,lead_time_days,notes\nAcme Corp,John Doe,john@acme.com,+1-555-1234,Net 30,7,Preferred supplier',
    categories:   'name,type\nElectronics,inventory\nVehicles,fixed_asset\nOffice Supplies,both',
    job_codes:    'code,name,description,billing_entity,contact_name,contact_phone,contact_email\nJOB-001,Building Renovation,Phase 1 works,ABC Corp,John Smith,+1-555-0100,john@abc.com',
    cost_centers: 'code,name\nOPS,Operations\nMKT,Marketing\nFIN,Finance',
  }

  const csv = TEMPLATES[entity]
  if (!csv) return NextResponse.json({ error: 'Unknown entity' }, { status: 400 })

  return new Response(csv, {
    headers: {
      'Content-Type':        'text/csv',
      'Content-Disposition': `attachment; filename="${entity}-template.csv"`,
    },
  })
}
