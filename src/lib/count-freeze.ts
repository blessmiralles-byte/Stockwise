/**
 * No stock moves at a location while it is being counted.
 *
 * A count takes a snapshot of what the system says is on the shelf when it
 * starts (system_qty), people count what is really there, and approval posts
 * the difference as an adjustment. If an issue or a delivery lands at that
 * location in between, the snapshot is stale: the shelf and the system both
 * moved, the count still compares against the old figure, and approval posts
 * an adjustment for a "variance" that was really the movement — so the stock
 * is wrong by exactly that amount, and nobody is told.
 *
 * So, as warehouses do, a location is frozen from the moment a count starts
 * until it is approved or cancelled. The count's own adjustments are posted by
 * the approval itself and are not affected.
 *
 * Pure: the routes look up the open counts.
 */

/** A count in any of these states holds its location. */
export const OPEN_COUNT_STATUSES = ['open', 'counting', 'reviewing'] as const

export interface OpenCount {
  location_id: string
  count_number: string
  location_name?: string | null
}

/** The open count holding any of these locations, or null if none. */
export function frozenBy(open: OpenCount[], locationIds: (string | null | undefined)[]): OpenCount | null {
  const ids = new Set(locationIds.filter((x): x is string => !!x))
  if (ids.size === 0) return null
  return open.find(c => ids.has(c.location_id)) ?? null
}

export function freezeMessage(c: OpenCount): string {
  const where = c.location_name ? c.location_name : 'This location'
  return `${where} is being counted (${c.count_number}). Stock there can't move until the count is approved or cancelled.`
}
