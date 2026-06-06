import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAuth } from '@/lib/api-auth'

export async function GET() {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const supabase  = createServiceClient()
  const today     = new Date()
  const in30Days  = new Date(today); in30Days.setDate(today.getDate() + 30)
  const todayStr  = today.toISOString().slice(0, 10)
  const in30Str   = in30Days.toISOString().slice(0, 10)

  const [
    { data: balances },
    { count: totalProducts },
    { data: assets },
    { data: recentTx },
    { data: upcomingMaint },
    { data: pendingReqs },
    { data: openPos },
    { data: expiringWarranties },
    { data: overdueMaintenanceRaw },
  ] = await Promise.all([
    supabase
      .from('inventory_balances')
      .select('quantity, avg_cost, product:products(reorder_point)')
      .eq('org_id', auth.orgId),

    supabase
      .from('products')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', auth.orgId)
      .eq('is_active', true),

    supabase
      .from('fixed_assets')
      .select('id, status')
      .eq('org_id', auth.orgId),

    supabase
      .from('inventory_transactions')
      .select(`
        id, transaction_type, quantity, unit_cost, created_at, reference_no,
        product:products(name),
        from_location:locations!inventory_transactions_from_location_id_fkey(name),
        to_location:locations!inventory_transactions_to_location_id_fkey(name)
      `)
      .eq('org_id', auth.orgId)
      .order('created_at', { ascending: false })
      .limit(5),

    // Upcoming maintenance (next 30 days, not yet overdue)
    supabase
      .from('maintenance_schedules')
      .select('id, title, scheduled_date, status, asset:fixed_assets(asset_tag, name)')
      .eq('org_id', auth.orgId)
      .eq('status', 'scheduled')
      .gte('scheduled_date', todayStr)
      .lte('scheduled_date', in30Str)
      .order('scheduled_date', { ascending: true })
      .limit(5),

    // Pending requisitions awaiting approval
    supabase
      .from('requisitions')
      .select('id, req_number, type, created_at, requested_by:user_profiles!requested_by(full_name)')
      .eq('org_id', auth.orgId)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(10),

    // Open purchase orders (draft or sent)
    supabase
      .from('purchase_orders')
      .select('id, po_number, status, created_at, supplier:suppliers(name)')
      .eq('org_id', auth.orgId)
      .in('status', ['draft', 'sent', 'partial'])
      .order('created_at', { ascending: false })
      .limit(5),

    // Assets with warranties expiring in next 60 days
    supabase
      .from('fixed_assets')
      .select('id, asset_tag, name, warranty_expires, warranty_provider')
      .eq('org_id', auth.orgId)
      .eq('status', 'active')
      .not('warranty_expires', 'is', null)
      .lte('warranty_expires', new Date(today.getTime() + 60 * 86400000).toISOString().slice(0, 10))
      .gte('warranty_expires', todayStr)
      .order('warranty_expires', { ascending: true })
      .limit(5),

    // Overdue maintenance (past scheduled date, still scheduled)
    supabase
      .from('maintenance_schedules')
      .select('id, title, scheduled_date, asset:fixed_assets(asset_tag, name)')
      .eq('org_id', auth.orgId)
      .eq('status', 'scheduled')
      .lt('scheduled_date', todayStr)
      .order('scheduled_date', { ascending: true })
      .limit(5),
  ])

  // Inventory stats
  const totalValue       = (balances ?? []).reduce((s, b: any) => s + Number(b.quantity) * Number(b.avg_cost), 0)
  const lowStockCount    = (balances ?? []).filter((b: any) => Number(b.quantity) <= Number((b.product as any)?.reorder_point ?? 0) && Number(b.quantity) > 0).length
  const outOfStockCount  = (balances ?? []).filter((b: any) => Number(b.quantity) === 0).length

  // Asset stats
  const totalAssets         = assets?.length ?? 0
  const assetsInMaintenance = (assets ?? []).filter((a: any) => a.status === 'maintenance').length

  // Maintenance with days-remaining calculation
  const maintWithDays = (upcomingMaint ?? []).map((m: any) => ({
    ...m,
    daysLeft: Math.ceil((new Date(m.scheduled_date).getTime() - today.getTime()) / 86400000),
  }))

  const overdueMaint = (overdueMaintenanceRaw ?? []).map((m: any) => ({
    ...m,
    daysOverdue: Math.floor((today.getTime() - new Date(m.scheduled_date).getTime()) / 86400000),
  }))

  return NextResponse.json({
    // inventory
    total_products:        totalProducts ?? 0,
    total_inventory_value: totalValue,
    low_stock_count:       lowStockCount,
    out_of_stock_count:    outOfStockCount,
    // assets
    total_assets:          totalAssets,
    assets_in_maintenance: assetsInMaintenance,
    // new: actions needed
    pending_requisitions:  pendingReqs ?? [],
    pending_req_count:     (pendingReqs ?? []).length,
    open_pos:              openPos ?? [],
    open_po_count:         (openPos ?? []).length,
    overdue_maintenance:   overdueMaint,
    overdue_maint_count:   overdueMaint.length,
    expiring_warranties:   expiringWarranties ?? [],
    expiring_warranty_count: (expiringWarranties ?? []).length,
    // lists
    recent_transactions:   recentTx ?? [],
    upcoming_maintenance:  maintWithDays,
  })
}
