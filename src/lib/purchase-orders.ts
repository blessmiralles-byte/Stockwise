import { createServiceClient } from '@/lib/supabase/service'

/**
 * Fetch a supplier's still-open POs (with their lines), earliest first.
 *
 * "Open" = not draft / received / cancelled — i.e. actually issued to the
 * supplier and not yet fully received. Shared by the goods-receipt cascade and
 * the receive-alternates endpoint so both agree on what counts as open and in
 * what order. Ordering: order_date asc (nulls last), then created_at asc.
 */
export async function fetchOpenSupplierPOs(
  supabase: ReturnType<typeof createServiceClient>,
  orgId: string,
  supplierId: string,
): Promise<any[]> {
  const { data } = await supabase
    .from('purchase_orders')
    .select(`
      id, po_number, order_date, created_at,
      lines:purchase_order_lines(id, product_id, quantity_ordered, quantity_received, unit_cost)
    `)
    .eq('org_id', orgId)
    .eq('supplier_id', supplierId)
    .not('status', 'in', '(draft,received,cancelled)')
    .order('order_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })

  return data ?? []
}
