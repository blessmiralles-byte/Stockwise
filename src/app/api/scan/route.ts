import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAuth } from '@/lib/api-auth'

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const barcode = req.nextUrl.searchParams.get('barcode')
  if (!barcode) {
    return NextResponse.json({ error: 'barcode query param is required' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Try products first
  const { data: product } = await supabase
    .from('products')
    .select(`
      id, sku, barcode, name, unit_of_measure, cost_method,
      category:categories(name),
      inventory_balances(quantity, avg_cost, location:locations(id, name))
    `)
    .eq('org_id', auth.orgId)
    .eq('barcode', barcode)
    .eq('is_active', true)
    .single()

  if (product) {
    const balances = (product.inventory_balances as any[]) ?? []
    const primaryBalance = balances[0]
    const totalQty = balances.reduce((s: number, b: any) => s + b.quantity, 0)
    const status = totalQty === 0 ? 'out' : totalQty <= 5 ? 'low' : 'ok'

    return NextResponse.json({
      data: {
        type:        'product',
        id:          product.id,
        sku:         product.sku,
        name:        product.name,
        category:    (product.category as any)?.name ?? null,
        unit:        product.unit_of_measure,
        cost_method: product.cost_method,
        qty:         totalQty,
        avg_cost:    primaryBalance?.avg_cost ?? 0,
        location:    (primaryBalance?.location as any)?.name ?? null,
        location_id: (primaryBalance?.location as any)?.id  ?? null,
        status,
        balances:    balances.map((b: any) => ({
          location_id: (b.location as any)?.id,
          location:    (b.location as any)?.name,
          qty:         b.quantity,
          avg_cost:    b.avg_cost,
        })),
      }
    })
  }

  // Try fixed assets
  const { data: asset } = await supabase
    .from('fixed_assets')
    .select(`
      id, asset_tag, barcode, name, status, serial_number,
      category:categories(name),
      location:locations(id, name),
      accountable_person:accountable_persons(name)
    `)
    .eq('org_id', auth.orgId)
    .eq('barcode', barcode)
    .single()

  if (asset) {
    return NextResponse.json({
      data: {
        type:               'fixed_asset',
        id:                 asset.id,
        tag:                asset.asset_tag,
        name:               asset.name,
        category:           (asset.category as any)?.name ?? null,
        location:           (asset.location as any)?.name ?? null,
        location_id:        (asset.location as any)?.id  ?? null,
        status:             asset.status,
        serial_number:      asset.serial_number,
        accountable_person: (asset.accountable_person as any)?.name ?? null,
      }
    })
  }

  return NextResponse.json({ data: null }, { status: 404 })
}
