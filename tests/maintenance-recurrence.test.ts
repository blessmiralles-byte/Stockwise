import { describe, it, expect } from 'vitest'
import {
  RECURRENCE_PRESETS, isRecurrence, describeRecurrence, addInterval, nextDueDate,
} from '@/lib/maintenance-recurrence'

describe('recurrence settings', () => {
  it('accepts a positive interval with a known unit', () => {
    expect(isRecurrence(1, 'month')).toBe(true)
    expect(isRecurrence(6, 'month')).toBe(true)
  })

  it.each([
    [0, 'month'], [-1, 'month'], [1, 'fortnight'], [null, 'month'], [1, null], ['', ''], [1.5, 'month'],
  ])('rejects %s / %s', (every, unit) => {
    expect(isRecurrence(every, unit)).toBe(false)
  })

  it('offers a "does not repeat" option first', () => {
    expect(RECURRENCE_PRESETS[0].every).toBe(0)
    expect(RECURRENCE_PRESETS.slice(1).every(p => isRecurrence(p.every, p.unit))).toBe(true)
  })

  it('describes intervals in plain words', () => {
    expect(describeRecurrence(1, 'week')).toMatch(/week/i)
    expect(describeRecurrence(3, 'month')).toMatch(/3 months|quarter/i)
  })
})

describe('date arithmetic', () => {
  it('adds days, weeks, months and years', () => {
    expect(addInterval('2026-01-15', 10, 'day')).toBe('2026-01-25')
    expect(addInterval('2026-01-15', 2, 'week')).toBe('2026-01-29')
    expect(addInterval('2026-01-15', 1, 'month')).toBe('2026-02-15')
    expect(addInterval('2026-01-15', 1, 'year')).toBe('2027-01-15')
  })

  // Adding a month to the 31st must not roll into the next month.
  it('clamps to the end of a shorter month', () => {
    expect(addInterval('2026-01-31', 1, 'month')).toBe('2026-02-28')
    expect(addInterval('2026-03-31', 1, 'month')).toBe('2026-04-30')
  })

  it('handles a leap year', () => {
    expect(addInterval('2028-02-29', 1, 'year')).toBe('2029-02-28')
    expect(addInterval('2028-01-31', 1, 'month')).toBe('2028-02-29')
  })
})

describe('next occurrence after a job is done', () => {
  // Cadence is measured from the ORIGINAL due date, so finishing late doesn't
  // shift every future service later and later.
  it('steps from the scheduled date, not the completion date', () => {
    expect(nextDueDate('2026-01-15', 1, 'month', '2026-01-20')).toBe('2026-02-15')
  })

  it('skips past occurrences so a long-overdue job does not create another overdue one', () => {
    const next = nextDueDate('2026-01-15', 1, 'month', '2026-06-20')
    expect(next > '2026-06-20').toBe(true)
    expect(next).toBe('2026-07-15')
  })

  it('keeps quarterly and annual cadences on the same day of the month', () => {
    expect(nextDueDate('2026-01-10', 3, 'month', '2026-01-10')).toBe('2026-04-10')
    expect(nextDueDate('2026-01-10', 1, 'year', '2026-01-10')).toBe('2027-01-10')
  })

  it('always lands after the day the work was completed', () => {
    for (const completed of ['2026-01-15', '2026-02-01', '2027-03-09']) {
      expect(nextDueDate('2026-01-15', 1, 'month', completed) > completed).toBe(true)
    }
  })
})
