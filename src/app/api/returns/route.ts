import { NextRequest, NextResponse } from 'next/server'
import { countFreezeRefusal } from '@/lib/count-freeze-server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAuth } from '@/lib/api-auth'
import { canMove, movementDenied } from '@/lib/permissions'
import { fetchAllPaged } from '@/lib/fetch-paged'
import { movementRefusal } from '@/lib/movement-errors'
import { JOB_COST_TYPES, JOB_RETURN, VENDOR_RETURN } from '@/lib/stock-direction'
import { jobBalances, planJobReturn, planVendorReturn, poStatusAfterReturn, type JobMovement, type VendorOutcome } from '@/lib/returns'

/**
 * Returns — the two ways stock comes back or goes back.
 *
 * GET  /api/returns?product_id=…
 *      What can be returned for this item: the jobs it is still out on, and
 *      the purchase orders it was received against.
 *
 * POST /api/returns
 *      { kind: 'job',    product_id, quantity, location_id, job_code?, cost_center_id?, notes? }
 *      { kind: 'vendor', product_id, quantity, location_id, purchase_order_id?, outcome?, reference_no?, notes? }
 */

/** Every issue and return of one item, to work out what is still out on each job. */
async function loadJobMovements(supabase: any, orgId: string, productId: string) {
  return fetchAllPaged<JobMovement>((a, b) => supabase
    .from('inventory_transactions')
    .select('transaction_type, quantity, unit_cost, job_code, cost_center_id, job_order_id')
    .eq('org_id', orgId)
    .eq('product_id', productId)
    .eq('status', 'posted')
    .in('transaction_type', JOB_COST_TYPES)
    .order('id')
    .range(a, b))
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  if (!canMove(auth.role, 'return') && !canMove(auth.role, 'vendor_return')) {
    return NextResponse.json({ error: movementDenied(auth.role, 'return') }, { status: 403 })
  }

  const productId = req.nextUrl.searchParams.get('product_id')
  if (!productId) return NextResponse.json({ error: 'product_id is required' }, { status: 400 })

  const supabase = createServiceClient()

  const { rows, error } = await loadJobMovements(supabase, auth.orgId, productId)
  if (error) {
    console.error('[GET /api/returns] movements', error)
    return NextResponse.json({ error: 'Could not load what was issued' }, { status: 500 })
  }

  const { data: ccs } = await supabase.from('cost_centers').select('id, code, name').eq('org_id', auth.orgId)
  const ccName = new Map((ccs ?? []).map((c: any) => [c.id, `${c.code} — ${c.name}`]))
  const { data: jobs } = await supabase.from('job_codes').select('code, name').eq('org_id', auth.orgId)
  const jobName = new Map((jobs ?? []).map((j: any) => [j.code, j.name]))

  const from_jobs = jobBalances(rows)
    .filter(b => b.net_qty > 0)
    .map(b => ({
      ...b,
      job_name: b.job_code ? jobName.get(b.job_code) ?? null : null,
      cost_center: b.cost_center_id ? ccName.get(b.cost_center_id) ?? null : null,
    }))

  // Purchase orders this item has been received against.
  const { data: lines, error: lineErr } = await supabase
    .from('purchase_order_lines')
    .select('id, quantity_ordered, quantity_received, unit_cost, po:purchase_orders!inner(id, po_number, status, org_id, order_date, supplier:suppliers(name))')
    .eq('org_id', auth.orgId)
    .eq('product_id', productId)
    .gt('quantity_received', 0)
    .limit(200)
  if (lineErr) console.error('[GET /api/returns] po lines', lineErr)

  const to_vendors = ((lines ?? []) as any[])
    .filter(l => l.po && l.po.org_id === auth.orgId && ['partial', 'received'].includes(l.po.status))
    .map(l => ({
      purchase_order_id: l.po.id,
      po_number: l.po.po_number,
      vendor: l.po.supplier?.name ?? 'No vendor',
      order_date: l.po.order_date ?? null,
      received_qty: Number(l.quantity_received),
      unit_cost: Number(l.unit_cost ?? 0),
    }))
    .sort((a, b) => String(b.order_date ?? '').localeCompare(String(a.order_date ?? '')))

  return NextResponse.json({ data: { from_jobs, to_vendors } })
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  let body: any
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { kind, product_id, location_id } = body
  const qty = Number(body.quantity)
  const notes = typeof body.notes === 'string' ? body.notes.trim() : ''

  if (kind !== 'job' && kind !== 'vendor') {
    return NextResponse.json({ error: 'Say whether this is a return from a job or to a vendor.' }, { status: 400 })
  }
  const denied = movementDenied(auth.role, kind === 'job' ? 'return' : 'vendor_return')
  if (denied) return NextResponse.json({ error: denied }, { status: 403 })
  if (!product_id) return NextResponse.json({ error: 'Choose the item being returned.' }, { status: 400 })
  if (!Number.isInteger(qty) || qty <= 0) {
    return NextResponse.json({ error: 'Quantity must be a whole number above zero.' }, { status: 400 })
  }
  if (!location_id) {
    return NextResponse.json({
      error: kind === 'job' ? 'Choose the location the stock is going back into.' : 'Choose the location the stock is leaving from.',
    }, { status: 400 })
  }

  const supabase = createServiceClient()

  const frozen = await countFreezeRefusal(supabase, auth.orgId, [location_id])
  if (frozen) return frozen

  const post = (args: Record<string, unknown>) => supabase.rpc('record_inventory_movement', {
    p_product_id:       product_id,
    p_quantity:         qty,
    p_customer_id:      null,
    p_created_by:       auth.userId,
    p_batch_no:         null,
    p_expiration_date:  null,
    p_job_order_id:     null,
    p_org_id:           auth.orgId,
    ...args,
  })

  const refused = (message: string) => {
    // The database function predates returns until migrate-returns.sql is run.
    if (/invalid transaction_type|transaction_type_check/i.test(message)) {
      return NextResponse.json({ error: 'Returns are not switched on for this database yet. Run scripts/migrate-returns.sql in Supabase.' }, { status: 503 })
    }
    const r = movementRefusal(message)
    if (r) return NextResponse.json({ error: r.error }, { status: r.status })
    console.error('[POST /api/returns]', message)
    return NextResponse.json({ error: 'Could not record that return. Please try again.' }, { status: 500 })
  }

  // ── From a job, back into stock ─────────────────────────────────────────────
  if (kind === 'job') {
    const job_code = typeof body.job_code === 'string' && body.job_code.trim() ? body.job_code.trim() : null
    const cost_center_id = body.cost_center_id || null

    const { rows, error } = await loadJobMovements(supabase, auth.orgId, product_id)
    if (error) {
      console.error('[POST /api/returns] movements', error)
      return NextResponse.json({ error: 'Could not check what was issued' }, { status: 500 })
    }

    const plan = planJobReturn(rows, { job_code, cost_center_id }, qty)
    if (!plan.ok) return NextResponse.json({ error: plan.error }, { status: 409 })

    // JobLedger reads materials by job reference, not job code. If everything
    // issued to this job carried one reference, the return carries it too.
    const refs = new Set((rows as any[])
      .filter(r => (r.job_code ?? null) === job_code && (r.cost_center_id ?? null) === cost_center_id && r.job_order_id)
      .map(r => r.job_order_id as string))
    const job_order_id = refs.size === 1 ? [...refs][0] : null

    const { data, error: rpcErr } = await post({
      p_job_order_id:     job_order_id,
      p_transaction_type: JOB_RETURN,
      p_unit_cost:        plan.unit_cost,
      p_from_location_id: null,
      p_to_location_id:   location_id,
      p_reference_no:     body.reference_no?.trim() || null,
      p_notes:            notes || (job_code ? `Returned from job ${job_code}` : 'Returned to stock'),
      p_cost_center_id:   cost_center_id,
      p_job_code:         job_code,
    })
    if (rpcErr) return refused(rpcErr.message ?? '')

    return NextResponse.json({
      success: true, ...(data as object),
      credited: Math.round(plan.unit_cost * qty * 100) / 100,
    }, { status: 201 })
  }

  // ── Back to the vendor ──────────────────────────────────────────────────────
  const purchase_order_id: string | null = body.purchase_order_id || null
  const outcome: VendorOutcome = body.outcome === 'credit' ? 'credit' : 'replacement'

  let po: any = null
  let line: any = null
  let plan: ReturnType<typeof planVendorReturn> | null = null

  if (purchase_order_id) {
    const { data, error } = await supabase
      .from('purchase_orders')
      .select('id, po_number, status, lines:purchase_order_lines(id, product_id, quantity_ordered, quantity_received, unit_cost, notes)')
      .eq('id', purchase_order_id)
      .eq('org_id', auth.orgId)
      .single()
    if (error || !data) return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 })
    po = data
    if (!['partial', 'received'].includes(po.status)) {
      return NextResponse.json({ error: 'Nothing has been received against that purchase order yet.' }, { status: 409 })
    }
    // The line with the most received, if the item appears more than once.
    line = (po.lines as any[])
      .filter(l => l.product_id === product_id)
      .sort((a, b) => Number(b.quantity_received) - Number(a.quantity_received))[0]
    if (!line) return NextResponse.json({ error: `That item is not on ${po.po_number}.` }, { status: 409 })

    plan = planVendorReturn(line, qty, outcome)
    if (!plan.ok) return NextResponse.json({ error: plan.error }, { status: 409 })
  }

  const reference = po?.po_number ?? (body.reference_no?.trim() || null)
  const { data, error: rpcErr } = await post({
    p_transaction_type: VENDOR_RETURN,
    // At the price the vendor charged when there is an order to read it from;
    // otherwise the function uses the current book cost.
    p_unit_cost:        plan?.ok ? plan.unit_cost : 0,
    p_from_location_id: location_id,
    p_to_location_id:   null,
    p_reference_no:     reference,
    p_notes:            notes || (po ? `Returned to vendor against ${po.po_number}` : 'Returned to vendor'),
    p_cost_center_id:   null,
    p_job_code:         null,
  })
  if (rpcErr) return refused(rpcErr.message ?? '')

  const warnings: string[] = []
  if (po && line && plan?.ok) {
    const txId = (data as any)?.transaction_id
    if (txId) {
      await supabase.from('inventory_transactions')
        .update({ related_po_id: po.id })
        .eq('id', txId).eq('org_id', auth.orgId)
    }

    const newQty = plan.line
    const stamp = new Date().toISOString().slice(0, 10)
    const lineNote = `${qty} returned to vendor ${stamp} (${outcome === 'credit' ? 'credit due' : 'replacement due'})`
    const { error: lineErr } = await supabase
      .from('purchase_order_lines')
      .update({ ...newQty, notes: line.notes ? `${line.notes}; ${lineNote}` : lineNote })
      .eq('id', line.id)
      .eq('org_id', auth.orgId)

    if (lineErr) {
      console.error('[POST /api/returns] po line', lineErr)
      warnings.push(`Stock was reduced, but ${po.po_number} could not be updated. Adjust the order by hand.`)
    } else {
      const lines = (po.lines as any[]).map(l => l.id === line.id ? { ...l, ...newQty } : l)
      const status = poStatusAfterReturn(lines)
      if (status !== po.status) {
        await supabase.from('purchase_orders').update({ status }).eq('id', po.id).eq('org_id', auth.orgId)
      }
    }
  }

  return NextResponse.json({
    success: true, ...(data as object),
    outcome: po ? outcome : null,
    warnings: warnings.length ? warnings : undefined,
  }, { status: 201 })
}
