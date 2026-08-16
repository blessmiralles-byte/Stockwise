import { createServiceClient } from '@/lib/supabase/service'

type Svc = ReturnType<typeof createServiceClient>

/**
 * The per-org system "In Transit" holding location. Created lazily. Flagged
 * is_transit=true so the normal location pickers can exclude it.
 */
export async function getOrCreateTransitLocation(supabase: Svc, orgId: string): Promise<string> {
  const { data: existing } = await supabase
    .from('locations')
    .select('id')
    .eq('org_id', orgId)
    .eq('is_transit', true)
    .limit(1)
    .maybeSingle()
  if (existing) return existing.id

  const { data: created, error } = await supabase
    .from('locations')
    .insert({
      org_id:     orgId,
      name:       'In Transit',
      code:       `IN-TRANSIT-${orgId.slice(0, 8)}`,
      type:       'other',
      level:      0,
      parent_id:  null,
      is_transit: true,
      is_active:  true,
    })
    .select('id')
    .single()
  if (error || !created) throw new Error('Could not create the In-Transit location')
  return created.id
}

/**
 * Post a transfer movement between two locations via the canonical RPC.
 * Returns an error message (e.g. insufficient stock) or null on success.
 */
export async function postTransferMovement(
  supabase: Svc,
  opts: {
    orgId: string
    productId: string
    quantity: number
    unitCost: number
    fromId: string
    toId: string
    referenceNo?: string | null
    notes?: string | null
    userId: string
  },
): Promise<string | null> {
  const { error } = await supabase.rpc('record_inventory_movement', {
    p_transaction_type: 'transfer',
    p_product_id:       opts.productId,
    p_quantity:         opts.quantity,
    p_unit_cost:        opts.unitCost,
    p_from_location_id: opts.fromId,
    p_to_location_id:   opts.toId,
    p_reference_no:     opts.referenceNo ?? null,
    p_notes:            opts.notes ?? null,
    p_customer_id:      null,
    p_created_by:       opts.userId,
    p_batch_no:         null,
    p_expiration_date:  null,
    p_job_order_id:     null,
    p_cost_center_id:   null,
    p_job_code:         null,
    p_org_id:           opts.orgId,
  })
  if (error) return error.message ?? 'Could not post the stock movement'
  return null
}

/** Book cost of a product at a location (for valuing the in-transit stock). */
export async function locationAvgCost(supabase: Svc, productId: string, locationId: string): Promise<number> {
  const { data } = await supabase
    .from('inventory_balances')
    .select('avg_cost')
    .eq('product_id', productId)
    .eq('location_id', locationId)
    .maybeSingle()
  return Number(data?.avg_cost ?? 0)
}
