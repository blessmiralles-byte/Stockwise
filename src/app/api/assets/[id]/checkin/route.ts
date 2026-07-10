import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAuth } from '@/lib/api-auth'

/**
 * POST /api/assets/:id/checkin
 * Body: { returned_to_location_id?, notes? }
 *
 * Return a checked-out tool: closes the active checkout and frees the tool.
 * Optionally records which location (e.g. a van or the warehouse) it came back to.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const { id } = await params
  let body: any
  try { body = await req.json() } catch { body = {} }

  const supabase = createServiceClient()

  const { data: asset } = await supabase
    .from('fixed_assets')
    .select('id, current_checkout_id')
    .eq('id', id)
    .eq('org_id', auth.orgId)
    .single()

  if (!asset) return NextResponse.json({ error: 'Asset not found' }, { status: 404 })
  if (!asset.current_checkout_id) {
    return NextResponse.json({ error: 'This tool is not currently checked out' }, { status: 400 })
  }

  const now = new Date().toISOString()
  const returnedTo = body.returned_to_location_id || null

  // Close the active checkout (whether it was 'out' or a still-'pending' request)
  await supabase
    .from('asset_checkouts')
    .update({
      status:      'returned',
      returned_at: now,
      returned_by: auth.userId,
      returned_to_location_id: returnedTo,
      notes:       body.notes?.trim() || undefined,
    })
    .eq('id', asset.current_checkout_id)

  // Free the tool; optionally move it to the location it was returned to
  const assetUpdate: Record<string, any> = {
    current_checkout_id: null,
    checked_out_to:  null,
    checked_out_job: null,
    checkout_due_at: null,
  }
  if (returnedTo) assetUpdate.location_id = returnedTo

  await supabase.from('fixed_assets').update(assetUpdate).eq('id', id)

  return NextResponse.json({ data: { checked_in: true } })
}
