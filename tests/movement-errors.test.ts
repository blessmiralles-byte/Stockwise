import { describe, it, expect } from 'vitest'
import { movementRefusal } from '@/lib/movement-errors'

describe('telling a refusal from a failure', () => {
  it('reads "not enough stock" as a refusal, in plain words', () => {
    expect(movementRefusal('Insufficient stock. Available: 109, requested: 5000'))
      .toEqual({ status: 409, error: 'Not enough stock. 109 available, 5000 requested.' })
  })

  it('tidies the trailing zeros the database prints', () => {
    expect(movementRefusal('Insufficient stock. Available: 0.000, requested: 1')?.error)
      .toBe('Not enough stock. 0 available, 1 requested.')
  })

  it('reads an adjustment below zero as a refusal', () => {
    const r = movementRefusal('Adjustment would drive stock negative. Available: 109, adjustment: -9999')
    expect(r?.status).toBe(409)
    expect(r?.error).toMatch(/below zero/)
  })

  it('explains a closed period', () => {
    const r = movementRefusal('Accounting period containing 2026-11-11 is closed. No transactions may be posted.')
    expect(r?.status).toBe(409)
    expect(r?.error).toMatch(/period .* is closed/i)
  })

  it('answers "not found" for an item or location that is not theirs', () => {
    expect(movementRefusal('Product not found or inactive: 69ccfac1')?.status).toBe(404)
    expect(movementRefusal('Location not found: bc4dc8ac')?.status).toBe(404)
  })

  // The bug that started this: it must stay a failure, and not leak its text.
  it('leaves a genuine database fault as a failure', () => {
    expect(movementRefusal('record "v_balance" has no field "avg_cost"')).toBe(null)
    expect(movementRefusal('')).toBe(null)
  })
})
