import { describe, it, expect } from 'vitest'
import {
  normaliseCondition, daysOverdue, overdueToRemind, overdueSummary, OVERDUE_REPEAT_DAYS,
} from '@/lib/tool-returns'

const NOW = new Date('2026-11-10T09:00:00Z')
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString()

describe('the condition a tool came back in', () => {
  it('defaults to good — older clients send nothing', () => {
    expect(normaliseCondition(undefined)).toBe('good')
    expect(normaliseCondition('')).toBe('good')
    expect(normaliseCondition('whatever')).toBe('good')
  })

  it('recognises damaged however it is typed', () => {
    expect(normaliseCondition('damaged')).toBe('damaged')
    expect(normaliseCondition(' Damaged ')).toBe('damaged')
  })
})

describe('how overdue a tool is', () => {
  it('is zero with no due date or a future one', () => {
    expect(daysOverdue(null, NOW)).toBe(0)
    expect(daysOverdue(daysAgo(-2), NOW)).toBe(0)
    expect(daysOverdue('not a date', NOW)).toBe(0)
  })

  // Due at 8am, it is 9am: that is overdue today, not "0 days overdue".
  it('counts the first day as one', () => {
    expect(daysOverdue(new Date(NOW.getTime() - 3_600_000).toISOString(), NOW)).toBe(1)
  })

  it('counts whole days after that', () => {
    expect(daysOverdue(daysAgo(5), NOW)).toBe(5)
  })
})

describe('which overdue tools get a reminder today', () => {
  const co = (o: Partial<{ id: string; status: string; due_at: string | null; overdue_notified_at: string | null }>) =>
    ({ id: 'c1', status: 'out', due_at: daysAgo(2), overdue_notified_at: null, ...o })

  it('flags a tool the first time it is found overdue', () => {
    const r = overdueToRemind([co({})], NOW)
    expect(r).toHaveLength(1)
    expect(r[0].days_overdue).toBe(2)
  })

  it('leaves alone a tool that is not due yet, or has no due date', () => {
    expect(overdueToRemind([co({ due_at: daysAgo(-1) }), co({ due_at: null })], NOW)).toEqual([])
  })

  it('ignores anything not actually out', () => {
    for (const status of ['pending', 'returned', 'rejected']) {
      expect(overdueToRemind([co({ status })], NOW)).toEqual([])
    }
  })

  // The point of the table column: no daily nag.
  it('does not repeat a reminder sent yesterday', () => {
    expect(overdueToRemind([co({ overdue_notified_at: daysAgo(1) })], NOW)).toEqual([])
  })

  it('reminds again once a week has passed', () => {
    expect(overdueToRemind([co({ overdue_notified_at: daysAgo(OVERDUE_REPEAT_DAYS) })], NOW)).toHaveLength(1)
    expect(overdueToRemind([co({ overdue_notified_at: daysAgo(OVERDUE_REPEAT_DAYS - 1) })], NOW)).toEqual([])
  })

  it('puts the longest overdue first', () => {
    const r = overdueToRemind([
      co({ id: 'a', due_at: daysAgo(1) }),
      co({ id: 'b', due_at: daysAgo(9) }),
      co({ id: 'c', due_at: daysAgo(4) }),
    ], NOW)
    expect(r.map(x => x.id)).toEqual(['b', 'c', 'a'])
  })
})

describe('the summary line', () => {
  it('agrees in number', () => {
    expect(overdueSummary(1)).toBe('1 tool overdue')
    expect(overdueSummary(3)).toBe('3 tools overdue')
  })
})
