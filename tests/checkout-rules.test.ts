import { describe, it, expect } from 'vitest'
import {
  canIssueToOthers, assetValue, resolveHolder, approvalNeeded,
} from '@/lib/checkout-rules'

const crew   = { role: 'viewer',     name: 'Sam Rivera', personId: 'p-sam' }
const store  = { role: 'receiver',   name: 'Dana Cruz',  personId: 'p-dana' }
const boss   = { role: 'operations', name: 'Mia Chen',   personId: 'p-mia' }
const RESTRICT = { restrictToSelf: true }

describe('who may hand a tool to someone else', () => {
  it.each(['owner', 'admin', 'operations', 'manager', 'procurement', 'receiver'])(
    'allows %s — handing out kit is part of the job', role => {
      expect(canIssueToOthers(role)).toBe(true)
    })

  it.each(['viewer', 'finance', '', null, undefined])('does not allow %s', role => {
    expect(canIssueToOthers(role as any)).toBe(false)
  })
})

describe('settling who holds the tool', () => {
  it('treats an empty name as taking it yourself', () => {
    const r = resolveHolder({}, crew, RESTRICT)
    expect(r).toMatchObject({ error: null, holderName: 'Sam Rivera', isSelf: true })
  })

  it('lets anyone take a tool for themselves, however locked down', () => {
    const r = resolveHolder({ holderName: 'Sam Rivera' }, crew, RESTRICT)
    expect(r.error).toBe(null)
    expect(r.isSelf).toBe(true)
  })

  it('recognises your own name whatever the capitals', () => {
    expect(resolveHolder({ holderName: 'sam rivera' }, crew, RESTRICT).error).toBe(null)
  })

  it('recognises yourself by person id too', () => {
    const r = resolveHolder({ holderName: 'S. Rivera', holderPersonId: 'p-sam' }, crew, RESTRICT)
    expect(r.error).toBe(null)
    expect(r.isSelf).toBe(true)
  })

  // The control itself.
  it('stops a crew member signing a tool out to somebody else', () => {
    const r = resolveHolder({ holderName: 'The new guy' }, crew, RESTRICT)
    expect(r.error).toMatch(/only check tools out to yourself/i)
    expect(r.error).toMatch(/supervisor|storekeeper/i)
  })

  it('lets the storekeeper and the supervisor issue to anyone', () => {
    expect(resolveHolder({ holderName: 'Sam Rivera' }, store, RESTRICT).error).toBe(null)
    expect(resolveHolder({ holderName: 'Sam Rivera' }, boss, RESTRICT).error).toBe(null)
  })

  it('leaves everyone alone when the restriction is off', () => {
    const r = resolveHolder({ holderName: 'Anyone at all' }, crew, { restrictToSelf: false })
    expect(r.error).toBe(null)
    expect(r.isSelf).toBe(false)
  })

  it('still needs a name when the actor has none recorded', () => {
    const r = resolveHolder({}, { role: 'viewer', name: '', personId: null }, RESTRICT)
    expect(r.error).toMatch(/need a name/i)
  })

  it('keeps the person id with the name it was given', () => {
    const r = resolveHolder({ holderName: 'Sam Rivera', holderPersonId: 'p-sam' }, store, RESTRICT)
    expect(r.holderPersonId).toBe('p-sam')
  })
})

describe('what a tool is worth', () => {
  it('prefers book value over original cost', () => {
    expect(assetValue({ current_value: 300, purchase_cost: 1000 })).toBe(300)
  })

  it('falls back to cost when there is no book value', () => {
    expect(assetValue({ current_value: null, purchase_cost: 1000 })).toBe(1000)
    expect(assetValue({ current_value: 0, purchase_cost: 1000 })).toBe(1000)
  })

  it('is zero when we know neither', () => {
    expect(assetValue({})).toBe(0)
  })
})

describe('when a check-out needs approving', () => {
  const on = { approvalsEnabled: true }

  it('respects the tool’s own flag', () => {
    const d = approvalNeeded({ requires_checkout_approval: true }, on)
    expect(d.required).toBe(true)
    expect(d.reason).toMatch(/set to need approval/i)
  })

  // The point of a threshold: nobody has to remember to tick the box.
  it('catches an expensive tool nobody flagged', () => {
    const d = approvalNeeded({ current_value: 4000 }, { ...on, approvalOver: 1000 })
    expect(d.required).toBe(true)
    expect(d.reason).toMatch(/above the value/i)
  })

  it('lets a cheap tool straight out', () => {
    expect(approvalNeeded({ current_value: 120 }, { ...on, approvalOver: 1000 }).required).toBe(false)
  })

  it('treats the threshold as "more than", not "at"', () => {
    expect(approvalNeeded({ current_value: 1000 }, { ...on, approvalOver: 1000 }).required).toBe(false)
    expect(approvalNeeded({ current_value: 1000.01 }, { ...on, approvalOver: 1000 }).required).toBe(true)
  })

  it('ignores a threshold that is unset or zero', () => {
    expect(approvalNeeded({ current_value: 9999 }, on).required).toBe(false)
    expect(approvalNeeded({ current_value: 9999 }, { ...on, approvalOver: 0 }).required).toBe(false)
  })

  // Approvals are a Pro feature: on Starter nobody could act on the request.
  it('asks for nothing when approvals are not available', () => {
    expect(approvalNeeded({ requires_checkout_approval: true }, { approvalsEnabled: false }).required).toBe(false)
    expect(approvalNeeded({ current_value: 9999 }, { approvalsEnabled: false, approvalOver: 10 }).required).toBe(false)
  })

  it('uses book value, so a depreciated tool can drop below the line', () => {
    const d = approvalNeeded({ current_value: 400, purchase_cost: 5000 }, { ...on, approvalOver: 1000 })
    expect(d.required).toBe(false)
  })
})
