import { describe, it, expect } from 'vitest'
import {
  certificateState, assetCompliance, checkoutBlock, producesCertificate,
  isScheduleKind, daysBetween, CERT_WARNING_DAYS,
} from '@/lib/asset-compliance'

const TODAY = '2026-06-15'
const day = (offset: number) => {
  const d = new Date(Date.parse(TODAY + 'T00:00:00Z') + offset * 86_400_000)
  return d.toISOString().slice(0, 10)
}

describe('schedule kinds', () => {
  it('knows which kinds produce a certificate', () => {
    expect(producesCertificate('inspection')).toBe(true)
    expect(producesCertificate('calibration')).toBe(true)
    expect(producesCertificate('maintenance')).toBe(false)
    expect(producesCertificate(null)).toBe(false)
  })

  it.each(['maintenance', 'inspection', 'calibration'])('accepts %s', k => expect(isScheduleKind(k)).toBe(true))
  it.each(['service', '', null, undefined, 'INSPECTION'])('rejects %s', k => expect(isScheduleKind(k)).toBe(false))
})

describe('certificate state', () => {
  it('is valid well before expiry', () => {
    expect(certificateState(day(90), TODAY)).toBe('valid')
  })

  it('warns inside the warning window', () => {
    expect(certificateState(day(CERT_WARNING_DAYS), TODAY)).toBe('expiring')
    expect(certificateState(day(1), TODAY)).toBe('expiring')
  })

  // A certificate "valid until the 15th" is still valid on the 15th.
  it('is valid on its last day, expired the day after', () => {
    expect(certificateState(TODAY, TODAY)).toBe('expiring')
    expect(certificateState(day(-1), TODAY)).toBe('expired')
  })

  it('reports none when the tool has no certificate', () => {
    expect(certificateState(null, TODAY)).toBe('none')
    expect(certificateState(undefined, TODAY)).toBe('none')
  })

  it('counts whole days between dates', () => {
    expect(daysBetween(TODAY, day(5))).toBe(5)
    expect(daysBetween(day(5), TODAY)).toBe(-5)
    expect(daysBetween(TODAY, TODAY)).toBe(0)
  })
})

describe('a tool’s compliance', () => {
  it('is clear when there is nothing to check', () => {
    expect(assetCompliance([], TODAY)).toMatchObject({
      overdue: false, expired: false, expiringSoon: false, nextDue: null, needsAttention: false,
    })
  })

  it('ignores plain maintenance — that has its own alerts', () => {
    const c = assetCompliance([{ kind: 'maintenance', status: 'scheduled', scheduled_date: day(-30) }], TODAY)
    expect(c.overdue).toBe(false)
    expect(c.needsAttention).toBe(false)
  })

  it('flags an overdue inspection', () => {
    const c = assetCompliance([{ kind: 'inspection', status: 'scheduled', scheduled_date: day(-1) }], TODAY)
    expect(c.overdue).toBe(true)
    expect(c.needsAttention).toBe(true)
  })

  it('does not flag a completed check', () => {
    const c = assetCompliance([{ kind: 'inspection', status: 'completed', scheduled_date: day(-40) }], TODAY)
    expect(c.overdue).toBe(false)
  })

  it('reports the soonest upcoming date', () => {
    const c = assetCompliance([
      { kind: 'inspection',  status: 'scheduled', scheduled_date: day(40) },
      { kind: 'calibration', status: 'scheduled', scheduled_date: day(10) },
    ], TODAY)
    expect(c.nextDue).toBe(day(10))
    expect(c.overdue).toBe(false)
  })

  it('uses the latest certificate when a tool has several', () => {
    const c = assetCompliance([
      { kind: 'inspection',  status: 'completed', certified_until: day(-5) },
      { kind: 'calibration', status: 'completed', certified_until: day(200) },
    ], TODAY)
    expect(c.certifiedUntil).toBe(day(200))
    expect(c.expired).toBe(false)
  })

  it('flags an expired certificate even when nothing is scheduled', () => {
    const c = assetCompliance([{ kind: 'inspection', status: 'completed', certified_until: day(-1) }], TODAY)
    expect(c.expired).toBe(true)
    expect(c.needsAttention).toBe(true)
  })

  it('flags one expiring soon without calling it a blocker', () => {
    const c = assetCompliance([{ kind: 'inspection', status: 'completed', certified_until: day(10) }], TODAY)
    expect(c.expiringSoon).toBe(true)
    expect(c.needsAttention).toBe(false)
  })
})

describe('check-out guard', () => {
  const overdue  = assetCompliance([{ kind: 'inspection', status: 'scheduled', scheduled_date: day(-2) }], TODAY)
  const expired  = assetCompliance([{ kind: 'calibration', status: 'completed', certified_until: day(-2) }], TODAY)
  const healthy  = assetCompliance([{ kind: 'inspection', status: 'scheduled', scheduled_date: day(20) }], TODAY)

  it('lets compliant kit out without comment', () => {
    expect(checkoutBlock(healthy, { blockWhenOverdue: true })).toEqual({ blocked: false, reason: null })
  })

  // Default is a warning: sites that must refuse uncertified kit opt in.
  it('warns but allows when the setting is off', () => {
    const r = checkoutBlock(overdue, { blockWhenOverdue: false })
    expect(r.blocked).toBe(false)
    expect(r.reason).toMatch(/overdue/i)
  })

  it('refuses when the setting is on', () => {
    expect(checkoutBlock(overdue, { blockWhenOverdue: true }).blocked).toBe(true)
    expect(checkoutBlock(expired, { blockWhenOverdue: true }).blocked).toBe(true)
  })

  it('says which problem it is', () => {
    expect(checkoutBlock(overdue, { blockWhenOverdue: true }).reason).toMatch(/inspection is overdue/i)
    expect(checkoutBlock(expired, { blockWhenOverdue: true }).reason).toMatch(/certificate has expired/i)
  })

  it('treats a missing setting as off', () => {
    expect(checkoutBlock(overdue).blocked).toBe(false)
  })
})
