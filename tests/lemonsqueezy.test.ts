import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { variantEnvKey, variantFor, planFromVariant, planStatusFromLS } from '@/lib/lemonsqueezy'
import { PLAN_CONFIG } from '@/lib/plan-config'

/**
 * The webhook turns a Lemon Squeezy variant id into the plan a customer gets.
 * A mistake here either charges the wrong price or hands out the wrong plan —
 * an earlier version provisioned an unrecognised variant as Enterprise with
 * 999 seats, so one missing env var would have given away unlimited seats.
 */
const ENV = {
  LEMONSQUEEZY_VARIANT_STARTER_ASEAN:           '111',
  LEMONSQUEEZY_VARIANT_STARTER_ASEAN_ANNUAL:    '112',
  LEMONSQUEEZY_VARIANT_STARTER_STANDARD:        '121',
  LEMONSQUEEZY_VARIANT_STARTER_STANDARD_ANNUAL: '122',
  LEMONSQUEEZY_VARIANT_PRO_ASEAN:               '211',
  LEMONSQUEEZY_VARIANT_PRO_ASEAN_ANNUAL:        '212',
  LEMONSQUEEZY_VARIANT_PRO_STANDARD:            '221',
  LEMONSQUEEZY_VARIANT_PRO_STANDARD_ANNUAL:     '222',
}

const saved: Record<string, string | undefined> = {}
beforeEach(() => {
  for (const [k, v] of Object.entries(ENV)) { saved[k] = process.env[k]; process.env[k] = v }
  saved.LEMONSQUEEZY_VARIANT_ENTERPRISE = process.env.LEMONSQUEEZY_VARIANT_ENTERPRISE
  delete process.env.LEMONSQUEEZY_VARIANT_ENTERPRISE
})
afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v
  }
})

describe('variant lookup', () => {
  it('names the env var per plan, region and interval', () => {
    expect(variantEnvKey('starter', 'monthly', 'asean')).toBe('LEMONSQUEEZY_VARIANT_STARTER_ASEAN')
    expect(variantEnvKey('pro', 'annual', 'standard')).toBe('LEMONSQUEEZY_VARIANT_PRO_STANDARD_ANNUAL')
  })

  it('finds each configured variant', () => {
    expect(variantFor('starter', 'monthly', 'asean')).toBe('111')
    expect(variantFor('starter', 'annual', 'standard')).toBe('122')
    expect(variantFor('pro', 'monthly', 'standard')).toBe('221')
  })

  // Better a clear "not configured" error at checkout than charging the
  // wrong region's price.
  it('returns nothing when a variant is not configured', () => {
    delete process.env.LEMONSQUEEZY_VARIANT_PRO_ASEAN
    expect(variantFor('pro', 'monthly', 'asean')).toBeUndefined()
  })

  it('keeps every band and interval on a distinct variant', () => {
    const ids = Object.values(ENV)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('plan from a paid variant', () => {
  it.each([
    ['111', 'starter'], ['112', 'starter'], ['121', 'starter'], ['122', 'starter'],
    ['211', 'pro'],     ['212', 'pro'],     ['221', 'pro'],     ['222', 'pro'],
  ])('maps variant %s to %s', (variant, plan) => {
    expect(planFromVariant(variant)).toMatchObject({ plan, known: true })
  })

  it('carries the plan’s seat limit', () => {
    expect(planFromVariant('211').maxUsers).toBe(PLAN_CONFIG.pro.maxUsers)
    expect(planFromVariant('111').maxUsers).toBe(PLAN_CONFIG.starter.maxUsers)
  })

  it('accepts a numeric variant id (the webhook sends numbers)', () => {
    expect(planFromVariant(221)).toMatchObject({ plan: 'pro', known: true })
  })

  it.each([null, undefined, '', '999999', 'not-a-variant'])(
    'falls back to the cheapest plan — never Enterprise — for %s', v => {
      const r = planFromVariant(v as any)
      expect(r.known).toBe(false)
      expect(r.plan).toBe('starter')
      expect(r.maxUsers).toBe(PLAN_CONFIG.starter.maxUsers)
      expect(r.maxUsers).toBeLessThan(PLAN_CONFIG.enterprise.maxUsers)
    })

  it('recognises variants listed as Enterprise deals', () => {
    process.env.LEMONSQUEEZY_VARIANT_ENTERPRISE = '900,901'
    expect(planFromVariant('901')).toMatchObject({ plan: 'enterprise', known: true })
  })
})

describe('subscription status', () => {
  it('keeps access until the paid period actually ends', () => {
    // Lemon Squeezy marks a subscription 'cancelled' the moment someone cancels,
    // but they keep access until 'expired'.
    expect(planStatusFromLS('cancelled')).toBe('active')
    expect(planStatusFromLS('expired')).toBe('cancelled')
  })

  it('treats live states as active and dunning as past due', () => {
    expect(planStatusFromLS('active')).toBe('active')
    expect(planStatusFromLS('on_trial')).toBe('active')
    expect(planStatusFromLS('past_due')).toBe('past_due')
  })
})
