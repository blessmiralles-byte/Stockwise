import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAnyRole } from '@/lib/api-auth'
import { logAudit } from '@/lib/audit'
import { fetchAllPaged } from '@/lib/fetch-paged'
import { planRecode, type CatalogItem, type RecodeRow } from '@/lib/item-code'

/**
 * Bring a company's own item codes over, in bulk.
 *
 * GET  — every item's current code, name and barcode: the sheet the customer
 *        downloads and adds a "New code" column to.
 * POST { rows: [{ current, next, line }], apply?: boolean }
 *      — without apply: a preview of what would change and why any row can't.
 *      — with apply: makes the changes the preview showed, all in one
 *        transaction (recode_products), and returns the same plan.
 *
 * The plan is recomputed on apply rather than trusted from the client, so a
 * code someone else took since the preview is caught, not overwritten.
 */

const ROLES = ['owner', 'admin', 'operations', 'procurement'] as const
const MAX_ROWS = 5000

async function loadCatalog(orgId: string) {
  const supabase = createServiceClient()
  return fetchAllPaged<CatalogItem & { barcode: string | null }>((from, to) => supabase
    .from('products')
    .select('id, sku, name, barcode')
    .eq('org_id', orgId)
    .order('name')
    .order('id')
    .range(from, to))
}

export async function GET() {
  const auth = await requireAnyRole(...ROLES)
  if (auth.error) return auth.error

  const { rows, error } = await loadCatalog(auth.orgId)
  if (error) return NextResponse.json({ error: 'Failed to load your items' }, { status: 500 })
  return NextResponse.json({ data: rows })
}

export async function POST(req: NextRequest) {
  const auth = await requireAnyRole(...ROLES)
  if (auth.error) return auth.error

  let body: any
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const rawRows = Array.isArray(body?.rows) ? body.rows : null
  if (!rawRows) return NextResponse.json({ error: 'rows is required' }, { status: 400 })
  if (rawRows.length > MAX_ROWS) {
    return NextResponse.json({ error: `At most ${MAX_ROWS.toLocaleString()} rows at a time — split the sheet.` }, { status: 400 })
  }
  const rows: RecodeRow[] = rawRows.map((r: any, i: number) => ({
    current: r?.current,
    next:    r?.next,
    line:    Number.isFinite(Number(r?.line)) ? Number(r.line) : i + 2,
  }))

  const { rows: catalog, error: loadErr } = await loadCatalog(auth.orgId)
  if (loadErr) return NextResponse.json({ error: 'Failed to load your items' }, { status: 500 })

  const plan = planRecode(catalog, rows)
  if (!body.apply || plan.changes.length === 0) {
    return NextResponse.json({ data: plan, applied: false })
  }

  const supabase = createServiceClient()
  const { error } = await supabase.rpc('recode_products', {
    p_org_id:  auth.orgId,
    p_changes: plan.changes.map(c => ({ id: c.id, sku: c.to })),
  })

  if (error) {
    if (error.code === '23505') {
      // Someone added or renamed an item between the plan and the write.
      return NextResponse.json({ error: 'One of those codes was just taken by another item. Preview the sheet again.' }, { status: 409 })
    }
    const missingFunction = error.code === 'PGRST202' ||
      (/recode_products/.test(error.message ?? '') && /not find|does not exist/i.test(error.message ?? ''))
    if (missingFunction) {
      return NextResponse.json({ error: 'Bulk code changes aren’t set up yet — run scripts/migrate-item-codes-per-org.sql.' }, { status: 503 })
    }
    console.error('[POST /api/products/recode]', error.code, error.message)
    return NextResponse.json({ error: 'Failed to change the codes. Nothing was changed.' }, { status: 500 })
  }

  // One entry for the batch: who changed which codes, from what to what.
  await logAudit({
    actorId:   auth.userId,
    orgId:     auth.orgId,
    action:    'product.code_change',
    tableName: 'products',
    oldValue:  { codes: plan.changes.map(c => c.from) },
    newValue:  { changed: plan.changes.length, codes: plan.changes.map(c => ({ id: c.id, from: c.from, to: c.to })) },
  })

  return NextResponse.json({ data: plan, applied: true })
}
