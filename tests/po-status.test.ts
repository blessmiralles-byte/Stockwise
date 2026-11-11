import { describe, it, expect } from 'vitest'
import { poStatusMove, receiveBlock } from '@/lib/po-status'

const ALL = ['draft', 'pending_approval', 'approved', 'sent', 'partial', 'received', 'cancelled']
const ok = (from: string, to: string, approvals: boolean) => poStatusMove(from, to, approvals).ok

describe('purchase order status, with the approval workflow on', () => {
  it('lets an order be submitted, decided, and then sent', () => {
    expect(poStatusMove('draft', 'pending_approval', true)).toEqual({ ok: true, kind: 'workflow' })
    expect(poStatusMove('pending_approval', 'approved', true)).toEqual({ ok: true, kind: 'workflow' })
    expect(poStatusMove('pending_approval', 'draft', true)).toEqual({ ok: true, kind: 'workflow' })
    expect(poStatusMove('approved', 'sent', true)).toEqual({ ok: true, kind: 'plain' })
  })

  // The holes found by walking the flow: each of these used to succeed.
  it('refuses to mark a draft approved without going through approval', () => {
    const m = poStatusMove('draft', 'approved', true)
    expect(m.ok).toBe(false)
    expect(m.ok === false && m.error).toMatch(/submit/i)
  })

  it('refuses to send an order that has not been approved', () => {
    for (const from of ['draft', 'pending_approval']) {
      const m = poStatusMove(from, 'sent', true)
      expect(m.ok).toBe(false)
      expect(m.ok === false && m.error).toMatch(/must be approved/i)
    }
  })

  it('never lets a status change mark an order received or part-received', () => {
    for (const from of ALL) for (const to of ['partial', 'received']) {
      if (from === to) continue
      expect(ok(from, to, true)).toBe(false)
      expect(ok(from, to, false)).toBe(false)
    }
  })

  it('does not let an approved order slip back without a decision', () => {
    expect(ok('approved', 'draft', true)).toBe(false)
    expect(ok('approved', 'pending_approval', true)).toBe(false)
    expect(ok('sent', 'approved', true)).toBe(false)
  })
})

describe('purchase order status, without the approval workflow', () => {
  it('lets an order go straight from draft to sent', () => {
    expect(poStatusMove('draft', 'sent', false)).toEqual({ ok: true, kind: 'plain' })
  })

  it('has no approval step to move through', () => {
    expect(ok('draft', 'pending_approval', false)).toBe(false)
    expect(ok('draft', 'approved', false)).toBe(false)
  })

  // An org that downgraded mid-approval must not be left with a stuck order.
  it('frees an order stranded mid-approval by a downgrade', () => {
    expect(ok('pending_approval', 'draft', false)).toBe(true)
    expect(ok('pending_approval', 'sent', false)).toBe(true)
    expect(ok('approved', 'sent', false)).toBe(true)
  })
})

describe('cancelling', () => {
  it.each([true, false])('is allowed until goods start arriving (approvals %s)', approvals => {
    for (const from of ['draft', 'pending_approval', 'approved', 'sent']) {
      expect(ok(from, 'cancelled', approvals)).toBe(true)
    }
  })

  // Cancelling a part-received order would hide goods that did arrive.
  it.each([true, false])('is refused once goods have been received (approvals %s)', approvals => {
    expect(ok('partial', 'cancelled', approvals)).toBe(false)
    expect(ok('received', 'cancelled', approvals)).toBe(false)
  })
})

describe('finished orders', () => {
  it.each(['received', 'cancelled'])('cannot be changed once %s', from => {
    for (const to of ALL) {
      if (to === from) continue
      expect(ok(from, to, true)).toBe(false)
      expect(ok(from, to, false)).toBe(false)
    }
  })

  it('treats setting the same status as nothing to do', () => {
    for (const s of ALL) expect(ok(s, s, true)).toBe(true)
  })
})

describe('receiving goods', () => {
  it('is allowed against an order that has been placed', () => {
    for (const s of ['approved', 'sent', 'partial']) expect(receiveBlock(s)).toBe(null)
  })

  // Receiving against a draft also flipped it to "partial", skipping approval.
  it('is refused against a draft, saying what to do', () => {
    expect(receiveBlock('draft')).toMatch(/still a draft/i)
  })

  it('is refused while the order waits for approval', () => {
    expect(receiveBlock('pending_approval')).toMatch(/waiting for approval/i)
  })

  it('is refused against a finished or cancelled order', () => {
    expect(receiveBlock('received')).toMatch(/received/)
    expect(receiveBlock('cancelled')).toMatch(/cancelled/)
  })
})
