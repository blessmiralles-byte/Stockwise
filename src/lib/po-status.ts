/**
 * Which moves a purchase order's status may make, and when goods may be
 * received against it.
 *
 * This used to be implied by the order of some if-statements in the route,
 * and anything they didn't mention fell through to a plain update. Walking
 * the flow as a signed-in user showed what that allowed:
 *
 *   - draft → approved, draft → sent and even draft → received, by anyone at
 *     manager level — so a buyer could approve their own order, which is the
 *     one thing the approval chain exists to stop;
 *   - receiving goods against a draft, which also flipped it to "partial" and
 *     so skipped approval altogether.
 *
 * So the moves are written down here, and anything not listed is refused.
 * Pure: the routes apply it.
 */

export type PoStatus = 'draft' | 'pending_approval' | 'approved' | 'sent' | 'partial' | 'received' | 'cancelled'

export type PoMove =
  /** Goes through the approval chain: submit, approve, reject, withdraw. */
  | { ok: true; kind: 'workflow' }
  /** A plain status change by someone allowed to manage orders. */
  | { ok: true; kind: 'plain' }
  | { ok: false; error: string }

/** Set only by the receiving route, from what has actually arrived. */
const RECEIPT_STATES = new Set(['partial', 'received'])

/** An order can be cancelled until goods start arriving against it. */
const CANCELLABLE = new Set(['draft', 'pending_approval', 'approved', 'sent'])

export function poStatusMove(from: string, to: string, approvalsOn: boolean): PoMove {
  if (from === to) return { ok: true, kind: 'plain' }   // nothing to do

  if (RECEIPT_STATES.has(to)) {
    return { ok: false, error: 'An order becomes received by receiving goods against it, not by changing its status.' }
  }
  if (from === 'received' || from === 'cancelled') {
    return { ok: false, error: `This purchase order is ${from} and can no longer be changed.` }
  }

  if (to === 'cancelled') {
    return CANCELLABLE.has(from)
      ? { ok: true, kind: 'plain' }
      : { ok: false, error: 'Goods have already been received against this order, so it can’t be cancelled.' }
  }

  if (approvalsOn) {
    if (from === 'draft' && to === 'pending_approval') return { ok: true, kind: 'workflow' }
    if (from === 'pending_approval' && (to === 'approved' || to === 'draft')) return { ok: true, kind: 'workflow' }
    if (from === 'approved' && to === 'sent') return { ok: true, kind: 'plain' }
    if (to === 'sent') {
      return { ok: false, error: 'This purchase order must be approved before it can be sent to the vendor.' }
    }
    if (to === 'approved') {
      return { ok: false, error: 'Submit this purchase order for approval — it can’t be marked approved directly.' }
    }
    return { ok: false, error: `A purchase order can’t go from ${label(from)} to ${label(to)}.` }
  }

  // No approval workflow on this plan: an order goes straight out.
  if (to === 'sent' && (from === 'draft' || from === 'approved' || from === 'pending_approval')) {
    return { ok: true, kind: 'plain' }
  }
  // An order left mid-approval by a downgrade can be pulled back.
  if (from === 'pending_approval' && to === 'draft') return { ok: true, kind: 'plain' }
  return { ok: false, error: `A purchase order can’t go from ${label(from)} to ${label(to)}.` }
}

/** Goods can only come in against an order that has actually been placed. */
const RECEIVABLE = new Set(['approved', 'sent', 'partial'])

/** null when receiving is allowed, otherwise why not. */
export function receiveBlock(status: string): string | null {
  if (RECEIVABLE.has(status)) return null
  if (status === 'draft') return 'This purchase order is still a draft. Send it before receiving against it.'
  if (status === 'pending_approval') return 'This purchase order is waiting for approval. Nothing can be received against it yet.'
  return `Cannot receive against a ${label(status)} purchase order.`
}

function label(status: string): string {
  return status === 'pending_approval' ? 'awaiting approval' : status
}
