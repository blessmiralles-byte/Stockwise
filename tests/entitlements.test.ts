import { describe, it, expect } from 'vitest'
import {
  FEATURES, effectiveTier, planHasFeature, featuresIntroducedAt, upgradeMessage, type Feature,
} from '@/lib/entitlements'

const ALL = Object.keys(FEATURES) as Feature[]

describe('plan entitlements', () => {
  it('gives Starter the shared features only', () => {
    for (const f of ALL) expect(planHasFeature('starter', f)).toBe(false)
  })

  it('unlocks every Pro feature on Pro', () => {
    const pro = ALL.filter(f => FEATURES[f].minPlan === 'pro')
    expect(pro.length).toBeGreaterThan(0)
    for (const f of pro) expect(planHasFeature('pro', f)).toBe(true)
  })

  it('treats a trial as Pro so trialists see what they would lose', () => {
    for (const f of ALL) {
      expect(planHasFeature('trial', f)).toBe(FEATURES[f].minPlan !== 'enterprise')
    }
  })

  it('unlocks everything on Enterprise', () => {
    for (const f of ALL) expect(planHasFeature('enterprise', f)).toBe(true)
  })

  it('keeps Enterprise-only features off Pro', () => {
    for (const f of ALL.filter(x => FEATURES[x].minPlan === 'enterprise')) {
      expect(planHasFeature('pro', f)).toBe(false)
    }
  })

  // A typo or an unknown plan from the billing webhook must never hand out
  // paid features — it falls back to the cheapest tier.
  it.each([null, undefined, '', 'platinum', 'PRO', 'business'])('fails closed for plan %s', plan => {
    expect(effectiveTier(plan as any)).toBe('starter')
    for (const f of ALL) expect(planHasFeature(plan as any, f)).toBe(false)
  })

  it('never lists a feature as introduced at two tiers', () => {
    const counted = ['starter', 'pro', 'enterprise'].flatMap(t => featuresIntroducedAt(t as any))
    expect(new Set(counted).size).toBe(counted.length)
    expect(counted.sort()).toEqual([...ALL].sort())
  })

  it('names the required plan in the upgrade message', () => {
    expect(upgradeMessage('approvals')).toContain('Pro')
    expect(upgradeMessage('integrations')).toContain('Enterprise')
  })

  it('describes every feature (used by the pricing table)', () => {
    for (const f of ALL) {
      expect(FEATURES[f].label.length).toBeGreaterThan(3)
      expect(FEATURES[f].description.length).toBeGreaterThan(10)
    }
  })
})
