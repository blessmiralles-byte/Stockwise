import { NextRequest, NextResponse } from 'next/server'
import { jobQtyOf } from '@/lib/stock-direction'
import { authenticateApiKey } from '@/lib/api-keys-server'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * GET /api/jobledger/materials?job_id=JOB-2047[&cursor=ISO][&limit=200]
 *
 * Returns all consumption transactions tagged with the given job_order_id.
 * Response shape mirrors the old direct-Supabase query in JobLedger's
 * stockedClient.ts so the migration is a drop-in swap.
 *
 * Auth: per-organization API key (Settings → API keys, scope "jobledger"):
 *   Authorization: Bearer stk_jobledger_…   org_id is optional; if sent it must match the key.
 *
 * Supports cursor-based incremental sync: pass the `transactionDate` of the
 * last received entry as `cursor` to fetch only newer records.
 */
export async function GET(req: NextRequest) {
  // ── Per-organization API key: the key decides the company ───────────────────
  const { searchParams } = req.nextUrl
  const key = await authenticateApiKey(req.headers.get('authorization'), 'jobledger', searchParams.get('org_id'))
  if (!key.ok) return key.error
  const orgId = key.orgId

  const jobId  = searchParams.get('job_id')?.trim()
  const cursor = searchParams.get('cursor')
  const limit  = Math.min(Number(searchParams.get('limit') ?? '200'), 500)

  if (!jobId)  return NextResponse.json({ error: 'job_id is required' }, { status: 400 })

  const supabase = createServiceClient()

  let query = supabase
    .from('inventory_transactions')
    .select(`
      id,
      transaction_type,
      quantity,
      unit_cost,
      created_at,
      product:products(id, sku, name, unit_of_measure)
    `)
    .eq('org_id', orgId)
    .in('transaction_type', ['consumption', 'return'])
    .eq('job_order_id', jobId)
    .order('created_at', { ascending: true })
    .limit(limit)

  if (cursor) query = query.gt('created_at', cursor)

  const { data, error } = await query
  if (error) {
    console.error('[GET /api/jobledger/materials]', error)
    return NextResponse.json({ error: 'Failed to fetch materials' }, { status: 500 })
  }

  const rows = (data ?? []).map((row: any) => {
    const p = Array.isArray(row.product) ? row.product[0] : row.product
    const qty  = jobQtyOf(row)   // negative when material came back from the job
    const cost = Number(row.unit_cost)
    return {
      transactionId:   row.id,
      productId:       p?.id            ?? '',
      productName:     p?.name          ?? 'Unknown',
      sku:             p?.sku           ?? '',
      unitOfMeasure:   p?.unit_of_measure ?? 'pc',
      quantity:        qty,
      unitCost:        cost,
      totalCost:       qty * cost,
      transactionDate: row.created_at,
    }
  })

  const nextCursor = rows.length > 0 ? rows[rows.length - 1].transactionDate : null

  return NextResponse.json({
    materials:   rows,
    meta: {
      count:       rows.length,
      next_cursor: nextCursor,
      has_more:    rows.length === limit,
      job_id:      jobId,
    },
  }, { headers: { 'Cache-Control': 'no-store' } })
}
