import { describe, it, expect } from 'vitest'
import {
  RETENTION, retentionAction, inactiveFrom, daysUntilPurge, retentionCopy, daysSince,
  type RetentionOrg,
} from '@/lib/retention'

const TODAY = '2026-10-17'
const day = (offset: number) =>
  new Date(Date.parse(TODAY + 'T00:00:00Z') + offset * 86_400_000).toISOString()

const lapsedTrial = (daysAgo: number, emails: Record<string, string> = {}): RetentionOrg => ({
  id: 'o1', plan: 'trial', plan_status: 'active',
  trial_ends_at: day(-daysAgo), inactive_since: null, retention_emails: emails,
})

const cancelled = (daysAgo: number, emails: Record<string, string> = {}): RetentionOrg => ({
  id: 'o2', plan: 'pro', plan_status: 'cancelled',
  trial_ends_at: null, inactive_since: day(-daysAgo), retention_emails: emails,
})

describe('when the clock starts', () => {
  it('runs a lapsed trial from the day it ended', () => {
    expect(inactiveFrom(lapsedTrial(30))).toBe(day(-30))
  })

  it('has not started for a trial still running', () => {
    expect(inactiveFrom({ ...lapsedTrial(0), trial_ends_at: day(5) })).toBe(null)
  })

  it('runs a cancelled plan from when we first noticed', () => {
    expect(inactiveFrom(cancelled(10))).toBe(day(-10))
  })

  it('counts days by date', () => {
    expect(daysSince(day(-61), TODAY)).toBe(61)
  })
})

describe('what is due today', () => {
  it('says nothing while the account is live', () => {
    expect(retentionAction({ id: 'x', plan: 'pro', plan_status: 'active', trial_ends_at: null, inactive_since: null }, TODAY)).toBe(null)
    expect(retentionAction({ ...lapsedTrial(0), trial_ends_at: day(7) }, TODAY)).toBe(null)
  })

  it('says nothing in the first weeks of silence', () => {
    expect(retentionAction(lapsedTrial(30), TODAY)).toBe(null)
    expect(retentionAction(lapsedTrial(RETENTION.firstWarningDay - 1), TODAY)).toBe(null)
  })

  it('sends the first warning at 60 days', () => {
    expect(retentionAction(lapsedTrial(RETENTION.firstWarningDay), TODAY)).toBe('warn_first')
  })

  it('sends the final warning at 83 days', () => {
    expect(retentionAction(lapsedTrial(RETENTION.finalWarningDay, { warn_first: day(-23) }), TODAY)).toBe('warn_final')
  })

  it('purges at 90, once both warnings have gone out', () => {
    const org = lapsedTrial(RETENTION.purgeDay, { warn_first: day(-30), warn_final: day(-7) })
    expect(retentionAction(org, TODAY)).toBe('purge')
  })

  it('treats a cancelled subscription the same way', () => {
    expect(retentionAction(cancelled(RETENTION.firstWarningDay), TODAY)).toBe('warn_first')
    expect(retentionAction(cancelled(RETENTION.purgeDay, { warn_first: day(-30), warn_final: day(-7) }), TODAY)).toBe('purge')
  })

  it('never repeats a warning', () => {
    expect(retentionAction(lapsedTrial(62, { warn_first: day(-2) }), TODAY)).toBe(null)
    expect(retentionAction(lapsedTrial(85, { warn_first: day(-25), warn_final: day(-2) }), TODAY)).toBe(null)
  })
})

describe('nothing is deleted unwarned', () => {
  // If the warning emails never went out — a broken mailer, a bounced
  // address — the data stays. Silence must fail towards keeping it.
  it('refuses to purge when no warning was sent', () => {
    expect(retentionAction(lapsedTrial(200), TODAY)).toBe('warn_final')
  })

  it('refuses to purge when only the first warning was sent', () => {
    expect(retentionAction(lapsedTrial(200, { warn_first: day(-100) }), TODAY)).toBe('warn_final')
  })

  it('waits a few days after the final warning, even past day 90', () => {
    const justWarned = lapsedTrial(RETENTION.purgeDay + 5, { warn_first: day(-40), warn_final: day(-1) })
    expect(retentionAction(justWarned, TODAY)).toBe(null)
  })

  it('purges once that grace period has passed', () => {
    const org = lapsedTrial(RETENTION.purgeDay + 10, {
      warn_first: day(-45), warn_final: day(-RETENTION.minDaysAfterFinalWarning),
    })
    expect(retentionAction(org, TODAY)).toBe('purge')
  })

  it('never touches a paying customer, however old the account', () => {
    const paying: RetentionOrg = {
      id: 'p', plan: 'pro', plan_status: 'active', trial_ends_at: day(-900),
      inactive_since: day(-900), retention_emails: { warn_first: day(-800), warn_final: day(-700) },
    }
    expect(retentionAction(paying, TODAY)).toBe(null)
  })

  it('leaves a reactivated account alone', () => {
    const reactivated: RetentionOrg = {
      id: 'r', plan: 'starter', plan_status: 'active', trial_ends_at: day(-120),
      inactive_since: day(-120), retention_emails: { warn_first: day(-60), warn_final: day(-37) },
    }
    expect(retentionAction(reactivated, TODAY)).toBe(null)
  })
})

describe('the countdown and the wording', () => {
  it('counts down to the purge day', () => {
    expect(daysUntilPurge(lapsedTrial(RETENTION.firstWarningDay), TODAY)).toBe(30)
    expect(daysUntilPurge(lapsedTrial(RETENTION.finalWarningDay), TODAY)).toBe(7)
    expect(daysUntilPurge(lapsedTrial(RETENTION.purgeDay + 3), TODAY)).toBe(0)
  })

  it('names the business and the deadline in both warnings', () => {
    for (const action of ['warn_first', 'warn_final'] as const) {
      const copy = retentionCopy(action, { businessName: 'Dauntless Electrical', daysLeft: 7 })
      expect(copy.subject.length).toBeGreaterThan(10)
      expect(copy.lead).toContain('Dauntless Electrical')
      expect(copy.lead).toContain('7 days')
    }
  })

  it('offers both ways out — come back, or take a copy', () => {
    const copy = retentionCopy('warn_first', { businessName: 'Acme', daysLeft: 30 })
    expect(copy.lead.toLowerCase()).toContain('plan')
    expect(copy.lead.toLowerCase()).toContain('download')
  })

  it('is blunt in the final warning about what cannot be undone', () => {
    const copy = retentionCopy('warn_final', { businessName: 'Acme', daysLeft: 7 })
    expect(copy.lead.toLowerCase()).toContain('cannot be recovered')
    expect(copy.subject.toLowerCase()).toContain('last chance')
  })

  it('says tomorrow rather than "in 1 days"', () => {
    expect(retentionCopy('warn_final', { businessName: 'Acme', daysLeft: 1 }).subject).toContain('tomorrow')
  })
})
