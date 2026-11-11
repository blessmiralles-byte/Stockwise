/**
 * Telling a refusal from a failure when the stock-movement function raises.
 *
 * record_inventory_movement() raises an exception both when it declines a
 * movement on purpose (not enough stock) and when something is broken. Every
 * one of those used to reach the customer as a 500 with the raw database
 * text. The deliberate ones are recognised here and given a status and
 * wording of their own; anything unrecognised stays a 500.
 */
export function movementRefusal(message: string): { status: number; error: string } | null {
  const m = message ?? ''

  let x = /Insufficient stock\. Available: (-?[\d.]+), requested: (-?[\d.]+)/i.exec(m)
  if (x) return { status: 409, error: `Not enough stock. ${num(x[1])} available, ${num(x[2])} requested.` }

  x = /Adjustment would drive stock negative\. Available: (-?[\d.]+), adjustment: (-?[\d.]+)/i.exec(m)
  if (x) return { status: 409, error: `That would take stock below zero. ${num(x[1])} available, adjustment of ${num(x[2])}.` }

  if (/Accounting period containing .* is closed/i.test(m)) {
    return { status: 409, error: 'The accounting period for today is closed, so nothing can be posted. Reopen it in Settings, or ask whoever closed it.' }
  }
  if (/Product not found or inactive/i.test(m)) return { status: 404, error: 'That item was not found, or is no longer active.' }
  if (/Location not found/i.test(m))            return { status: 404, error: 'That location was not found.' }
  if (/Source and destination must be different/i.test(m)) return { status: 422, error: 'Source and destination must be different.' }
  if (/quantity must be a positive integer|adjustment quantity cannot be zero/i.test(m)) {
    return { status: 422, error: 'Enter a quantity greater than zero.' }
  }
  return null
}

/** "109.000" → "109". */
function num(v: string): string {
  const n = Number(v)
  return Number.isFinite(n) ? String(n) : v
}
