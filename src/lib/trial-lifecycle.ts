/**
 * Which trial email an organization should get today, if any.
 *
 * A trial that ends in silence costs a customer: the owner finds out by being
 * locked out, days after they last thought about us. Four moments are worth an
 * email, each sent once:
 *
 *   welcome   the day they sign up — what to do first
 *   day10     a few days left, with what they have set up so far
 *   last_day  tomorrow it ends — choose a plan or lose access
 *   ended     it has ended — the data is safe and waiting
 *
 * Pure: the caller supplies the org row and today's date.
 */

export type TrialEmailKind = 'welcome' | 'day10' | 'last_day' | 'ended'

export interface TrialOrgRow {
  id: string
  plan: string | null
  plan_status: string | null
  trial_ends_at: string | null
  created_at: string | null
  lifecycle_emails?: Record<string, string> | null
}

/** Whole days from `from` to `to`, by date (time of day doesn't matter). */
export function daysBetween(from: string | Date, to: string | Date): number {
  const day = (d: string | Date) => Date.parse((typeof d === 'string' ? d : d.toISOString()).slice(0, 10) + 'T00:00:00Z')
  return Math.round((day(to) - day(from)) / 86_400_000)
}

/** The email a trial is due today, or null. Already-sent kinds are skipped. */
export function trialEmailDue(org: TrialOrgRow, today: string | Date = new Date()): TrialEmailKind | null {
  if (org.plan !== 'trial') return null            // paid, or already converted
  if (org.plan_status === 'cancelled') return null

  const sent = org.lifecycle_emails ?? {}
  const due = (kind: TrialEmailKind) => (sent[kind] ? null : kind)

  // Welcome goes out on the first run after signup — day 0 or 1, no later, so
  // an old account that predates this never gets a surprise "welcome".
  if (org.created_at) {
    const age = daysBetween(org.created_at, today)
    if (age <= 1 && !sent.welcome) return 'welcome'
  }

  if (!org.trial_ends_at) return null
  const left = daysBetween(today, org.trial_ends_at)

  if (left < 0)  return due('ended')
  if (left === 0 || left === 1) return due('last_day')
  // One nudge in the middle, while there is still time to act on it.
  if (left <= 4) return due('day10')
  return null
}

/** Subject and body copy. Kept here so the wording is testable. */
export function trialEmailCopy(kind: TrialEmailKind, opts: {
  businessName: string
  daysLeft?: number
  monthly?: number
  setup?: { products: number; transactions: number; users: number }
}): { subject: string; heading: string; lead: string; cta: string; ctaPath: string } {
  const { businessName, daysLeft = 0, monthly, setup } = opts
  const price = monthly ? `$${monthly}/month` : 'a plan'

  switch (kind) {
    case 'welcome':
      return {
        subject: `Welcome to Stocked — here's the quickest way in`,
        heading: 'Three things get you running',
        lead: `Your 14-day trial for ${businessName} has started — no card, nothing to cancel. ` +
              `If you want to see it working before typing anything in, load the sample data from the setup guide and have a click around.`,
        cta: 'Open the setup guide',
        ctaPath: '/setup?tab=start',
      }

    case 'day10': {
      const done = setup && (setup.products > 0 || setup.transactions > 0)
      return {
        subject: `${daysLeft} days left on your Stocked trial`,
        heading: done ? 'You are most of the way there' : 'Still time to try the useful part',
        lead: done
          ? `So far you have ${setup!.products} product${setup!.products === 1 ? '' : 's'}, ` +
            `${setup!.transactions} stock movement${setup!.transactions === 1 ? '' : 's'} and ` +
            `${setup!.users} team member${setup!.users === 1 ? '' : 's'} on ${businessName}. ` +
            `The next thing worth doing is setting reorder points, so stock asks to be ordered instead of you noticing it is gone.`
          : `${businessName}'s trial has ${daysLeft} days to run. The fastest way to judge Stocked is to import your product list and record what is on hand — about ten minutes, and the reports fill in from there.`,
        cta: done ? 'Set reorder points' : 'Import your products',
        ctaPath: done ? '/setup?tab=products' : '/setup?tab=start',
      }
    }

    case 'last_day':
      return {
        subject: `Your Stocked trial ends ${daysLeft <= 0 ? 'today' : 'tomorrow'}`,
        heading: `Choose a plan to keep going`,
        lead: `${businessName}'s trial ends ${daysLeft <= 0 ? 'today' : 'tomorrow'}. ` +
              `Plans start at ${price}, and everything you have entered stays exactly as it is. ` +
              `If you need longer to decide, reply to this email and we will sort it out.`,
        cta: 'Choose a plan',
        ctaPath: '/settings?tab=billing',
      }

    case 'ended':
      return {
        subject: `Your Stocked trial has ended — your data is safe`,
        heading: 'Nothing has been deleted',
        lead: `${businessName}'s trial has ended, so the account is paused rather than gone. ` +
              `Everything — your products, stock, purchase orders and history — is exactly where you left it, ` +
              `and comes straight back when you pick a plan. Plans start at ${price}.`,
        cta: 'Reactivate',
        ctaPath: '/settings?tab=billing',
      }
  }
}
