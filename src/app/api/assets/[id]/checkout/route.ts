import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAuth } from '@/lib/api-auth'
import { createNotification } from '@/lib/notify'
import { orgHasFeature } from '@/lib/entitlements-server'
import { assetCompliance, checkoutBlock } from '@/lib/asset-compliance'
import { resolveHolder, approvalNeeded } from '@/lib/checkout-rules'

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


  const supabase = createServiceClient()

  const { data: asset } = await supabase
    .from('fixed_assets')
    .select('id, name, asset_tag, status, current_checkout_id, requires_checkout_approval, created_by, current_value, purchase_cost')
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

  // Inspection / calibration guard: kit whose check is overdue (or whose
  // certificate has run out) either warns or is refused, per org policy.
  const [{ data: checks }, { data: orgRow }] = await Promise.all([
    supabase.from('maintenance_schedules')
      .select('kind, status, scheduled_date, certified_until')
      .eq('org_id', auth.orgId).eq('asset_id', id),
    supabase.from('organizations')
      .select('block_checkout_when_overdue, restrict_checkout_to_self, checkout_approval_over')
      .eq('id', auth.orgId).maybeSingle(),
  ])
  const compliance = assetCompliance((checks ?? []) as any[])
  const guard = checkoutBlock(compliance, { blockWhenOverdue: (orgRow as any)?.block_checkout_when_overdue })
  if (guard.blocked) {
    return NextResponse.json({ error: guard.reason, compliance }, { status: 409 })
  }

  // Who ends up holding it. Taking a tool for yourself is always allowed;
  // signing one out to somebody else is a supervisory act when the
  // organization has said so.
  const { data: me } = await supabase
    .from('user_profiles').select('full_name, email').eq('id', auth.userId).maybeSingle()
  const requesterName = (me as any)?.full_name ?? (me as any)?.email ?? 'Someone'

  const policy = {
    restrictToSelf:   (orgRow as any)?.restrict_checkout_to_self,
    approvalOver:     (orgRow as any)?.checkout_approval_over,
    // Check-out approval is a Pro feature; on Starter nobody could act on it.
    approvalsEnabled: await orgHasFeature(auth.orgId, 'approvals'),
  }

  const holder = resolveHolder(
    { holderName: body.holder_name, holderPersonId: body.holder_person_id },
    { role: auth.role, name: (me as any)?.full_name ?? (me as any)?.email ?? null, personId: null },
    policy,
  )
  if (holder.error) {
    return NextResponse.json({ error: holder.error }, { status: 403 })
  }
  const holderName = holder.holderName

  const approval = approvalNeeded(asset as any, policy)
  // Either the tool itself needs approving, or they asked for it on somebody
  // else's behalf and aren't a supervisor. Either way it waits.
  const needsApproval = approval.required || holder.needsApproval
  const approvalReason = approval.reason
    ?? (holder.needsApproval
      ? `Issued to someone else — a supervisor needs to approve handing this to ${holderName}.`
      : null)
  const jobLabel = String(body.job_code ?? body.job_reference ?? '').trim() || null

  const { data: checkout, error: coErr } = await supabase
    .from('asset_checkouts')
    .insert({
      org_id:           auth.orgId,
      asset_id:         id,
      status:           needsApproval ? 'pending' : 'out',
      holder_name:      holderName,
      holder_person_id: holder.holderPersonId,
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
        body:   holder.isSelf
          ? `${holderName} requested ${asset.name}${jobLabel ? ` for ${jobLabel}` : ''}.`
          : `${requesterName} requested ${asset.name} for ${holderName}${jobLabel ? ` on ${jobLabel}` : ''}.`,
        data:   { asset_id: id, checkout_id: checkout.id },
        actionUrl: '/assets',
      })
    }
  }

  return NextResponse.json({
    data: { checkout_id: checkout.id, status: checkout.status },
    pending: needsApproval,
    // Why it is waiting, so the hold makes sense to whoever asked.
    approval_reason: approvalReason ?? undefined,
    // Allowed out, but the crew should know its check is due.
    warning: guard.reason ?? undefined,
  }, { status: 201 })
}
