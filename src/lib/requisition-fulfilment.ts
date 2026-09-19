import { createServiceClient } from '@/lib/supabase/service'

type Svc = ReturnType<typeof createServiceClient>

/**
 * Value of each requisition for approval routing. Lines carry an explicit
 * unit_cost when the requester priced them (new-asset requests); inventory
 * lines usually don't, so they're valued at the product's highest average cost
 * on hand — a conservative estimate. Tool check-outs are zero-value.
 */
export async function requisitionAmounts(sb: Svc, orgId: string, reqs: { id: string; items: any[] }[]): Promise<Map<string, number>> {
  const productIds = [...new Set(
    reqs.flatMap(r => (r.items ?? [])
      .filter(i => i.unit_cost == null && (i.product_id ?? i.product?.id))
      .map(i => i.product_id ?? i.product?.id)),
  )]
  const avgCost = new Map<string, number>()
  if (productIds.length) {
    const { data } = await sb.from('inventory_balances')
      .select('product_id, avg_cost').eq('org_id', orgId).in('product_id', productIds)
    for (const b of (data ?? []) as any[]) {
      avgCost.set(b.product_id, Math.max(avgCost.get(b.product_id) ?? 0, Number(b.avg_cost ?? 0)))
    }
  }
  const out = new Map<string, number>()
  for (const r of reqs) {
    let total = 0
    for (const i of r.items ?? []) {
      const qty  = Math.abs(Number(i.quantity ?? 0))
      const cost = i.unit_cost != null ? Number(i.unit_cost) : (avgCost.get(i.product_id ?? i.product?.id) ?? 0)
      total += qty * cost
    }
    out.set(r.id, Math.round(total * 100) / 100)
  }
  return out
}

/**
 * Side effects of a requisition reaching final approval. Sets the approved
 * status and, for inventory requests, posts the consumption against the job.
 * Returns warnings for lines that couldn't be issued (e.g. insufficient stock),
 * in which case the requisition stays 'approved' for an operator to resolve.
 */
export async function applyRequisitionApproval(sb: Svc, r: any, opts: { orgId: string; actorId: string }): Promise<string[]> {
  const { orgId, actorId } = opts
  const now = new Date().toISOString()
  const warnings: string[] = []

  // checkout → checked_out immediately (no separate hand-over step)
  const newStatus = r.type === 'checkout' ? 'checked_out' : 'approved'
  await sb.from('requisitions')
    .update({ status: newStatus, approved_by: actorId, approved_at: now, current_approver_id: null })
    .eq('id', r.id)

  if (r.type !== 'inventory') return warnings

  for (const item of (r.items as any[])) {
    if (item.item_type !== 'product' || !item.product_id) continue
    const qty = Math.abs(Number(item.quantity))

    // Resolve location: the requisition's, or the product's best-stocked one.
    let fromLocationId: string | null = r.location_id ?? null
    let balanceCost = 0
    if (!fromLocationId) {
      const { data: balRow } = await sb.from('inventory_balances')
        .select('location_id, quantity, avg_cost')
        .eq('product_id', item.product_id).eq('org_id', orgId)
        .gt('quantity', 0).order('quantity', { ascending: false }).limit(1).maybeSingle()
      if (balRow) {
        fromLocationId = balRow.location_id
        balanceCost    = Number(balRow.avg_cost ?? 0)
      }
    } else {
      const { data: costRow } = await sb.from('inventory_balances')
        .select('avg_cost').eq('product_id', item.product_id).eq('location_id', fromLocationId).maybeSingle()
      balanceCost = Number(costRow?.avg_cost ?? 0)
    }

    const { error: rpcErr } = await sb.rpc('record_inventory_movement', {
      p_transaction_type: 'consumption',
      p_product_id:       item.product_id,
      p_quantity:         qty,
      p_unit_cost:        balanceCost,
      p_from_location_id: fromLocationId,
      p_to_location_id:   null,
      p_reference_no:     r.req_number,
      p_notes:            `Requisition ${r.req_number}${r.job_reference ? ' — Job: ' + r.job_reference : ''}`,
      p_customer_id:      null,
      p_created_by:       actorId,
      p_batch_no:         null,
      p_expiration_date:  null,
      p_job_order_id:     r.job_reference ?? null,
      p_cost_center_id:   r.cost_center_id ?? null,
      p_job_code:         r.job_code ?? null,
      p_org_id:           orgId,
    })

    if (rpcErr) {
      // Only fall back to manual posting when the RPC isn't deployed. A real
      // rejection (insufficient stock, closed period) must not be force-posted.
      const isRpcMissing =
        rpcErr.message?.toLowerCase().includes('function') || (rpcErr as any).code === 'PGRST202'
      if (!isRpcMissing) {
        console.error(`[requisition ${r.req_number}] consumption rejected:`, rpcErr.message)
        warnings.push(rpcErr.message)
        continue
      }

      await sb.from('inventory_transactions').insert({
        org_id:           orgId,
        transaction_type: 'consumption',
        product_id:       item.product_id,
        quantity:         qty,
        unit_cost:        balanceCost,
        // total_cost is a generated column (quantity * unit_cost) — never set it
        from_location_id: fromLocationId,
        reference_no:     r.req_number,
        notes:            `Requisition ${r.req_number}`,
        created_by:       actorId,
        job_order_id:     r.job_reference ?? null,
        cost_center_id:   r.cost_center_id ?? null,
        job_code:         r.job_code ?? null,
      })
      if (fromLocationId) {
        const { data: bal } = await sb.from('inventory_balances')
          .select('id, quantity').eq('product_id', item.product_id).eq('location_id', fromLocationId).maybeSingle()
        if (bal) {
          await sb.from('inventory_balances')
            .update({ quantity: bal.quantity - qty, last_updated: new Date().toISOString() })
            .eq('id', bal.id)
        }
      }
    }
  }

  // Fulfilled only if every line was issued cleanly.
  if (warnings.length === 0) {
    await sb.from('requisitions').update({ status: 'fulfilled', fulfilled_at: now }).eq('id', r.id)
  }
  return warnings
}
