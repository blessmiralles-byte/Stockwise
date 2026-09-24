import { describe, it, expect } from 'vitest'
import { billingState } from '@/lib/billing'
import {
  regionForCountry, isPricingRegion, monthlyPrice, annualPrice, PAID_PLANS, PLAN_CONFIG,
} from '@/lib/plan-config'

const days = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString()

describe('billing state', () => {
  it('keeps a running trial open and counts the days left', () => {
    const s = billingState({ plan: 'trial', plan_status: 'active', trial_ends_at: days(5) })
    expect(s.locked).toBe(false)
    expect(s.onTrial).toBe(true)
    expect(s.trialDaysLeft).toBe(5)
  })

  it('locks an expired trial', () => {
    const s = billingState({ plan: 'trial', plan_status: 'active', trial_ends_at: days(-1) })
    expect(s.locked).toBe(true)
    expect(s.reason).toBe('trial_expired')
    expect(s.trialDaysLeft).toBe(0)
  })

  it('says so when the trial was already used by this email', () => {
    const s = billingState({ plan: 'trial', plan_status: 'active', trial_ends_at: days(0), trial_reused: true })
    expect(s.locked).toBe(true)
    expect(s.reason).toBe('trial_used')
  })

  it('locks a cancelled subscription', () => {
    const s = billingState({ plan: 'pro', plan_status: 'cancelled', trial_ends_at: null })
    expect(s.locked).toBe(true)
    expect(s.reason).toBe('cancelled')
  })

  // Lemon Squeezy retries a failed payment — warn, but don't lock them out.
  it('warns but does not lock when payment is past due', () => {
    const s = billingState({ plan: 'pro', plan_status: 'past_due', trial_ends_at: null })
    expect(s.locked).toBe(false)
    expect(s.pastDue).toBe(true)
  })

  it('leaves an active paid plan alone', () => {
    const s = billingState({ plan: 'starter', plan_status: 'active', trial_ends_at: null })
    expect(s.locked).toBe(false)
    expect(s.reason).toBe(null)
  })
})

describe('regional pricing', () => {
  it.each(['PH', 'ph', 'SG', 'ID', 'VN', 'TH', 'MY', 'KH', 'LA', 'MM', 'BN', 'TL'])(
    'prices %s in the ASEAN band', c => expect(regionForCountry(c)).toBe('asean'))

  it.each(['US', 'DE', 'AU', 'GB', 'JP', 'IN', 'CN', 'NZ'])(
    'prices %s at standard rates', c => expect(regionForCountry(c)).toBe('standard'))

  // No country header (local dev, a crawler, a privacy proxy) must never give
  // away the cheaper price.
  it.each([null, undefined, ''])('falls back to standard when the country is unknown (%s)', c => {
    expect(regionForCountry(c as any)).toBe('standard')
  })

  it('validates stored region values', () => {
    expect(isPricingRegion('asean')).toBe(true)
    expect(isPricingRegion('standard')).toBe(true)
    expect(isPricingRegion('apac')).toBe(false)
    expect(isPricingRegion(null)).toBe(false)
  })

  it('charges ASEAN less than standard on every paid plan', () => {
    for (const plan of PAID_PLANS) {
      expect(monthlyPrice(plan, 'asean')).toBeLessThan(monthlyPrice(plan, 'standard'))
    }
  })

  it('prices Pro above Starter in both bands', () => {
    for (const region of ['asean', 'standard'] as const) {
      expect(monthlyPrice('pro', region)).toBeGreaterThan(monthlyPrice('starter', region))
    }
  })

  it('gives two months free on annual', () => {
    for (const plan of PAID_PLANS) {
      for (const region of ['asean', 'standard'] as const) {
        expect(annualPrice(plan, region)).toBe(monthlyPrice(plan, region) * 10)
      }
    }
  })

  it('matches the published prices', () => {
    expect(monthlyPrice('starter', 'asean')).toBe(49)
    expect(monthlyPrice('starter', 'standard')).toBe(75)
    expect(monthlyPrice('pro', 'asean')).toBe(99)
    expect(monthlyPrice('pro', 'standard')).toBe(149)
  })

  it('caps seats per plan, rising with price', () => {
    expect(PLAN_CONFIG.starter.maxUsers).toBe(5)
    expect(PLAN_CONFIG.pro.maxUsers).toBeGreaterThan(PLAN_CONFIG.starter.maxUsers)
  })
})
