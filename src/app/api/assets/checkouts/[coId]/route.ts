import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAnyRole } from '@/lib/api-auth'
import { createNotification } from '@/lib/notify'

/**
 * POST /api/assets/checkouts/:coId
 * Body: { action: 'approve' | 'reject', reason? }
 *
 * Approve or reject a pending tool checkout. On approve, custody transfers
 * (the tool now reads "Out"). On reject, the tool is freed.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ coId: string }> }) {
  const auth = await requireAnyRole('owner', 'operations', 'manager', 'procurement')
  if (auth.error) return auth.error

  const { coId } = await params
  let body: any
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const action = body.action
  if (!['approve', 'reject'].includes(action)) {
    return NextResponse.json({ error: "action must be 'approve' or 'reject'" }, { status: 400 })
  }

  const supabase = createServiceClient()

  const { data: co } = await supabase
    .from('asset_checkouts')
    .select('id, asset_id, status, holder_name, job_code, job_reference, due_at, checked_out_by, org_id')
    .eq('id', coId)
    .eq('org_id', auth.orgId)
    .single()

  if (!co) return NextResponse.json({ error: 'Checkout not found' }, { status: 404 })
  if (co.status !== 'pending') {
    return NextResponse.json({ error: 'Only pending checkouts can be approved or rejected' }, { status: 400 })
  }

  const now = new Date().toISOString()
  const jobLabel = String(co.job_code ?? co.job_reference ?? '').trim() || null

  if (action === 'approve') {
    await supabase.from('asset_checkouts')
      .update({ status: 'out', approved_by: auth.userId, approved_at: now })
      .eq('id', coId)
    // Custody now visible on the tool
    await supabase.from('fixed_assets')
      .update({ checked_out_to: co.holder_name, checked_out_job: jobLabel, checkout_due_at: co.due_at })
      .eq('id', co.asset_id)
  } else {
    await supabase.from('asset_checkouts')
      .update({ status: 'rejected', approved_by: auth.userId, approved_at: now, reject_reason: body.reason?.trim() || null })
      .eq('id', coId)
    // Free the tool
    await supabase.from('fixed_assets')
      .update({ current_checkout_id: null, checked_out_to: null, checked_out_job: null, checkout_due_at: null })
      .eq('id', co.asset_id)
  }

  // Tell the requester
  if (co.checked_out_by) {
    await createNotification({
      userId: co.checked_out_by,
      orgId:  co.org_id ?? auth.orgId,
      type:   `asset.checkout_${action === 'approve' ? 'approved' : 'rejected'}`,
      title:  action === 'approve' ? 'Tool checkout approved' : 'Tool checkout rejected',
      body:   action === 'reject' && body.reason ? `Reason: ${body.reason}` : undefined,
      data:   { asset_id: co.asset_id, checkout_id: coId },
      actionUrl: '/assets',
    })
  }

  return NextResponse.json({ data: { status: action === 'approve' ? 'out' : 'rejected' } })
}
