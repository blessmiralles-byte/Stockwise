import { describe, it, expect } from 'vitest'
import { canMove, movementDenied, isReadOnly, can, canSeePage } from '@/lib/permissions'

const ROLES = ['owner', 'procurement', 'operations', 'receiver', 'finance', 'viewer'] as const
const who = (fn: (r: string) => boolean) => ROLES.filter(r => fn(r))

describe('who may move stock', () => {
  it('lets the field officer issue, transfer and return', () => {
    for (const t of ['consumption', 'transfer', 'return', 'vendor_return']) {
      expect(who(r => canMove(r, t))).toEqual(['owner', 'procurement', 'operations', 'receiver'])
    }
  })

  it('keeps the buyer from receiving without an order', () => {
    expect(who(r => canMove(r, 'purchase'))).toEqual(['owner', 'operations', 'receiver'])
  })

  it('leaves adjustments to operations and the owner', () => {
    expect(who(r => canMove(r, 'adjustment'))).toEqual(['owner', 'operations'])
  })

  it('never lets finance or a viewer move stock', () => {
    for (const t of ['purchase', 'consumption', 'sale', 'transfer', 'adjustment', 'return', 'vendor_return']) {
      expect(canMove('finance', t)).toBe(false)
      expect(canMove('viewer', t)).toBe(false)
    }
  })

  it('treats legacy role names as their current ones', () => {
    expect(canMove('admin', 'adjustment')).toBe(true)
    expect(canMove('manager', 'adjustment')).toBe(true)
  })

  it('refuses an unknown movement type, and an unknown role', () => {
    expect(canMove('owner', 'teleport')).toBe(false)
    expect(canMove(null, 'consumption')).toBe(false)
  })

  it('says who can, in plain words', () => {
    expect(movementDenied('procurement', 'adjustment')).toMatch(/can't adjust stock.*Operations/)
    expect(movementDenied('operations', 'adjustment')).toBe(null)
  })
})

describe('everything else', () => {
  it('makes only the viewer read-only', () => {
    expect(who(isReadOnly)).toEqual(['viewer'])
  })
  it('lets counters count, and managers cancel', () => {
    expect(who(can.countEntry)).toEqual(['owner', 'procurement', 'operations', 'receiver'])
    expect(who(can.countManage)).toEqual(['owner', 'procurement', 'operations'])
  })
  it('lets finance record a vendor invoice', () => {
    expect(who(can.recordInvoice)).toEqual(['owner', 'procurement', 'finance'])
  })
  it('keeps the vendor list with purchasing, operations and finance', () => {
    expect(who(can.editVendors)).toEqual(['owner', 'procurement', 'operations', 'finance'])
  })
})

describe('what each role sees', () => {
  it('shows the audit log to the owner and finance only', () => {
    expect(who(r => canSeePage(r, '/audit-log'))).toEqual(['owner', 'finance'])
  })
  it('shows unrestricted pages to everyone', () => {
    expect(who(r => canSeePage(r, '/inventory'))).toEqual([...ROLES])
  })
  it('hides financial reports from roles the report refuses', () => {
    expect(who(r => canSeePage(r, '/reports/valuation'))).toEqual(['owner', 'finance'])
    expect(canSeePage('viewer', '/reports/open-pos?x=1')).toBe(false)
  })
})
