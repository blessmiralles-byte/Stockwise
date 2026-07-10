import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAuth } from '@/lib/api-auth'
import { createNotification } from '@/lib/notify'

/**
 * POST /api/assets/:id/checkout
 * Body: { holder_name, holder_person_id?, job_code?, job_reference?, due_at?, notes? }
 *
 * Assign a tool to a person/job. If the tool requires approval, a PENDING
 * checkout is created (tool reserved, custody not transferred until approved);
 * otherwise custody transfers immediately. One live checkout per tool.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const { id } = await params
  let body: any
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const holderName = String(body.holder_name ?? '').trim()
  if (!holderName) {
    return NextResponse.json({ error: 'holder_name (who is taking the tool) is required' }, { status: 400 })
  }

  const supabase = createServiceClient()

  const { data: asset } = await supabase
    .from('fixed_assets')
    .select('id, name, asset_tag, status, current_checkout_id, requires_checkout_approval, created_by')
    .eq('id', id)
    .eq('org_id', auth.orgId)
    .single()

  if (!asset) return NextResponse.json({ error: 'Asset not found' }, { status: 404 })
  if (['disposed', 'retired', 'sold'].includes(asset.status)) {
    return NextResponse.json({ error: `This asset is ${asset.status} and can't be checked out` }, { status: 400 })
  }
  if (asset.current_checkout_id) {
    return NextResponse.json({ error: 'This tool is already checked out or awaiting approval' }, { status: 409 })
  }

  const needsApproval = !!asset.requires_checkout_approval
  const jobLabel = String(body.job_code ?? body.job_reference ?? '').trim() || null

  const { data: checkout, error: coErr } = await supabase
    .from('asset_checkouts')
    .insert({
      org_id:           auth.orgId,
      asset_id:         id,
      status:           needsApproval ? 'pending' : 'out',
      holder_name:      holderName,
      holder_person_id: body.holder_person_id ?? null,
      job_code:         body.job_code ?? null,
      job_reference:    body.job_reference ?? null,
      due_at:           body.due_at ?? null,
      notes:            body.notes?.trim() || null,
      checked_out_by:   auth.userId,
      approved_by:      needsApproval ? null : auth.userId,
      approved_at:      needsApproval ? null : new Date().toISOString(),
    })
    .select('id, status')
    .single()

  if (coErr) {
    console.error('[assets checkout]', coErr)
    // 23505 = the partial unique index (one active checkout per asset) tripped
    if (coErr.code === '23505') {
      return NextResponse.json({ error: 'This tool is already checked out or awaiting approval' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Failed to check out the tool' }, { status: 500 })
  }

  // Reserve the tool. For a direct checkout also stamp the visible holder/job/due;
  // for a pending one leave those null so the tool reads "Pending approval".
  await supabase
    .from('fixed_assets')
    .update({
      current_checkout_id: checkout.id,
      checked_out_to:  needsApproval ? null : holderName,
      checked_out_job: needsApproval ? null : jobLabel,
      checkout_due_at: needsApproval ? null : (body.due_at ?? null),
    })
    .eq('id', id)

  // Notify approvers on a pending request
  if (needsApproval) {
    const { data: approvers } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('org_id', auth.orgId)
      .in('role', ['owner', 'admin', 'operations', 'manager'])
      .eq('is_active', true)
    const ids = (approvers ?? []).map((a: any) => a.id).filter((uid: string) => uid !== auth.userId)
    if (ids.length > 0) {
      await createNotification({
        userId: ids,
        orgId:  auth.orgId,
        type:   'asset.checkout_request',
        title:  `Tool checkout needs approval — ${asset.asset_tag ?? ''} ${asset.name}`.trim(),
        body:   `${holderName} requested ${asset.name}${jobLabel ? ` for ${jobLabel}` : ''}.`,
        data:   { asset_id: id, checkout_id: checkout.id },
        actionUrl: '/assets',
      })
    }
  }

  return NextResponse.json({
    data: { checkout_id: checkout.id, status: checkout.status },
    pending: needsApproval,
  }, { status: 201 })
}
