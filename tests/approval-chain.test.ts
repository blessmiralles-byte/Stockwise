import { describe, it, expect, beforeEach, vi } from 'vitest'
import { fakeSupabase } from './helpers/fake-supabase'

// The chain's side effects (notifications, audit rows) write through their own
// service client; the routing rules are what we're testing here.
const notifications: any[] = []
vi.mock('@/lib/notify', () => ({
  createNotification: async (n: any) => { notifications.push(n) },
}))
vi.mock('@/lib/audit', () => ({ logAudit: async () => {} }))

const {
  startChain, actOnChain, cancelChain, handOverApprovals, loadTrails, myAction, coversAmount,
} = await import('@/lib/approval-chain')

/**
 * Bob (buyer) → Maria (procurement manager, $5k) → Ben (director, $20k) → Olivia (owner).
 * Sam and "No Manager" cover the staff and no-reporting-line cases.
 */
const ORG = [
  { id: 'owner', full_name: 'Olivia Owner',  role: 'owner',       reports_to: null,    created_at: '1' },
  { id: 'ben',   full_name: 'Ben Director',  role: 'operations',  reports_to: 'owner', created_at: '2', po_approval_limit: 20000, requisition_approval_limit: 20000 },
  { id: 'maria', full_name: 'Maria PM',      role: 'procurement', reports_to: 'ben',   created_at: '3', job_title: 'Procurement Manager', po_approval_limit: 5000, requisition_approval_limit: 5000 },
  { id: 'bob',   full_name: 'Bob Buyer',     role: 'procurement', reports_to: 'maria', created_at: '4', job_title: 'Buyer', po_approval_limit: null },
  { id: 'sam',   full_name: 'Sam Staff',     role: 'receiver',    reports_to: 'maria', created_at: '5' },
  { id: 'solo',  full_name: 'No Manager',    role: 'receiver',    reports_to: null,    created_at: '6' },
].map(p => ({ org_id: 'o1', is_active: true, ...p }))

const PO = { orgId: 'o1', docType: 'purchase_order' as const, docId: 'po1', ref: 'PO-1' }

let sb: any
function setup(people = ORG) {
  sb = fakeSupabase({
    user_profiles:   people.map(p => ({ ...p })),
    approval_steps:  [],
    purchase_orders: [{ id: 'po1', po_number: 'PO-1', submitted_by: 'bob' }],
    requisitions:    [{ id: 'r1', req_number: 'REQ-1', requested_by: 'sam' }],
  })
}
const act = (actorId: string, action: 'approve' | 'reject', amount: number, submitterId = 'bob') => {
  const role = sb._db.user_profiles.find((p: any) => p.id === actorId).role
  return actOnChain(sb, { ...PO, submitterId, amount, actorId, actorRole: role, action })
}
const trail = () => sb._db.approval_steps.map((s: any) => `${s.approver_id}:${s.status}`).join(' → ')

beforeEach(() => { setup(); notifications.length = 0 })

describe('approval routing', () => {
  it('always goes to the direct manager first', async () => {
    const r = await startChain(sb, { ...PO, submitterId: 'bob', amount: 3000 })
    expect(r).toMatchObject({ outcome: 'pending', approver: { id: 'maria' } })
    expect(notifications.at(-1).userId).toBe('maria')
  })

  it('is final when the manager’s limit covers it', async () => {
    await startChain(sb, { ...PO, submitterId: 'bob', amount: 3000 })
    expect(await act('maria', 'approve', 3000)).toMatchObject({ outcome: 'approved' })
    expect(trail()).toBe('maria:approved')
  })

  it('escalates up the line when it exceeds a limit', async () => {
    await startChain(sb, { ...PO, submitterId: 'bob', amount: 15000 })
    expect(await act('maria', 'approve', 15000)).toMatchObject({ outcome: 'pending', approver: { id: 'ben' } })
    expect(await act('ben', 'approve', 15000)).toMatchObject({ outcome: 'approved' })
    expect(trail()).toBe('maria:endorsed → ben:approved')
  })

  it('climbs to the owner when nobody below has enough authority', async () => {
    await startChain(sb, { ...PO, submitterId: 'bob', amount: 50000 })
    await act('maria', 'approve', 50000)
    expect(await act('ben', 'approve', 50000)).toMatchObject({ outcome: 'pending', approver: { id: 'owner' } })
    expect(await act('owner', 'approve', 50000)).toMatchObject({ outcome: 'approved' })
    expect(trail()).toBe('maria:endorsed → ben:endorsed → owner:approved')
  })

  it('routes to the owner when the submitter has no manager', async () => {
    const r = await startChain(sb, { ...PO, submitterId: 'solo', amount: 100 })
    expect(r).toMatchObject({ outcome: 'pending', approver: { id: 'owner' } })
  })

  it('skips a deactivated manager', async () => {
    setup(ORG.map(p => (p.id === 'maria' ? { ...p, is_active: false } : p)))
    const r = await startChain(sb, { ...PO, submitterId: 'bob', amount: 100 })
    expect(r).toMatchObject({ outcome: 'pending', approver: { id: 'ben' } })
  })

  it('approves the owner’s own document on submit', async () => {
    expect(await startChain(sb, { ...PO, submitterId: 'owner', amount: 99999 })).toMatchObject({ outcome: 'approved' })
  })

  it('does not loop forever when two people report to each other', async () => {
    setup([
      { org_id: 'o1', id: 'owner', role: 'owner', is_active: true, created_at: '1', reports_to: null },
      { org_id: 'o1', id: 'a', role: 'operations', is_active: true, created_at: '2', reports_to: 'b', po_approval_limit: 10 },
      { org_id: 'o1', id: 'b', role: 'operations', is_active: true, created_at: '3', reports_to: 'a', po_approval_limit: 10 },
      { org_id: 'o1', id: 'c', role: 'receiver',   is_active: true, created_at: '4', reports_to: 'a' },
    ] as any)
    await startChain(sb, { ...PO, submitterId: 'c', amount: 500 })
    await actOnChain(sb, { ...PO, submitterId: 'c', amount: 500, actorId: 'a', actorRole: 'operations', action: 'approve' })
    const r = await actOnChain(sb, { ...PO, submitterId: 'c', amount: 500, actorId: 'b', actorRole: 'operations', action: 'approve' })
    expect(r).toMatchObject({ outcome: 'pending', approver: { id: 'owner' } })
  })

  it('lets the direct manager sign off a zero-value request (a tool borrow)', async () => {
    const REQ = { orgId: 'o1', docType: 'requisition' as const, docId: 'r1', ref: 'REQ-1' }
    await startChain(sb, { ...REQ, submitterId: 'sam', amount: 0 })
    const r = await actOnChain(sb, { ...REQ, submitterId: 'sam', amount: 0, actorId: 'maria', actorRole: 'procurement', action: 'approve' })
    expect(r).toMatchObject({ outcome: 'approved' })
  })
})

describe('who may act', () => {
  beforeEach(async () => { await startChain(sb, { ...PO, submitterId: 'bob', amount: 15000 }) })

  it('refuses someone further up the line before it reaches them', async () => {
    await expect(act('ben', 'approve', 15000)).rejects.toMatchObject({ status: 403 })
  })

  it('refuses the submitter on their own document', async () => {
    await expect(act('bob', 'approve', 15000)).rejects.toMatchObject({ status: 403 })
  })

  it('lets the owner step in, recorded as an override', async () => {
    expect(await act('owner', 'approve', 15000)).toMatchObject({ outcome: 'approved' })
    expect(sb._db.approval_steps.at(-1)).toMatchObject({ status: 'approved', is_override: true })
  })

  it('refuses to act twice on a settled document', async () => {
    await act('maria', 'reject', 15000)
    await expect(act('maria', 'approve', 15000)).rejects.toMatchObject({ status: 409 })
  })
})

describe('rejection, withdrawal and resubmission', () => {
  it('records a rejection and notifies the submitter', async () => {
    await startChain(sb, { ...PO, submitterId: 'bob', amount: 1000 })
    expect(await act('maria', 'reject', 1000)).toMatchObject({ outcome: 'rejected' })
    expect(sb._db.purchase_orders[0].current_approver_id).toBe(null)
    expect(notifications.at(-1)).toMatchObject({ userId: 'bob' })
  })

  it('leaves one pending step after a resubmission', async () => {
    await startChain(sb, { ...PO, submitterId: 'bob', amount: 100 })
    await startChain(sb, { ...PO, submitterId: 'bob', amount: 100 })
    expect(sb._db.approval_steps.filter((s: any) => s.status === 'pending')).toHaveLength(1)
  })

  it('clears the pending step when withdrawn', async () => {
    await startChain(sb, { ...PO, submitterId: 'bob', amount: 100 })
    await cancelChain(sb, 'purchase_order', 'po1')
    expect(sb._db.approval_steps.some((s: any) => s.status === 'pending')).toBe(false)
    expect(sb._db.purchase_orders[0].current_approver_id).toBe(null)
  })
})

describe('handover when someone is deactivated', () => {
  it('moves what was waiting on them to their manager', async () => {
    await startChain(sb, { ...PO, submitterId: 'bob', amount: 15000 })
    sb._db.user_profiles.find((p: any) => p.id === 'maria').is_active = false

    expect(await handOverApprovals(sb, 'o1', 'maria')).toBe(1)
    expect(sb._db.purchase_orders[0].current_approver_id).toBe('ben')
    expect(sb._db.approval_steps.some((s: any) => s.status === 'cancelled' && /deactivated/.test(s.note))).toBe(true)
    expect(await act('ben', 'approve', 15000)).toMatchObject({ outcome: 'approved' })
  })

  it('keeps the reassignment visible in the trail', async () => {
    await startChain(sb, { ...PO, submitterId: 'bob', amount: 15000 })
    await handOverApprovals(sb, 'o1', 'maria')
    const steps = (await loadTrails(sb, 'o1', 'purchase_order', ['po1'])).get('po1') ?? []
    expect(steps.map(s => s.status)).toEqual(['cancelled', 'pending'])
  })

  it('hides a resubmission void from the trail (it has no note)', async () => {
    await startChain(sb, { ...PO, submitterId: 'bob', amount: 100 })
    await startChain(sb, { ...PO, submitterId: 'bob', amount: 100 })
    const steps = (await loadTrails(sb, 'o1', 'purchase_order', ['po1'])).get('po1') ?? []
    expect(steps).toHaveLength(1)
  })
})

describe('what the viewer can do', () => {
  const pendingWith = (id: string) => [{ status: 'pending', approver: { id } }] as any
  const member = (id: string) => ORG.find(p => p.id === id) as any

  it('offers Approve within the limit and Endorse above it', () => {
    const base = { trail: pendingWith('maria'), viewer: member('maria'), viewerRole: 'procurement', docType: 'purchase_order' as const, submitterId: 'bob' }
    expect(myAction({ ...base, amount: 1000 })).toBe('approve')
    expect(myAction({ ...base, amount: 15000 })).toBe('endorse')
  })

  it('offers the owner an override, and nothing to bystanders', () => {
    const base = { trail: pendingWith('maria'), amount: 15000, docType: 'purchase_order' as const, submitterId: 'bob' }
    expect(myAction({ ...base, viewer: member('owner'), viewerRole: 'owner' })).toBe('override')
    expect(myAction({ ...base, viewer: member('ben'), viewerRole: 'operations' })).toBe(null)
  })

  it('offers nothing once the document is settled', () => {
    expect(myAction({
      trail: [{ status: 'approved', approver: { id: 'maria' } }] as any,
      viewer: member('owner'), viewerRole: 'owner', docType: 'purchase_order', amount: 1, submitterId: 'bob',
    })).toBe(null)
  })
})

describe('spending authority', () => {
  const m = (limit: number | null, role = 'operations') =>
    ({ id: 'x', role, po_approval_limit: limit, requisition_approval_limit: limit } as any)

  it('covers an amount at or below the limit, not above', () => {
    expect(coversAmount(m(5000), 'purchase_order', 5000)).toBe(true)
    expect(coversAmount(m(5000), 'purchase_order', 5000.01)).toBe(false)
  })

  it('treats no limit as no authority (except zero-value)', () => {
    expect(coversAmount(m(null), 'purchase_order', 1)).toBe(false)
    expect(coversAmount(m(null), 'purchase_order', 0)).toBe(true)
  })

  it('gives owners unlimited authority', () => {
    expect(coversAmount(m(null, 'owner'), 'purchase_order', 1e9)).toBe(true)
  })

  it('reads the limit for the right document type', () => {
    const person = { id: 'y', role: 'operations', po_approval_limit: 10, requisition_approval_limit: 9999 } as any
    expect(coversAmount(person, 'purchase_order', 100)).toBe(false)
    expect(coversAmount(person, 'requisition', 100)).toBe(true)
  })
})
