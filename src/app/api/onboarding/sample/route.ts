import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAnyRole } from '@/lib/api-auth'
import {
  SAMPLE, SAMPLE_DELETE_ORDER, sampleStockValue, type SampleRecord, type SampleTable,
} from '@/lib/sample-data'

/**
 * Sample data, loaded and removed by the owner.
 *
 * POST   — fills a new account with a small contractor setup to click around.
 * DELETE — removes exactly the rows that load created, by id.
 *
 * Owner only, and only while the account is still essentially empty: this must
 * never scatter demo rows through a business's real catalogue.
 */

type Svc = ReturnType<typeof createServiceClient>

/** Rows are recorded as they are created so removal is exact. */
function recorder() {
  const ids: SampleRecord = {}
  return {
    ids,
    add(table: SampleTable, id: string | undefined | null) {
      if (!id) return
      ids[table] = [...(ids[table] ?? []), id]
    },
  }
}

export async function POST() {
  const auth = await requireAnyRole('owner')
  if (auth.error) return auth.error

  const supabase = createServiceClient()

  const { data: org } = await supabase
    .from('organizations').select('sample_data').eq('id', auth.orgId).maybeSingle()
  if ((org as any)?.sample_data) {
    return NextResponse.json({ error: 'Sample data is already loaded' }, { status: 409 })
  }

  // Only into an empty catalogue — a real one must never get demo rows mixed in.
  const { count: productCount } = await supabase
    .from('products').select('*', { count: 'exact', head: true })
    .eq('org_id', auth.orgId).eq('is_active', true)
  if ((productCount ?? 0) > 0) {
    return NextResponse.json(
      { error: 'Sample data can only be loaded into an empty account — you already have products.' },
      { status: 409 },
    )
  }

  const rec = recorder()
  const now = new Date().toISOString()
  const today = now.slice(0, 10)

  try {
    // ── Locations, categories, vendors ──────────────────────────────────────
    const locationIds: Record<string, string> = {}
    for (const l of SAMPLE.locations) {
      const { data } = await supabase.from('locations')
        .insert({ org_id: auth.orgId, name: l.name, code: l.code, type: l.type })
        .select('id').single()
      locationIds[l.key] = (data as any)?.id
      rec.add('locations', (data as any)?.id)
    }

    const categoryIds: Record<string, string> = {}
    for (const c of SAMPLE.categories) {
      const { data } = await supabase.from('categories')
        .insert({ org_id: auth.orgId, name: c.name, type: c.type })
        .select('id').single()
      categoryIds[c.key] = (data as any)?.id
      rec.add('categories', (data as any)?.id)
    }

    const vendorIds: Record<string, string> = {}
    for (const v of SAMPLE.vendors) {
      const { data } = await supabase.from('suppliers')
        .insert({
          org_id: auth.orgId, name: v.name, contact_name: v.contact_name,
          email: v.email, lead_time_days: v.lead_time_days,
        })
        .select('id').single()
      vendorIds[v.key] = (data as any)?.id
      rec.add('suppliers', (data as any)?.id)
    }

    // ── Products, with opening stock ────────────────────────────────────────
    const productIds: Record<string, string> = {}
    for (const p of SAMPLE.products) {
      const { data } = await supabase.from('products')
        .insert({
          org_id: auth.orgId, name: p.name, sku: p.sku, unit_of_measure: p.unit,
          category_id: categoryIds[p.category], supplier_id: vendorIds[p.vendor],
          reorder_point: p.reorder_point, keep_in_stock: p.keep_in_stock, is_active: true,
        })
        .select('id').single()
      const productId = (data as any)?.id
      productIds[p.key] = productId
      rec.add('products', productId)
      if (!productId) continue

      for (const line of p.stock) {
        const { data: bal } = await supabase.from('inventory_balances')
          .insert({
            org_id: auth.orgId, product_id: productId, location_id: locationIds[line.location],
            quantity: line.qty, avg_cost: line.unit_cost, last_updated: now,
          })
          .select('id').single()
        rec.add('inventory_balances', (bal as any)?.id)

        // A matching receipt, so valuation and the ledger agree with the balance.
        const { data: tx } = await supabase.from('inventory_transactions')
          .insert({
            org_id: auth.orgId, transaction_type: 'purchase', product_id: productId,
            to_location_id: locationIds[line.location], quantity: line.qty,
            unit_cost: line.unit_cost, reference_no: 'SAMPLE-OPENING',
            notes: 'Sample opening stock', created_by: auth.userId,
          })
          .select('id').single()
        rec.add('inventory_transactions', (tx as any)?.id)
      }
    }

    // ── A couple of tools ───────────────────────────────────────────────────
    for (const a of SAMPLE.assets) {
      const { data } = await supabase.from('fixed_assets')
        .insert({
          org_id: auth.orgId, name: a.name, asset_tag: a.tag, category_id: categoryIds[a.category],
          purchase_cost: a.purchase_cost, current_value: a.purchase_cost,
          useful_life_years: a.useful_life_years, depreciation_method: 'straight_line',
          purchase_date: today, status: 'active', location_id: locationIds[a.location],
        })
        .select('id').single()
      rec.add('fixed_assets', (data as any)?.id)
    }

    // ── A draft purchase order waiting to be priced ─────────────────────────
    const { data: seqVal } = await supabase.rpc('next_ref_number', { p_seq: 'public.po_seq' })
    const { data: po } = await supabase.from('purchase_orders')
      .insert({
        org_id: auth.orgId,
        po_number: `PO-${today.replace(/-/g, '')}-${String(seqVal ?? 1).padStart(4, '0')}`,
        supplier_id: vendorIds[SAMPLE.purchaseOrder.vendor], status: 'draft',
        order_date: today, notes: 'Sample draft order - delete it with the rest of the sample data',
        created_by: auth.userId,
      })
      .select('id').single()
    const poId = (po as any)?.id
    rec.add('purchase_orders', poId)

    if (poId) {
      for (const line of SAMPLE.purchaseOrder.lines) {
        const { data: l } = await supabase.from('purchase_order_lines')
          .insert({
            org_id: auth.orgId, purchase_order_id: poId, product_id: productIds[line.product],
            quantity_ordered: line.qty, unit_cost: line.unit_cost,
          })
          .select('id').single()
        rec.add('purchase_order_lines', (l as any)?.id)
      }
    }

    await supabase.from('organizations')
      .update({ sample_data: rec.ids, sample_loaded_at: now })
      .eq('id', auth.orgId)

    return NextResponse.json({
      message: 'Sample data loaded — have a look around, then remove it when you are ready to add your own.',
      counts: {
        products: SAMPLE.products.length,
        locations: SAMPLE.locations.length,
        vendors: SAMPLE.vendors.length,
        assets: SAMPLE.assets.length,
        stock_value: Math.round(sampleStockValue()),
      },
    }, { status: 201 })
  } catch (err) {
    // Roll back whatever landed, so a half-loaded sample can't be left behind.
    console.error('[sample] load failed', (err as Error).message)
    await removeRows(supabase, auth.orgId, rec.ids)
    return NextResponse.json({ error: 'Could not load the sample data. Nothing was left behind.' }, { status: 500 })
  }
}

async function removeRows(sb: Svc, orgId: string, ids: SampleRecord) {
  for (const table of SAMPLE_DELETE_ORDER) {
    const list = ids[table]
    if (!list?.length) continue
    await sb.from(table).delete().eq('org_id', orgId).in('id', list)
  }
}

export async function DELETE() {
  const auth = await requireAnyRole('owner')
  if (auth.error) return auth.error

  const supabase = createServiceClient()
  const { data: org } = await supabase
    .from('organizations').select('sample_data').eq('id', auth.orgId).maybeSingle()

  const ids = (org as any)?.sample_data as SampleRecord | null
  if (!ids) return NextResponse.json({ error: 'There is no sample data to remove' }, { status: 404 })

  await removeRows(supabase, auth.orgId, ids)
  await supabase.from('organizations')
    .update({ sample_data: null, sample_loaded_at: null }).eq('id', auth.orgId)

  return NextResponse.json({ message: 'Sample data removed. The account is yours alone now.' })
}
