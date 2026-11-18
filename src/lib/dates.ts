/**
 * Calendar days in the customer's time, not UTC.
 *
 * `new Date().toISOString().slice(0, 10)` is the date in London. At 01:00 in
 * Manila that is still yesterday, so forms defaulted to the wrong day and
 * reports cut days at 08:00 local time. Use these instead:
 *
 *   Browser (forms, report pickers):  localToday(), localDay(date)
 *   Server (API routes):              todayInZone(tz), dayRangeInZone(from, to, tz)
 *                                     with tz from getOrgTimeZone() (org-timezone.ts)
 *
 * Pure date arithmetic on 'YYYY-MM-DD' strings (addDays, recurrence,
 * depreciation) is time-zone free and may keep using UTC internally.
 * Safe to import from client and server code.
 */

export const DEFAULT_TIME_ZONE = 'UTC'

const pad = (n: number) => String(n).padStart(2, '0')

/** 'YYYY-MM-DD' of a Date in the device's own time zone. */
export function localDay(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Today's date on this device, 'YYYY-MM-DD'. Use for form defaults in the browser. */
export function localToday(): string {
  return localDay(new Date())
}

/** The device's IANA time zone, e.g. 'Asia/Manila' (undefined if the browser won't say). */
export function deviceTimeZone(): string | undefined {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined } catch { return undefined }
}

/** True for a time zone name this runtime understands ('Asia/Manila', 'UTC'). */
export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !tz || tz.length > 64) return false
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true } catch { return false }
}

const fmtCache = new Map<string, Intl.DateTimeFormat>()
function partsFormatter(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
    fmtCache.set(tz, f)
  }
  return f
}
function zonedParts(d: Date, tz: string) {
  const p: Record<string, number> = {}
  for (const { type, value } of partsFormatter(tz).formatToParts(d)) {
    if (type !== 'literal') p[type] = Number(value)
  }
  return p as { year: number; month: number; day: number; hour: number; minute: number; second: number }
}
const safeZone = (tz: string | null | undefined) => (isValidTimeZone(tz) ? tz : DEFAULT_TIME_ZONE)

/** 'YYYY-MM-DD' of an instant as seen in `tz`. */
export function dayInZone(d: Date | string | number, tz: string | null | undefined): string {
  const p = zonedParts(new Date(d), safeZone(tz))
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`
}

/** Today's date in `tz`, 'YYYY-MM-DD'. Use on the server with the organization's time zone. */
export function todayInZone(tz: string | null | undefined, now: Date = new Date()): string {
  return dayInZone(now, tz)
}

/** Add whole days to a 'YYYY-MM-DD' date (no time zone involved). */
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

/** Whole calendar days from `from` to `to` (both 'YYYY-MM-DD'); negative when `to` is earlier. */
export function daysBetweenDays(from: string, to: string): number {
  return Math.round((Date.parse(to.slice(0, 10) + 'T00:00:00Z') - Date.parse(from.slice(0, 10) + 'T00:00:00Z')) / 86_400_000)
}

/**
 * Days from today ON THIS DEVICE to a stored date: 0 = today, 1 = tomorrow,
 * -2 = two days ago. For "due in N days" labels in the browser.
 */
export function daysFromLocalToday(day: string): number {
  return daysBetweenDays(localToday(), day)
}

/** Milliseconds `tz` is ahead of UTC at instant `at` (Manila: +8h). */
function offsetMs(tz: string, at: number): number {
  const p = zonedParts(new Date(at), tz)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return asUtc - Math.floor(at / 1000) * 1000
}

/** The UTC instant at which calendar day `day` begins in `tz`. */
export function startOfDayInZone(day: string, tz: string | null | undefined): Date {
  const zone = safeZone(tz)
  const [y, m, d] = day.split('-').map(Number)
  const guess = Date.UTC(y, m - 1, d)
  // Two passes settle the offset even when the day starts next to a DST change.
  let t = guess - offsetMs(zone, guess)
  t = guess - offsetMs(zone, t)
  return new Date(t)
}

/**
 * Timestamps bounding the days `from`..`to` (inclusive) in `tz`, for
 * `.gte('created_at', fromTs).lte('created_at', toTs)`.
 */
export function dayRangeInZone(from: string, to: string, tz: string | null | undefined): { fromTs: string; toTs: string } {
  return {
    fromTs: startOfDayInZone(from, tz).toISOString(),
    toTs:   new Date(startOfDayInZone(addDays(to, 1), tz).getTime() - 1).toISOString(),
  }
}

/** 'YYYY-MM-DD' check. */
export const isIsoDay = (v: unknown): v is string =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v + 'T00:00:00Z'))
