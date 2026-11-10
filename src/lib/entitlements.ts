/**
 * Plan entitlements — which plan unlocks which feature. Safe to import in
 * client components (no secrets, no DB access).
 *
 * This is the ONLY place tier policy lives. Server routes enforce it through
 * lib/entitlements-server.ts; pages, the sidebar, and pricing copy read it from
 * here. To move a feature between tiers, change `minPlan` below.
 *
 * Principles:
 *  - A free trial gets Pro features, so trialists experience what they'd lose.
 *  - Downgrading never deletes data. Locked features stop being usable (and
 *    their rules stop being enforced) but everything recorded is kept and
 *    comes back on upgrade.
 *  - Everything not listed here is available on every plan (barcodes, tool
 *    custody, maintenance, the audit log).
 *
 * Stocked Tools ('tools_free', 'tools') is the tool tracker sold on its own. It
 * sits BELOW Starter: the same app with inventory, purchasing and the asset
 * accounting switched off. Those accounts are held to an allow-list of pages
 * and API routes (bottom of this file), so a route added later is closed to
 * them until someone decides otherwise.
 */

export type TierPlan = 'tools_free' | 'tools' | 'starter' | 'pro' | 'enterprise'

export type Feature =
  | 'tool_reminders'        // overdue-tool emails
  | 'tool_reports'          // tool history report and Excel export of tool reports
  | 'inventory'             // stock, purchasing, receiving, counts, vendors — the materials side
  | 'asset_accounting'      // purchase cost, depreciation, disposal entries, asset financial reports
  | 'approvals'             // delegation of authority, requisitions, PO approval workflow, check-out approvals
  | 'recurring_maintenance' // repeating preventive maintenance schedules
  | 'job_costing'           // cost centers, job codes, Expenses + Cost Analysis reports
  | 'forecasting'           // demand forecasting & reorder suggestions
  | 'accounting_sync'       // live connection to bookkeeping apps (journal feed API)
  | 'integrations'          // JobLedger and POS integrations (API)

export const FEATURES: Record<Feature, { label: string; minPlan: TierPlan; description: string }> = {
  tool_reminders: {
    label: 'Overdue reminders',
    minPlan: 'tools',
    description: 'An email the day a tool goes overdue, and weekly while it stays out.',
  },
  tool_reports: {
    label: 'Tool history & Excel export',
    minPlan: 'tools',
    description: 'Every check-out and return, searchable by tool or person, and any tool report as a spreadsheet.',
  },
  inventory: {
    label: 'Inventory & purchasing',
    minPlan: 'starter',
    description: 'Stock by location, purchase orders, receiving, stock counts and vendors.',
  },
  asset_accounting: {
    label: 'Asset costing & depreciation',
    minPlan: 'starter',
    description: 'Purchase cost, book value, depreciation runs, disposal entries and the accounting export.',
  },
  approvals: {
    label: 'Approval limits',
    minPlan: 'pro',
    description: 'Requisitions, a spending limit per person, reporting lines, PO approvals, and sign-off on tool check-outs.',
  },
  recurring_maintenance: {
    label: 'Recurring preventive maintenance',
    minPlan: 'pro',
    description: 'Maintenance that repeats weekly, monthly, quarterly or yearly — the next job is created automatically.',
  },
  job_costing: {
    label: 'Job costing',
    minPlan: 'pro',
    description: 'Tag spend with cost centers and job codes, and see it in the Expenses and Cost Analysis reports.',
  },
  forecasting: {
    label: 'Demand forecasting',
    minPlan: 'pro',
    description: 'Projected usage, reorder points and suggested order quantities from your real consumption.',
  },
  accounting_sync: {
    label: 'Syncs with QuickBooks Online and Xero',
    minPlan: 'pro',
    description: 'Journal entries land in your bookkeeping app on their own — no CSV files to import.',
  },
  integrations: {
    label: 'JobLedger & POS integrations',
    minPlan: 'enterprise',
    description: 'API connections to JobLedger job costing and point-of-sale systems.',
  },
}

const RANK: Record<TierPlan, number> = { tools_free: 0, tools: 1, starter: 2, pro: 3, enterprise: 4 }

export const TIER_LABEL: Record<TierPlan, string> = {
  tools_free: 'Stocked Tools Free', tools: 'Stocked Tools',
  starter: 'Starter', pro: 'Pro', enterprise: 'Enterprise',
}

/**
 * The tier an org's features are computed from. A trial behaves as Pro;
 * anything unrecognised falls back to Starter (fail closed, never open).
 */
export function effectiveTier(plan: string | null | undefined): TierPlan {
  if (plan === 'enterprise') return 'enterprise'
  if (plan === 'pro' || plan === 'trial') return 'pro'
  if (plan === 'tools') return 'tools'
  if (plan === 'tools_free') return 'tools_free'
  return 'starter'
}

/** Stocked Tools, free or paid — the tool tracker without the rest of Stocked. */
export function isToolsPlan(plan: string | null | undefined): boolean {
  return plan === 'tools' || plan === 'tools_free'
}

export function planHasFeature(plan: string | null | undefined, feature: Feature): boolean {
  return RANK[effectiveTier(plan)] >= RANK[FEATURES[feature].minPlan]
}

/** Features first unlocked at exactly this tier — used for pricing copy. */
export function featuresIntroducedAt(tier: TierPlan): Feature[] {
  return (Object.keys(FEATURES) as Feature[]).filter(f => FEATURES[f].minPlan === tier)
}

/** Error body code returned by gated API routes. */
export const PLAN_REQUIRED_CODE = 'plan_upgrade_required'

export function upgradeMessage(feature: Feature): string {
  const f = FEATURES[feature]
  return `${f.label} is available on the ${TIER_LABEL[f.minPlan]} plan. Upgrade in Settings → Billing to use it.`
}

// ── Stocked Tools: what those accounts can reach ──────────────────────────────
// Allow-lists, deliberately: anything not named here is closed to a Tools
// account, including routes that don't exist yet.

/** API route prefixes a Tools account may call. */
const TOOLS_API_ALLOWED = [
  '/api/account', '/api/accountable-persons', '/api/assets', '/api/audit-log',
  '/api/barcode', '/api/billing', '/api/categories', '/api/health',
  '/api/import/assets', '/api/import/locations', '/api/locations',
  '/api/maintenance', '/api/members', '/api/notifications', '/api/onboarding',
  '/api/org', '/api/pricing', '/api/push', '/api/scan', '/api/support',
  '/api/user', '/api/users',
]

/** Carved back out of the prefixes above. */
const TOOLS_API_DENIED: { prefix: string; feature: Feature }[] = [
  { prefix: '/api/assets/depreciation',   feature: 'asset_accounting' },
  { prefix: '/api/notifications/reorder', feature: 'inventory' },
]

/** Dashboard pages a Tools account may open. */
const TOOLS_PAGES_ALLOWED = [
  '/assets', '/maintenance', '/locations', '/settings', '/audit-log', '/scan',
  '/reports/tools-out', '/reports/tools-by-crew', '/reports/tool-compliance', '/reports/tool-history',
]

/** Where a Tools account lands, and where it is sent from anything closed to it. */
export const TOOLS_HOME = '/assets'

const under = (path: string, prefix: string) => path === prefix || path.startsWith(prefix + '/')

/**
 * The feature a Tools account would need for this API path, or null if the
 * path is open to it. A missing path is treated as closed.
 */
export function toolsApiBlock(pathname: string | null | undefined): Feature | null {
  const path = (pathname ?? '').split('?')[0]
  if (!path) return 'inventory'
  const denied = TOOLS_API_DENIED.find(d => under(path, d.prefix))
  if (denied) return denied.feature
  return TOOLS_API_ALLOWED.some(p => under(path, p)) ? null : 'inventory'
}

/** Whether a Tools account may open this dashboard page. /reports itself is allowed (it lists only tool reports for them). */
export function toolsPageAllowed(pathname: string | null | undefined): boolean {
  const path = (pathname ?? '').split('?')[0]
  if (!path) return true   // unknown: let the API gate do the refusing
  if (path === '/reports') return true
  return TOOLS_PAGES_ALLOWED.some(p => under(path, p))
}
