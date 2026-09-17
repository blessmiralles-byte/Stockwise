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
 *  - Everything not listed here is available on every plan (inventory, POs,
 *    receiving, barcodes, assets, maintenance, stock counts, the audit log,
 *    the accounting journal CSV export, reports).
 */

export type TierPlan = 'starter' | 'pro' | 'enterprise'

export type Feature =
  | 'approvals'             // delegation of authority, requisitions, PO approval workflow, check-out approvals
  | 'recurring_maintenance' // repeating preventive maintenance schedules
  | 'job_costing'           // cost centers, job codes, Expenses + Cost Analysis reports
  | 'forecasting'           // demand forecasting & reorder suggestions
  | 'accounting_sync'       // live connection to bookkeeping apps (journal feed API)
  | 'integrations'          // JobLedger and POS integrations (API)

export const FEATURES: Record<Feature, { label: string; minPlan: TierPlan; description: string }> = {
  approvals: {
    label: 'Approvals & delegation of authority',
    minPlan: 'pro',
    description: 'Requisitions, approval limits per member, reporting lines, PO approval workflow, and tool check-out approvals.',
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
    label: 'Bookkeeping connection',
    minPlan: 'pro',
    description: 'Feed journal entries straight into your bookkeeping app instead of importing CSV files.',
  },
  integrations: {
    label: 'JobLedger & POS integrations',
    minPlan: 'enterprise',
    description: 'API connections to JobLedger job costing and point-of-sale systems.',
  },
}

const RANK: Record<TierPlan, number> = { starter: 1, pro: 2, enterprise: 3 }

export const TIER_LABEL: Record<TierPlan, string> = {
  starter: 'Starter', pro: 'Pro', enterprise: 'Enterprise',
}

/**
 * The tier an org's features are computed from. A trial behaves as Pro;
 * anything unrecognised falls back to Starter (fail closed, never open).
 */
export function effectiveTier(plan: string | null | undefined): TierPlan {
  if (plan === 'enterprise') return 'enterprise'
  if (plan === 'pro' || plan === 'trial') return 'pro'
  return 'starter'
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
