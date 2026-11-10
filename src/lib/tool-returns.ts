/**
 * Tools coming back — or not coming back.
 *
 * Two rules live here, both pure:
 *
 *   1. What state a tool was in when it was returned. "Good" is the default
 *      and costs the person nothing; "damaged" takes the tool off the road
 *      and tells the owner, at the one moment somebody is actually holding it
 *      and knows.
 *   2. Which overdue tools are worth a reminder today. A due date nobody is
 *      reminded about is decoration, but a daily nag gets filtered to spam —
 *      so a tool is flagged the day it goes overdue and then once a week
 *      while it stays out.
 */

export const RETURN_CONDITIONS = ['good', 'damaged'] as const
export type ReturnCondition = typeof RETURN_CONDITIONS[number]

/** Anything unrecognised is "good": the field is optional and old clients omit it. */
export function normaliseCondition(v: unknown): ReturnCondition {
  return String(v ?? '').trim().toLowerCase() === 'damaged' ? 'damaged' : 'good'
}

/** Days between a reminder and the next one for the same tool. */
export const OVERDUE_REPEAT_DAYS = 7

const DAY_MS = 86_400_000

/** Whole days past due; 0 when not overdue (or no due date). */
export function daysOverdue(dueAt: string | null | undefined, now: Date): number {
  if (!dueAt) return 0
  const due = new Date(dueAt).getTime()
  if (!Number.isFinite(due)) return 0
  const diff = now.getTime() - due
  return diff <= 0 ? 0 : Math.max(1, Math.floor(diff / DAY_MS))
}

export interface OutCheckout {
  id: string
  status: string
  due_at?: string | null
  overdue_notified_at?: string | null
}

/**
 * The checkouts to remind about now: out, past due, and either never flagged
 * or last flagged at least a week ago.
 */
export function overdueToRemind<T extends OutCheckout>(
  checkouts: T[],
  now: Date,
  repeatDays: number = OVERDUE_REPEAT_DAYS,
): (T & { days_overdue: number })[] {
  const out: (T & { days_overdue: number })[] = []
  for (const c of checkouts) {
    if (c.status !== 'out') continue
    const days = daysOverdue(c.due_at, now)
    if (days === 0) continue

    if (c.overdue_notified_at) {
      const last = new Date(c.overdue_notified_at).getTime()
      if (Number.isFinite(last) && now.getTime() - last < repeatDays * DAY_MS) continue
    }
    out.push({ ...c, days_overdue: days })
  }
  // Longest overdue first — that's the one to chase.
  return out.sort((a, b) => b.days_overdue - a.days_overdue)
}

/** "3 tools overdue" / "1 tool overdue". */
export function overdueSummary(count: number): string {
  return `${count} tool${count === 1 ? '' : 's'} overdue`
}
