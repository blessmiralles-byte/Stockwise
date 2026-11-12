/**
 * Who may do what — the rules that are shared between routes and screens.
 *
 * Tested role by role (signed in as each, against the real routes), the
 * gaps were all of one kind: a route checked only "signed in" or "at least
 * manager level", and the level ladder doesn't describe the separation of
 * duties the roles exist for. So:
 *
 *   - The field officer (receiver) could not issue to a job, transfer, or
 *     return anything: the field app's main screen refused its main user.
 *   - Procurement — who places the orders — could receive goods without a
 *     purchase order and write stock down. Those are the two things a buyer
 *     must not be able to do alone.
 *   - A viewer, "read-only everywhere", could add vendors, fixed assets and
 *     requisitions, and enter or cancel stock counts.
 *   - Finance / AP could not record a vendor's invoice against an order.
 *
 * The rules are written down here, per movement type and per page, and the
 * routes and the sidebar read the same table.
 *
 * Pure (types only from api-auth), so it can be used on either side.
 */

import type { Role } from '@/lib/api-auth'

/** Legacy names still accepted in the database. */
function canonical(role: string | null | undefined): string {
  if (role === 'admin') return 'owner'
  if (role === 'manager') return 'operations'
  return role ?? 'viewer'
}

const allow = (role: string | null | undefined, roles: readonly string[]) => {
  const r = canonical(role)
  return r === 'owner' || roles.includes(r)
}

// ── Stock movements ───────────────────────────────────────────────────────────

const FIELD_AND_STOCK = ['operations', 'procurement', 'receiver'] as const

export const MOVEMENT_ROLES: Record<string, readonly string[]> = {
  // Goods in without an order: whoever receives, never the buyer.
  purchase:      ['operations', 'receiver'],
  consumption:   FIELD_AND_STOCK,
  sale:          FIELD_AND_STOCK,
  transfer:      FIELD_AND_STOCK,
  return:        FIELD_AND_STOCK,
  vendor_return: FIELD_AND_STOCK,
  // Writing stock up or down changes its value without anything moving:
  // operations (who owns stock control) and the owner only.
  adjustment:    ['operations'],
}

const MOVEMENT_NAMES: Record<string, string> = {
  purchase: 'receive goods without a purchase order',
  consumption: 'issue stock', sale: 'record a sale', transfer: 'transfer stock',
  return: 'return material from a job', vendor_return: 'return goods to a vendor',
  adjustment: 'adjust stock',
}

export function canMove(role: string | null | undefined, type: string): boolean {
  const roles = MOVEMENT_ROLES[type]
  return !!roles && allow(role, roles)
}

/** null when allowed, otherwise the sentence to show. */
export function movementDenied(role: string | null | undefined, type: string): string | null {
  if (canMove(role, type)) return null
  const who = MOVEMENT_ROLES[type]?.map(r => ROLE_NAMES[r] ?? r).join(', ')
  return `Your role can't ${MOVEMENT_NAMES[type] ?? type}.${who ? ` Ask the owner or: ${who}.` : ''}`
}

// ── Everything else that isn't read-only ──────────────────────────────────────

/** Viewer is read-only everywhere; finance is read-only on stock and assets. */
export function isReadOnly(role: string | null | undefined): boolean {
  return canonical(role) === 'viewer'
}

/** May enter counted quantities or send a count for review. */
export const COUNTER_ROLES = ['operations', 'procurement', 'receiver'] as const
/** May start or cancel a count. */
export const COUNT_MANAGER_ROLES = ['operations', 'procurement'] as const
/** Keeps the vendor list. */
export const VENDOR_ROLES = ['procurement', 'operations', 'finance'] as const
/** Records a vendor's invoice against an order (three-way match). */
export const INVOICE_ROLES = ['finance', 'procurement'] as const

export const can = {
  countEntry:  (role: string | null | undefined) => allow(role, COUNTER_ROLES),
  countManage: (role: string | null | undefined) => allow(role, COUNT_MANAGER_ROLES),
  editVendors: (role: string | null | undefined) => allow(role, VENDOR_ROLES),
  recordInvoice: (role: string | null | undefined) => allow(role, INVOICE_ROLES),
}

// ── Pages and reports: show only what the role can open ─────────────────────

/** Pages limited to some roles; anything not listed is open to every role. */
export const PAGE_ROLES: Record<string, readonly string[]> = {
  '/audit-log': ['finance'],
  // Reports — the same lists the report routes enforce.
  '/reports/valuation':             ['finance'],
  '/reports/accounting-export':     ['finance'],
  '/reports/depreciation':          ['finance'],
  '/reports/assets-roll-forward':   ['finance'],
  '/reports/received-not-invoiced': ['finance', 'procurement'],
  '/reports/adjustments':           ['finance', 'operations'],
  '/reports/expenses':              ['finance', 'operations', 'procurement'],
  '/reports/cost-analysis':         ['finance', 'operations', 'procurement'],
  '/reports/slow-moving':           ['operations', 'procurement', 'finance'],
  '/reports/purchase-spend':        ['procurement', 'finance', 'operations'],
  '/reports/vendor-performance':    ['procurement', 'operations', 'finance'],
  '/reports/open-pos':              ['procurement', 'operations', 'finance', 'receiver'],
}

export function canSeePage(role: string | null | undefined, href: string): boolean {
  const path = href.split('?')[0]
  const roles = PAGE_ROLES[path]
  return !roles || allow(role, roles)
}

const ROLE_NAMES: Record<string, string> = {
  owner: 'Owner', procurement: 'Procurement', operations: 'Operations',
  receiver: 'Receiver / Field Officer', finance: 'Finance', viewer: 'Viewer',
}

export type { Role }
