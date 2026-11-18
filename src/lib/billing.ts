/**
 * Subscription / trial access state, computed live from the organization row.
 * No cron needed to lock — an expired trial is derived from trial_ends_at at
 * request time.
 */

export interface OrgBilling {
  plan:          string        // 'trial' | 'starter' | 'pro' | 'enterprise'
  plan_status:   string        // 'active' | 'past_due' | 'cancelled'
  trial_ends_at: string | null
  /** true = this signup's email had already used its free trial */
  trial_reused?: boolean | null
}

export type BillingReason = 'trial_expired' | 'trial_used' | 'cancelled' | null

export interface BillingState {
  locked:        boolean       // block the app until they pay
  reason:        BillingReason
  onTrial:       boolean
  pastDue:       boolean       // soft warning; not locked (Lemon Squeezy still retrying)
  trialDaysLeft: number | null // when on trial
}

/**
 * Whether an org may drop onto the free Stocked Tools plan by itself.
 * Only from the paywall (trial over, or subscription ended): an org that is
 * still on an open trial or a live paid plan would otherwise switch to free
 * while Lemon Squeezy kept charging it — those cancel through billing first.
 */
export function canSwitchToToolsFree(org: OrgBilling): boolean {
  if (org.plan === 'tools_free') return false
  return billingState(org).locked
}

export function billingState(org: OrgBilling): BillingState {
  const now       = Date.now()
  const onTrial   = org.plan === 'trial'
  const trialEnds = org.trial_ends_at ? new Date(org.trial_ends_at).getTime() : null

  // A reused trial is over the moment it is detected — don't wait on the clock,
  // which is set to "now" and would otherwise leave a sliver of free access.
  const trialExpired = onTrial && (!!org.trial_reused || (trialEnds != null && trialEnds <= now))
  const cancelled    = org.plan_status === 'cancelled'
  const pastDue      = org.plan_status === 'past_due'

  const reason: BillingReason = trialExpired
    ? (org.trial_reused ? 'trial_used' : 'trial_expired')
    : cancelled ? 'cancelled' : null

  return {
    locked:        trialExpired || cancelled,
    reason,
    onTrial,
    pastDue,
    trialDaysLeft: onTrial && trialEnds != null
      ? Math.max(0, Math.ceil((trialEnds - now) / 86_400_000))
      : null,
  }
}
