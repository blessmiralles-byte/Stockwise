/**
 * What happens to an account nobody comes back to.
 *
 * Keeping abandoned trials forever is hard to justify — it is other people's
 * business data, and their customers' and staff's names with it. Deleting it
 * quietly is worse. So: ninety days after an account stops being paid for, with
 * two warnings and a download link before anything goes.
 *
 * Pure date logic. The route supplies the rows; nothing here deletes anything.
 */

export const RETENTION = {
  /** First warning: a month still to act. */
  firstWarningDay: 60,
  /** Second warning: a week left. */
  finalWarningDay: 83,
  /** Everything is removed on this day. */
  purgeDay: 90,
  /** A purge may not follow its final warning sooner than this. */
  minDaysAfterFinalWarning: 5,
} as const

export type RetentionAction = 'warn_first' | 'warn_final' | 'purge' | null

export interface RetentionOrg {
  id: string
  plan: string | null
  plan_status: string | null
  trial_ends_at: string | null
  /** When we first saw the account go quiet; set by the job for cancelled plans. */
  inactive_since: string | null
  retention_emails?: Record<string, string> | null
}

function dayOf(d: string | Date): number {
  return Date.parse((typeof d === 'string' ? d : d.toISOString()).slice(0, 10) + 'T00:00:00Z')
}

export function daysSince(from: string | Date, today: string | Date = new Date()): number {
  return Math.round((dayOf(today) - dayOf(from)) / 86_400_000)
}

/**
 * The date an account stopped being live, or null if it still is.
 *
 * A lapsed trial dates from the day the trial ended — we know exactly when.
 * A cancelled subscription dates from when the job first noticed, which is
 * conservative: the clock starts later rather than earlier.
 */
export function inactiveFrom(org: RetentionOrg): string | null {
  if (org.plan_status === 'cancelled') return org.inactive_since ?? null
  if (org.plan === 'trial' && org.trial_ends_at) {
    const ended = daysSince(org.trial_ends_at) > 0
    return ended ? org.trial_ends_at : null
  }
  return null
}

/**
 * What this account is due today.
 *
 * Nothing is ever purged without both warnings having been sent, and never
 * within a few days of the final one — if the warning emails failed, the data
 * stays. Paying accounts are untouched whatever the dates say.
 */
export function retentionAction(org: RetentionOrg, today: string | Date = new Date()): RetentionAction {
  // An active paid plan is live, full stop.
  if (org.plan !== 'trial' && org.plan_status !== 'cancelled') return null

  const from = inactiveFrom(org)
  if (!from) return null

  const days = daysSince(from, today)
  const sent = org.retention_emails ?? {}

  if (days >= RETENTION.purgeDay) {
    // Both warnings must have gone out, and the final one long enough ago to
    // have been read and acted on.
    if (!sent.warn_first || !sent.warn_final) return sent.warn_final ? null : 'warn_final'
    if (daysSince(sent.warn_final, today) < RETENTION.minDaysAfterFinalWarning) return null
    return 'purge'
  }

  if (days >= RETENTION.finalWarningDay) return sent.warn_final ? null : 'warn_final'
  if (days >= RETENTION.firstWarningDay) return sent.warn_first ? null : 'warn_first'
  return null
}

/** Days left before removal, for the warning email. */
export function daysUntilPurge(org: RetentionOrg, today: string | Date = new Date()): number {
  const from = inactiveFrom(org)
  if (!from) return RETENTION.purgeDay
  return Math.max(0, RETENTION.purgeDay - daysSince(from, today))
}

/** Subject and body for a retention warning. */
export function retentionCopy(action: Exclude<RetentionAction, 'purge' | null>, opts: {
  businessName: string
  daysLeft: number
}): { subject: string; heading: string; lead: string } {
  const { businessName, daysLeft } = opts
  const when = daysLeft === 1 ? 'tomorrow' : `in ${daysLeft} days`

  if (action === 'warn_first') {
    return {
      subject: `Your Stocked data will be removed ${when}`,
      heading: 'Your account has been quiet for a while',
      lead: `${businessName} has been inactive for ${RETENTION.firstWarningDay} days. ` +
            `We keep paused accounts for ${RETENTION.purgeDay} days, so this one is due to be removed ${when}. ` +
            `Pick up where you left off by choosing a plan — or download a copy of everything first. ` +
            `Either way, nothing happens until then.`,
    }
  }
  return {
    subject: `Last chance — ${businessName}'s data is removed ${when}`,
    heading: `${daysLeft === 1 ? 'Tomorrow' : `In ${daysLeft} days`}, this is deleted`,
    lead: `This is the last reminder. ${businessName}'s data — products, stock history, purchase ` +
          `orders, assets — is removed ${when} and cannot be recovered afterwards. ` +
          `Reactivate to keep it, or download a copy while you still can.`,
  }
}
