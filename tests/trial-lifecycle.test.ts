import { describe, it, expect } from 'vitest'
import { trialEmailDue, trialEmailCopy, daysBetween, type TrialOrgRow } from '@/lib/trial-lifecycle'

const TODAY = '2026-10-16'
const day = (offset: number) =>
  new Date(Date.parse(TODAY + 'T00:00:00Z') + offset * 86_400_000).toISOString()

const org = (over: Partial<TrialOrgRow> = {}): TrialOrgRow => ({
  id: 'o1',
  plan: 'trial',
  plan_status: 'active',
  created_at: day(-7),
  trial_ends_at: day(7),
  lifecycle_emails: {},
  ...over,
})

describe('which email is due', () => {
  it('welcomes a brand-new account', () => {
    expect(trialEmailDue(org({ created_at: day(0), trial_ends_at: day(14) }), TODAY)).toBe('welcome')
    expect(trialEmailDue(org({ created_at: day(-1), trial_ends_at: day(13) }), TODAY)).toBe('welcome')
  })

  // Rolling this out must not greet people who signed up weeks ago.
  it('never welcomes an account that is already underway', () => {
    expect(trialEmailDue(org({ created_at: day(-5) }), TODAY)).not.toBe('welcome')
  })

  it('nudges in the last few days', () => {
    expect(trialEmailDue(org({ trial_ends_at: day(4) }), TODAY)).toBe('day10')
    expect(trialEmailDue(org({ trial_ends_at: day(2) }), TODAY)).toBe('day10')
  })

  it('warns on the last day and the day before', () => {
    expect(trialEmailDue(org({ trial_ends_at: day(1) }), TODAY)).toBe('last_day')
    expect(trialEmailDue(org({ trial_ends_at: day(0) }), TODAY)).toBe('last_day')
  })

  it('writes once it has ended', () => {
    expect(trialEmailDue(org({ trial_ends_at: day(-1) }), TODAY)).toBe('ended')
  })

  it('says nothing in the quiet middle', () => {
    expect(trialEmailDue(org({ trial_ends_at: day(9) }), TODAY)).toBe(null)
  })

  // The whole point of recording what was sent.
  it.each(['welcome', 'day10', 'last_day', 'ended'] as const)('never repeats %s', kind => {
    const ends = { welcome: day(13), day10: day(3), last_day: day(1), ended: day(-1) }[kind]
    const created = kind === 'welcome' ? day(0) : day(-10)
    const sent = { [kind]: day(-1) }
    expect(trialEmailDue(org({ created_at: created, trial_ends_at: ends, lifecycle_emails: sent }), TODAY)).not.toBe(kind)
  })

  it('leaves paying customers alone', () => {
    expect(trialEmailDue(org({ plan: 'pro', trial_ends_at: day(1) }), TODAY)).toBe(null)
    expect(trialEmailDue(org({ plan: 'starter', trial_ends_at: day(-1) }), TODAY)).toBe(null)
  })

  it('stops writing to a cancelled account', () => {
    expect(trialEmailDue(org({ plan_status: 'cancelled', trial_ends_at: day(-1) }), TODAY)).toBe(null)
  })

  it('copes with a missing trial end date', () => {
    expect(trialEmailDue(org({ created_at: day(-9), trial_ends_at: null }), TODAY)).toBe(null)
  })

  it('counts days by date, not by hours elapsed', () => {
    expect(daysBetween('2026-10-16T23:00:00Z', '2026-10-17T01:00:00Z')).toBe(1)
    expect(daysBetween(TODAY, TODAY)).toBe(0)
  })
})

describe('the wording', () => {
  const base = { businessName: 'Dauntless Electrical', monthly: 49 }

  it('gives every email a subject, a lead and somewhere to go', () => {
    for (const kind of ['welcome', 'day10', 'last_day', 'ended'] as const) {
      const copy = trialEmailCopy(kind, { ...base, daysLeft: 3 })
      expect(copy.subject.length).toBeGreaterThan(10)
      expect(copy.lead).toContain('Dauntless Electrical')
      expect(copy.ctaPath.startsWith('/')).toBe(true)
      expect(copy.cta.length).toBeGreaterThan(3)
    }
  })

  it('quotes the price the customer would actually pay', () => {
    expect(trialEmailCopy('last_day', { ...base, monthly: 49 }).lead).toContain('$49/month')
    expect(trialEmailCopy('last_day', { ...base, monthly: 75 }).lead).toContain('$75/month')
  })

  it('tells someone who has set things up what they have done', () => {
    const copy = trialEmailCopy('day10', { ...base, daysLeft: 3, setup: { products: 42, transactions: 17, users: 3 } })
    expect(copy.lead).toContain('42 product')
    expect(copy.lead).toContain('17 stock movement')
    expect(copy.cta).toBe('Set reorder points')
  })

  it('points an empty account at the fastest way to judge it', () => {
    const copy = trialEmailCopy('day10', { ...base, daysLeft: 3, setup: { products: 0, transactions: 0, users: 1 } })
    expect(copy.cta).toBe('Import your products')
  })

  it('gets singular and plural right', () => {
    const one = trialEmailCopy('day10', { ...base, daysLeft: 3, setup: { products: 1, transactions: 1, users: 1 } })
    expect(one.lead).toContain('1 product,')
    expect(one.lead).not.toContain('1 products')
    expect(one.lead).not.toContain('1 stock movements')
    expect(one.lead).not.toContain('1 team members')
  })

  it('says "today" on the last day and "tomorrow" the day before', () => {
    expect(trialEmailCopy('last_day', { ...base, daysLeft: 0 }).subject).toContain('today')
    expect(trialEmailCopy('last_day', { ...base, daysLeft: 1 }).subject).toContain('tomorrow')
  })

  // Nobody should fear losing their work because a trial lapsed.
  it('reassures that nothing is deleted when a trial ends', () => {
    const copy = trialEmailCopy('ended', base)
    expect(copy.lead.toLowerCase()).toContain('exactly where you left it')
    expect(copy.subject.toLowerCase()).toContain('safe')
  })
})
