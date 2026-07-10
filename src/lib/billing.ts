/**
 * Subscription / trial access state, computed live from the organization row.
 * No cron needed to lock — an expired trial is derived from trial_ends_at at
 * request time.
 */

export interface OrgBilling {
  plan:          string        // 'trial' | 'starter' | 'pro' | 'enterprise'
  plan_status:   string        // 'active' | 'past_due' | 'cancelled'
  trial_ends_at: string | null
}

export type BillingReason = 'trial_expired' | 'cancelled' | null

export interface BillingState {
  locked:        boolean       // block the app until they pay
  reason:        BillingReason
  onTrial:       boolean
  pastDue:       boolean       // soft warning; not locked (Stripe still retrying)
  trialDaysLeft: number | null // when on trial
}

export function billingState(org: OrgBilling): BillingState {
  const now       = Date.now()
  const onTrial   = org.plan === 'trial'
  const trialEnds = org.trial_ends_at ? new Date(org.trial_ends_at).getTime() : null

  const trialExpired = onTrial && trialEnds != null && trialEnds < now
  const cancelled    = org.plan_status === 'cancelled'
  const pastDue      = org.plan_status === 'past_due'

  const reason: BillingReason = trialExpired ? 'trial_expired' : cancelled ? 'cancelled' : null

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
