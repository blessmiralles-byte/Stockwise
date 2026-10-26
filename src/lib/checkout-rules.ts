/**
 * Who may take a tool, and who may hand one to somebody else.
 *
 * Until now any signed-in person could check out any tool to any name they
 * typed — so a labourer could take a $4,000 laser level, recorded as "the new
 * guy". Two controls, both opt-in per organization:
 *
 *   1. Issuing to others is a supervisory act. When restricted, a crew member
 *      may only take a tool for themselves; a storekeeper, manager, buyer or
 *      owner may hand one to anyone.
 *   2. Value crosses a line. Above a threshold a tool needs approval however
 *      its own flag is set — so nobody has to remember to tick the box on
 *      every expensive item they add.
 *
 * Pure rules. The route supplies the rows and applies the result.
 */

/** Roles whose job includes handing tools to other people. */
const CAN_ISSUE_TO_OTHERS = new Set([
  'owner', 'admin',        // the account holder
  'operations', 'manager', // supervises the crew
  'procurement',           // buys and books in the kit
  'receiver',              // the storekeeper handing it over the counter
])

export interface CheckoutPolicy {
  /** Only supervisory roles may check a tool out to someone else. */
  restrictToSelf?: boolean | null
  /** Tools worth more than this need approval, whatever their own flag says. */
  approvalOver?: number | null
  /** Approvals are a paid feature; without it an approval can't be asked for. */
  approvalsEnabled?: boolean
}

export interface AssetForCheckout {
  requires_checkout_approval?: boolean | null
  current_value?: number | null
  purchase_cost?: number | null
}

export function canIssueToOthers(role: string | null | undefined): boolean {
  return CAN_ISSUE_TO_OTHERS.has((role ?? '').toLowerCase())
}

/** What a tool is worth today — book value if we have it, otherwise what it cost. */
export function assetValue(asset: AssetForCheckout): number {
  const current = Number(asset.current_value ?? NaN)
  if (Number.isFinite(current) && current > 0) return current
  const cost = Number(asset.purchase_cost ?? 0)
  return Number.isFinite(cost) ? cost : 0
}

export interface HolderDecision {
  /** null when the request is allowed. */
  error: string | null
  holderName: string
  holderPersonId: string | null
  /** True when the person took it for themselves. */
  isSelf: boolean
  /**
   * They named someone else and aren't a supervisor: this becomes a request
   * for approval rather than a refusal, so a foreman can still ask for a tool
   * on a crew member's behalf and the custody record names the right person.
   */
  needsApproval: boolean
}

/**
 * Settle who ends up holding the tool.
 *
 * An empty holder always means "me", which is what a crew member tapping
 * Check out on their own phone expects. Naming someone else is the act that
 * the restriction governs.
 */
export function resolveHolder(
  req: { holderName?: string | null; holderPersonId?: string | null },
  actor: { role?: string | null; name?: string | null; personId?: string | null },
  policy: CheckoutPolicy = {},
): HolderDecision {
  const selfName = (actor.name ?? '').trim()
  const asked = (req.holderName ?? '').trim()
  const askedPerson = req.holderPersonId ?? null

  // No name given, or their own: they are taking it themselves.
  const selfRequested =
    !asked ||
    (!!selfName && asked.toLowerCase() === selfName.toLowerCase()) ||
    (!!actor.personId && askedPerson === actor.personId)

  if (selfRequested) {
    const name = asked || selfName
    if (!name) {
      return {
        error: 'We need a name for whoever is taking this tool.',
        holderName: '', holderPersonId: null, isSelf: true, needsApproval: false,
      }
    }
    return {
      error: null, holderName: name,
      holderPersonId: askedPerson ?? actor.personId ?? null,
      isSelf: true, needsApproval: false,
    }
  }

  if (policy.restrictToSelf && !canIssueToOthers(actor.role)) {
    // Without approvals there is nobody to ask, so this has to be a refusal.
    if (!policy.approvalsEnabled) {
      return {
        error: 'You can only check tools out to yourself. Ask a supervisor or the storekeeper to issue it to someone else.',
        holderName: asked, holderPersonId: askedPerson, isSelf: false, needsApproval: false,
      }
    }
    // Otherwise it stands as a request on someone else's behalf.
    return { error: null, holderName: asked, holderPersonId: askedPerson, isSelf: false, needsApproval: true }
  }

  return { error: null, holderName: asked, holderPersonId: askedPerson, isSelf: false, needsApproval: false }
}

export interface ApprovalDecision {
  required: boolean
  /** Shown to the person checking out, so the wait makes sense. */
  reason: string | null
}

/**
 * Whether this check-out needs approving: because the tool is flagged, or
 * because it is worth more than the organization is willing to let walk out
 * unattended.
 */
export function approvalNeeded(asset: AssetForCheckout, policy: CheckoutPolicy = {}): ApprovalDecision {
  if (!policy.approvalsEnabled) return { required: false, reason: null }

  if (asset.requires_checkout_approval) {
    return { required: true, reason: 'This tool is set to need approval before it leaves.' }
  }

  const limit = policy.approvalOver == null ? null : Number(policy.approvalOver)
  if (limit != null && limit > 0 && assetValue(asset) > limit) {
    return { required: true, reason: 'This tool is above the value your company allows without approval.' }
  }

  return { required: false, reason: null }
}
