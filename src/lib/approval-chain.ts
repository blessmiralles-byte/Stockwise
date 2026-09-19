import { createServiceClient } from '@/lib/supabase/service'
import { createNotification } from '@/lib/notify'
import { logAudit, type AuditAction } from '@/lib/audit'
import { fmtMoney, isUnlimited } from '@/lib/approvals'

/**
 * Reporting-line approval chain for requisitions and purchase orders.
 *
 *   1. Submitting routes the document to the submitter's DIRECT MANAGER — they
 *      always see it first (their endorsement).
 *   2. If the amount is within the acting approver's limit, their action is the
 *      final approval. Otherwise it's an endorsement and the document moves to
 *      THEIR manager, and so on up the reporting line.
 *   3. Nobody approves their own document, and nobody appears twice in a chain.
 *   4. If the line runs out (no manager set, inactive managers, or nobody's
 *      limit is high enough) it goes to the org owner.
 *   5. An owner/admin may act at any step — recorded as an owner override.
 *
 * Every step is an approval_steps row (the trail). The document's
 * current_approver_id mirrors the pending step for fast "awaiting me" queries.
 * Status changes on the document itself are the caller's job.
 */

type Svc = ReturnType<typeof createServiceClient>
export type DocType = 'requisition' | 'purchase_order'

const DOC_TABLE: Record<DocType, string> = { requisition: 'requisitions', purchase_order: 'purchase_orders' }
const LIMIT_COL: Record<DocType, string> = { requisition: 'requisition_approval_limit', purchase_order: 'po_approval_limit' }
const DOC_LABEL: Record<DocType, string> = { requisition: 'Requisition', purchase_order: 'Purchase order' }
const DOC_URL:   Record<DocType, (id: string) => string> = {
  requisition:    () => '/requisitions',
  purchase_order: id => `/purchase-orders/${id}`,
}

export interface Member {
  id: string
  full_name: string | null
  email: string | null
  role: string | null
  job_title: string | null
  is_active: boolean | null
  reports_to: string | null
  requisition_approval_limit: number | null
  po_approval_limit: number | null
}

const MEMBER_COLS = 'id, full_name, email, role, job_title, is_active, reports_to, requisition_approval_limit, po_approval_limit'

export function memberName(m: Pick<Member, 'full_name' | 'email'> | null | undefined): string {
  return m?.full_name || m?.email || 'Someone'
}

async function getMember(sb: Svc, orgId: string, id: string | null | undefined): Promise<Member | null> {
  if (!id) return null
  const { data } = await sb.from('user_profiles').select(MEMBER_COLS).eq('id', id).eq('org_id', orgId).maybeSingle()
  return (data as Member) ?? null
}

async function getOwner(sb: Svc, orgId: string): Promise<Member | null> {
  const { data } = await sb.from('user_profiles').select(MEMBER_COLS)
    .eq('org_id', orgId).eq('role', 'owner').neq('is_active', false)
    .order('created_at', { ascending: true }).limit(1).maybeSingle()
  return (data as Member) ?? null
}

/** Can this member's authority alone cover the amount? */
export function coversAmount(m: Member | null, docType: DocType, amount: number): boolean {
  if (!m) return false
  // A zero-value document (e.g. borrowing a tool) needs no spending authority —
  // the direct manager's approval is enough.
  if (amount <= 0 || isUnlimited(m.role ?? undefined)) return true
  const limit = (m as any)[LIMIT_COL[docType]]
  return limit != null && Number(limit) >= amount
}

/**
 * Next person up the reporting line from `startId`, skipping inactive members
 * and anyone in `exclude` (the submitter and people already in the chain).
 * Falls back to the owner; null only if the owner is excluded too.
 */
async function nextApprover(sb: Svc, orgId: string, startId: string | null, exclude: Set<string>): Promise<Member | null> {
  const seen = new Set<string>()
  let cur = startId
  while (cur && !seen.has(cur)) {
    seen.add(cur)
    const m = await getMember(sb, orgId, cur)
    if (!m) break
    if (m.is_active !== false && !exclude.has(m.id)) return m
    cur = m.reports_to
  }
  const owner = await getOwner(sb, orgId)
  return owner && !exclude.has(owner.id) ? owner : null
}

async function steps(sb: Svc, docType: DocType, docId: string) {
  const { data } = await sb.from('approval_steps').select('*')
    .eq('doc_type', docType).eq('doc_id', docId).order('step_no', { ascending: true })
  return (data ?? []) as any[]
}

async function setCurrent(sb: Svc, docType: DocType, docId: string, approverId: string | null) {
  await sb.from(DOC_TABLE[docType]).update({ current_approver_id: approverId }).eq('id', docId)
}

async function notifyApprover(orgId: string, docType: DocType, docId: string, ref: string, approverId: string, amount: number, from: string) {
  await createNotification({
    userId:    approverId,
    orgId,
    type:      `${docType}.awaiting_approval`,
    title:     `${DOC_LABEL[docType]} ${ref} needs your approval`,
    body:      `${fmtMoney(amount)} · from ${from}`,
    data:      { doc_type: docType, doc_id: docId },
    actionUrl: DOC_URL[docType](docId),
  })
}

export type ChainResult =
  | { outcome: 'pending'; approver: { id: string; name: string } }
  | { outcome: 'approved' }
  | { outcome: 'rejected' }

/**
 * Start (or restart) the chain for a freshly submitted document. Returns
 * 'approved' only when the submitter is the owner/admin — there is nobody above
 * them, and their authority is unlimited.
 */
export async function startChain(sb: Svc, opts: {
  orgId: string; docType: DocType; docId: string; ref: string
  submitterId: string; amount: number
}): Promise<ChainResult> {
  const { orgId, docType, docId, ref, submitterId, amount } = opts

  // A resubmission voids whatever was still pending from the last round.
  await sb.from('approval_steps').update({ status: 'cancelled', acted_at: new Date().toISOString() })
    .eq('doc_type', docType).eq('doc_id', docId).eq('status', 'pending')
  const stepNo = (await steps(sb, docType, docId)).length + 1

  const submitter = await getMember(sb, orgId, submitterId)
  if (isUnlimited(submitter?.role ?? undefined)) {
    await sb.from('approval_steps').insert({
      org_id: orgId, doc_type: docType, doc_id: docId, step_no: stepNo,
      approver_id: submitterId, acted_by: submitterId, status: 'approved',
      amount, note: 'Submitted by the owner', acted_at: new Date().toISOString(),
    })
    await setCurrent(sb, docType, docId, null)
    return { outcome: 'approved' }
  }

  const approver = await nextApprover(sb, orgId, submitter?.reports_to ?? null, new Set([submitterId]))
  if (!approver) throw new Error('No one is available to approve this — the organization has no active owner.')

  await sb.from('approval_steps').insert({
    org_id: orgId, doc_type: docType, doc_id: docId, step_no: stepNo,
    approver_id: approver.id, status: 'pending', amount,
  })
  await setCurrent(sb, docType, docId, approver.id)
  await notifyApprover(orgId, docType, docId, ref, approver.id, amount, memberName(submitter))
  return { outcome: 'pending', approver: { id: approver.id, name: memberName(approver) } }
}

export class ChainError extends Error {
  constructor(message: string, public status = 403) { super(message) }
}

/**
 * The acting user approves (or endorses) or rejects the pending step.
 * Throws ChainError when they aren't allowed to act.
 */
export async function actOnChain(sb: Svc, opts: {
  orgId: string; docType: DocType; docId: string; ref: string
  submitterId: string | null; amount: number
  actorId: string; actorRole: string
  action: 'approve' | 'reject'; note?: string | null
}): Promise<ChainResult> {
  const { orgId, docType, docId, ref, submitterId, amount, actorId, actorRole, action, note } = opts
  const all = await steps(sb, docType, docId)
  const pending = all.find(s => s.status === 'pending')
  if (!pending) throw new ChainError('This document is not waiting for approval.', 409)

  const isOwner  = isUnlimited(actorRole)
  const isRouted = pending.approver_id === actorId
  if (!isRouted && !isOwner) {
    throw new ChainError('This is waiting on someone else in the reporting line.')
  }
  if (actorId === submitterId && !isOwner) {
    throw new ChainError('You can’t approve a document you submitted.')
  }
  const override = !isRouted
  const now = new Date().toISOString()
  const actor = await getMember(sb, orgId, actorId)
  const submitter = await getMember(sb, orgId, submitterId)
  const audit = (a: string) => logAudit({
    actorId, orgId, action: `${docType}.${a}` as AuditAction,
    tableName: DOC_TABLE[docType], recordId: docId,
    newValue: { ref, amount, step_no: pending.step_no, override, note: note ?? null },
  })

  if (action === 'reject') {
    await sb.from('approval_steps').update({
      status: 'rejected', acted_by: actorId, acted_at: now, is_override: override, note: note ?? null,
    }).eq('id', pending.id)
    await setCurrent(sb, docType, docId, null)
    await audit('reject')
    if (submitterId) {
      await createNotification({
        userId: submitterId, orgId, type: `${docType}.rejected`,
        title: `${DOC_LABEL[docType]} ${ref} was rejected`,
        body: `By ${memberName(actor)}${note ? ` — ${note}` : ''}`,
        data: { doc_type: docType, doc_id: docId }, actionUrl: DOC_URL[docType](docId),
      })
    }
    return { outcome: 'rejected' }
  }

  // Final if this person's authority covers it (an owner override always does).
  if (override || coversAmount(actor, docType, amount)) {
    await sb.from('approval_steps').update({
      status: 'approved', acted_by: actorId, acted_at: now, is_override: override, note: note ?? null,
    }).eq('id', pending.id)
    await setCurrent(sb, docType, docId, null)
    await audit('approve')
    if (submitterId) {
      await createNotification({
        userId: submitterId, orgId, type: `${docType}.approved`,
        title: `${DOC_LABEL[docType]} ${ref} approved`,
        body: `Approved by ${memberName(actor)}`,
        data: { doc_type: docType, doc_id: docId }, actionUrl: DOC_URL[docType](docId),
      })
    }
    return { outcome: 'approved' }
  }

  // Endorse and escalate to the actor's own manager.
  const exclude = new Set<string>([
    ...(submitterId ? [submitterId] : []),
    ...all.map(s => s.approver_id).filter(Boolean),
    actorId,
  ])
  const next = await nextApprover(sb, orgId, actor?.reports_to ?? null, exclude)
  if (!next) {
    throw new ChainError(
      `This totals ${fmtMoney(amount)}, above your approval limit, and there is no one above you to escalate to. Ask the owner to approve it.`,
      409,
    )
  }
  await sb.from('approval_steps').update({
    status: 'endorsed', acted_by: actorId, acted_at: now, note: note ?? null,
  }).eq('id', pending.id)
  await sb.from('approval_steps').insert({
    org_id: orgId, doc_type: docType, doc_id: docId, step_no: pending.step_no + 1,
    approver_id: next.id, status: 'pending', amount,
  })
  await setCurrent(sb, docType, docId, next.id)
  await audit('endorse')
  await notifyApprover(orgId, docType, docId, ref, next.id, amount, memberName(submitter))
  if (submitterId) {
    await createNotification({
      userId: submitterId, orgId, type: `${docType}.endorsed`,
      title: `${DOC_LABEL[docType]} ${ref} endorsed`,
      body: `Endorsed by ${memberName(actor)} — now with ${memberName(next)}`,
      data: { doc_type: docType, doc_id: docId }, actionUrl: DOC_URL[docType](docId),
    })
  }
  return { outcome: 'pending', approver: { id: next.id, name: memberName(next) } }
}

/** Withdraw: the submitter pulls the document back; pending steps are cancelled. */
export async function cancelChain(sb: Svc, docType: DocType, docId: string) {
  await sb.from('approval_steps').update({ status: 'cancelled', acted_at: new Date().toISOString() })
    .eq('doc_type', docType).eq('doc_id', docId).eq('status', 'pending')
  await setCurrent(sb, docType, docId, null)
}

/**
 * A member is leaving (deactivated): move every document waiting on them to
 * the next person up THEIR reporting line (same exclusions as escalation).
 * The old step is kept in the trail as "reassigned". Returns how many moved.
 */
export async function handOverApprovals(sb: Svc, orgId: string, leaverId: string): Promise<number> {
  const leaver = await getMember(sb, orgId, leaverId)
  const { data: pendingSteps } = await sb.from('approval_steps').select('*')
    .eq('org_id', orgId).eq('approver_id', leaverId).eq('status', 'pending')

  let moved = 0
  for (const step of (pendingSteps ?? []) as any[]) {
    const docType = step.doc_type as DocType
    const { data: doc } = await sb.from(DOC_TABLE[docType]).select('*').eq('id', step.doc_id).maybeSingle()
    if (!doc) continue
    const submitterId: string | null = docType === 'requisition'
      ? (doc as any).requested_by
      : ((doc as any).submitted_by ?? (doc as any).created_by ?? null)
    const ref = docType === 'requisition' ? (doc as any).req_number : (doc as any).po_number

    const all = await steps(sb, docType, step.doc_id)
    const exclude = new Set<string>([
      ...(submitterId ? [submitterId] : []),
      ...all.map(s => s.approver_id).filter(Boolean),
      leaverId,
    ])
    const next = await nextApprover(sb, orgId, leaver?.reports_to ?? null, exclude)

    await sb.from('approval_steps').update({
      status: 'cancelled', acted_at: new Date().toISOString(),
      note: `Reassigned — ${memberName(leaver)} was deactivated`,
    }).eq('id', step.id)

    if (next) {
      await sb.from('approval_steps').insert({
        org_id: orgId, doc_type: docType, doc_id: step.doc_id, step_no: step.step_no + 1,
        approver_id: next.id, status: 'pending', amount: step.amount,
      })
      await setCurrent(sb, docType, step.doc_id, next.id)
      await notifyApprover(orgId, docType, step.doc_id, ref, next.id, Number(step.amount ?? 0),
        memberName(await getMember(sb, orgId, submitterId)))
    } else {
      await setCurrent(sb, docType, step.doc_id, null)
    }
    moved++
  }
  return moved
}

export interface TrailStep {
  step_no: number
  status: string
  is_override: boolean
  note: string | null
  amount: number | null
  created_at: string
  acted_at: string | null
  approver: { id: string; name: string; job_title: string | null } | null
  acted_by: { id: string; name: string; job_title: string | null } | null
}

/**
 * Approval trails for many documents in one query, keyed by document id.
 */
export async function loadTrails(sb: Svc, orgId: string, docType: DocType, docIds: string[]): Promise<Map<string, TrailStep[]>> {
  const out = new Map<string, TrailStep[]>()
  if (docIds.length === 0) return out
  const { data } = await sb.from('approval_steps')
    .select(`doc_id, step_no, status, is_override, note, amount, created_at, acted_at,
      approver:user_profiles!approver_id(id, full_name, email, job_title),
      acted_by:user_profiles!acted_by(id, full_name, email, job_title)`)
    .eq('doc_type', docType).eq('org_id', orgId).in('doc_id', docIds)
    // Resubmission voids have no note and are hidden; reassignments are shown.
    .or('status.neq.cancelled,note.not.is.null')
    .order('step_no', { ascending: true })

  const person = (p: any) => p ? { id: p.id, name: memberName(p), job_title: p.job_title ?? null } : null
  for (const s of (data ?? []) as any[]) {
    const list = out.get(s.doc_id) ?? []
    list.push({
      step_no: s.step_no, status: s.status, is_override: s.is_override, note: s.note,
      amount: s.amount, created_at: s.created_at, acted_at: s.acted_at,
      approver: person(s.approver), acted_by: person(s.acted_by),
    })
    out.set(s.doc_id, list)
  }
  return out
}

export type MyAction = 'approve' | 'endorse' | 'override' | null

/**
 * What the viewer can do on a document right now:
 *   'approve'  — it's routed to them and within their limit
 *   'endorse'  — it's routed to them but above their limit (moves up the line)
 *   'override' — they're the owner/admin and it's routed to someone else
 */
export function myAction(opts: {
  trail: TrailStep[]; viewer: Member | null; viewerRole: string
  docType: DocType; amount: number; submitterId: string | null
}): MyAction {
  const { trail, viewer, viewerRole, docType, amount, submitterId } = opts
  const pending = trail.find(s => s.status === 'pending')
  if (!pending || !viewer) return null
  if (pending.approver?.id === viewer.id && viewer.id !== submitterId) {
    return coversAmount(viewer, docType, amount) ? 'approve' : 'endorse'
  }
  return isUnlimited(viewerRole) ? 'override' : null
}

export { getMember as loadMember }
