/**
 * Recurring (preventive) maintenance scheduling.
 *
 * A schedule repeats every `recurrence_every` `recurrence_unit`s. When an
 * occurrence is completed the API creates the next one from these rules.
 */

export type RecurrenceUnit = 'day' | 'week' | 'month' | 'year'
export const RECURRENCE_UNITS: RecurrenceUnit[] = ['day', 'week', 'month', 'year']

export interface Recurrence {
  every: number
  unit:  RecurrenceUnit
}

/** Presets offered in the UI; `every: 0` means "does not repeat". */
export const RECURRENCE_PRESETS: { label: string; every: number; unit: RecurrenceUnit | '' }[] = [
  { label: 'Does not repeat', every: 0, unit: ''      },
  { label: 'Weekly',          every: 1, unit: 'week'  },
  { label: 'Monthly',         every: 1, unit: 'month' },
  { label: 'Quarterly',       every: 3, unit: 'month' },
  { label: 'Every 6 months',  every: 6, unit: 'month' },
  { label: 'Annually',        every: 1, unit: 'year'  },
]

export function isRecurrence(every: any, unit: any): boolean {
  return Number(every) > 0 && RECURRENCE_UNITS.includes(unit)
}

/** Human label, e.g. "Every 3 months". */
export function describeRecurrence(every: number, unit: RecurrenceUnit): string {
  if (!isRecurrence(every, unit)) return 'Does not repeat'
  const plural = every === 1 ? unit : `${unit}s`
  return every === 1 ? `Every ${unit}` : `Every ${every} ${plural}`
}

/**
 * Add an interval to a YYYY-MM-DD date, in UTC so the result never shifts a day
 * from the caller's timezone.
 *
 * Month/year steps clamp to the end of a short month: 31 Jan + 1 month = 28 Feb,
 * not 3 Mar. Without clamping, a monthly schedule starting on the 31st would
 * silently walk forward through the calendar.
 */
export function addInterval(date: string, every: number, unit: RecurrenceUnit): string {
  const [y, m, d] = date.slice(0, 10).split('-').map(Number)

  if (unit === 'day' || unit === 'week') {
    const days = unit === 'week' ? every * 7 : every
    const dt = new Date(Date.UTC(y, m - 1, d))
    dt.setUTCDate(dt.getUTCDate() + days)
    return dt.toISOString().slice(0, 10)
  }

  const monthsToAdd = unit === 'year' ? every * 12 : every
  const target      = (m - 1) + monthsToAdd
  const year        = y + Math.floor(target / 12)
  const month       = ((target % 12) + 12) % 12
  // Day 0 of the following month = last day of this one.
  const lastDay     = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const day         = Math.min(d, lastDay)
  return new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10)
}

/**
 * Due date for the occurrence after `scheduledDate`.
 *
 * Steps from the ORIGINAL scheduled date so a fixed cadence doesn't drift when
 * work is done late. If completion was late enough that the next date is already
 * past, keep stepping — otherwise finishing a long-overdue job would immediately
 * create another overdue one.
 */
export function nextDueDate(
  scheduledDate: string,
  every: number,
  unit: RecurrenceUnit,
  completedDate?: string,
): string {
  const floor = (completedDate ?? new Date().toISOString()).slice(0, 10)
  let next = addInterval(scheduledDate, every, unit)
  // Bounded so a badly stale date can't spin (e.g. daily cadence years behind).
  for (let i = 0; i < 500 && next <= floor; i++) {
    next = addInterval(next, every, unit)
  }
  return next
}
