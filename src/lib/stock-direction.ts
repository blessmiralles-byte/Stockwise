/**
 * What each kind of stock movement does — one place, so the ledger, the
 * valuation and the job cost reports cannot disagree about it.
 *
 *   purchase        stock in    counts as purchases
 *   vendor_return   stock out   reduces purchases (goods sent back to the vendor)
 *   consumption     stock out   counts as issues
 *   sale            stock out   counts as issues
 *   return          stock in    reduces issues (unused material back from a job)
 *   adjustment      either way  by the sign of its quantity
 *   transfer        neither     moves stock between locations, total unchanged
 */

export const JOB_RETURN = 'return'
export const VENDOR_RETURN = 'vendor_return'

/** The movement types that carry a job's material cost: issues add, returns take away. */
export const JOB_COST_TYPES = ['consumption', 'sale', JOB_RETURN]

export type Bucket = 'purchases' | 'issues' | 'adjustments' | 'none'

export interface MovementEffect {
  /** Effect on total stock on hand: +1 in, -1 out, 0 none. */
  stock: 1 | -1 | 0
  /** The valuation column the movement belongs to. */
  bucket: Bucket
  /** +1 adds to that column, -1 takes away from it. */
  sign: 1 | -1
}

export function movementEffect(type: string, quantity: number): MovementEffect {
  switch (type) {
    case 'purchase':      return { stock: 1,  bucket: 'purchases', sign: 1 }
    case VENDOR_RETURN:   return { stock: -1, bucket: 'purchases', sign: -1 }
    case 'consumption':
    case 'sale':          return { stock: -1, bucket: 'issues', sign: 1 }
    case JOB_RETURN:      return { stock: 1,  bucket: 'issues', sign: -1 }
    case 'adjustment':    return Number(quantity) >= 0
      ? { stock: 1,  bucket: 'adjustments', sign: 1 }
      : { stock: -1, bucket: 'adjustments', sign: -1 }
    default:              return { stock: 0, bucket: 'none', sign: 1 }
  }
}

/** A job's cost from one movement: positive for an issue, negative for a return. */
export function jobCostOf(tx: { transaction_type: string; quantity: unknown; unit_cost?: unknown; total_cost?: unknown }): number {
  const size = Math.abs(Number(tx.total_cost ?? (Number(tx.quantity) * Number(tx.unit_cost ?? 0)))) || 0
  return tx.transaction_type === JOB_RETURN ? -size : size
}

/** Quantity used by a job from one movement: negative for a return. */
export function jobQtyOf(tx: { transaction_type: string; quantity: unknown }): number {
  const q = Math.abs(Number(tx.quantity)) || 0
  return tx.transaction_type === JOB_RETURN ? -q : q
}

export const MOVEMENT_LABELS: Record<string, string> = {
  purchase: 'Purchase',
  transfer: 'Transfer',
  sale: 'Sale',
  consumption: 'Consumption',
  adjustment: 'Adjustment',
  [JOB_RETURN]: 'Return from job',
  [VENDOR_RETURN]: 'Return to vendor',
}
