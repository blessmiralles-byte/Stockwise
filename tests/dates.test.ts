import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import {
  todayInZone, dayInZone, dayRangeInZone, startOfDayInZone, addDays, localDay, isValidTimeZone, isIsoDay,
} from '../src/lib/dates'

describe('days in the customer’s time zone', () => {
  // 2026-11-17 17:30 UTC = 2026-11-18 01:30 in Manila (the bug seen live)
  const earlyManila = new Date('2026-11-17T17:30:00Z')

  it('today in Manila is already the next day at 01:30 local', () => {
    expect(todayInZone('Asia/Manila', earlyManila)).toBe('2026-11-18')
    expect(todayInZone('UTC', earlyManila)).toBe('2026-11-17')
    expect(todayInZone('America/New_York', earlyManila)).toBe('2026-11-17')
  })

  it('falls back to UTC for a missing or unknown zone', () => {
    expect(todayInZone(null, earlyManila)).toBe('2026-11-17')
    expect(todayInZone('Not/AZone', earlyManila)).toBe('2026-11-17')
  })

  it('a Manila day runs 16:00 UTC the day before to 15:59:59.999 UTC', () => {
    expect(dayRangeInZone('2026-11-18', '2026-11-18', 'Asia/Manila')).toEqual({
      fromTs: '2026-11-17T16:00:00.000Z',
      toTs:   '2026-11-18T15:59:59.999Z',
    })
  })

  it('a UTC range is unchanged from the old behaviour', () => {
    expect(dayRangeInZone('2026-11-01', '2026-11-30', 'UTC')).toEqual({
      fromTs: '2026-11-01T00:00:00.000Z',
      toTs:   '2026-11-30T23:59:59.999Z',
    })
  })

  it('handles daylight-saving changes (New York, 2026-03-08 is 23 hours long)', () => {
    expect(startOfDayInZone('2026-03-08', 'America/New_York').toISOString()).toBe('2026-03-08T05:00:00.000Z')
    expect(startOfDayInZone('2026-03-09', 'America/New_York').toISOString()).toBe('2026-03-09T04:00:00.000Z')
    expect(dayInZone('2026-03-09T03:59:59Z', 'America/New_York')).toBe('2026-03-08')
  })

  it('date arithmetic and checks', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(localDay(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
    expect(isValidTimeZone('Asia/Manila')).toBe(true)
    expect(isValidTimeZone('Mars/Base')).toBe(false)
    expect(isIsoDay('2026-11-18')).toBe(true)
    expect(isIsoDay('18/11/2026')).toBe(false)
  })
})

// The bug pattern must not come back: "today" built from toISOString() is the
// date in UTC, not the customer's. Pure date arithmetic files are allowed.
describe('no UTC "today" in app code', () => {
  const ALLOWED = new Set([
    'lib/dates.ts',
    'lib/depreciation.ts',            // date-only arithmetic on stored dates
    'lib/maintenance-recurrence.ts',  // date-only arithmetic on stored dates
    'lib/forecast.ts',                // date-only arithmetic on stored dates
  ])
  const files: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) walk(p)
      else if (/\.(ts|tsx)$/.test(name)) files.push(p)
    }
  }
  walk(join(__dirname, '..', 'src'))

  it('every file uses lib/dates for calendar days', () => {
    const bad = files
      .map(f => [f.replace(/\\/g, '/').split('/src/')[1], readFileSync(f, 'utf8')] as const)
      .filter(([rel]) => !ALLOWED.has(rel))
      .filter(([, src]) => /toISOString\(\)\s*\.\s*(split\(\s*['"]T['"]\s*\)\s*\[0\]|slice\(\s*0\s*,\s*10\s*\)|substring\(\s*0\s*,\s*10\s*\))/.test(src))
      .map(([rel]) => rel)
    expect(bad).toEqual([])
  })
})
