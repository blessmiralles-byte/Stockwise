/**
 * Plan configuration — safe to import in client components.
 * Contains no secrets and does not import any payment SDK.
 *
 * REGIONAL PRICING: self-serve plans are priced per region. ASEAN countries get
 * the `asean` price; every other country gets `standard` (North America rates).
 * An organization's region is locked when it is first seen (see
 * lib/pricing-region-server.ts) so the price doesn't move when the owner travels.
 *
 * Prices live ONLY in `prices` — there is deliberately no flat `price` field on
 * paid plans, so any UI that forgets to pass a region fails to compile instead
 * of silently showing the wrong market's price.
 *
 * Annual price = 10x monthly (two months free).
 */

export type PricingRegion = 'standard' | 'asean'
export const PRICING_REGIONS: readonly PricingRegion[] = ['standard', 'asean']

/** ISO 3166-1 alpha-2 codes of ASEAN member states (Timor-Leste joined in 2025). */
export const ASEAN_COUNTRIES = [
  'BN', 'KH', 'ID', 'LA', 'MY', 'MM', 'PH', 'SG', 'TH', 'VN', 'TL',
] as const

export function regionForCountry(country: string | null | undefined): PricingRegion {
  if (!country) return 'standard'
  return (ASEAN_COUNTRIES as readonly string[]).includes(country.toUpperCase()) ? 'asean' : 'standard'
}

export function isPricingRegion(v: unknown): v is PricingRegion {
  return v === 'standard' || v === 'asean'
}

export const PLAN_CONFIG = {
  trial: {
    label:    'Free Trial',
    price:    0,
    maxUsers: 5,
    features: ['14-day free trial', 'Up to 5 users', 'All Pro features included'],
  },
  starter: {
    label:    'Starter',
    maxUsers: 5,
    prices:   { standard: 75, asean: 49 },
    features: [
      'Up to 5 users',
      'Inventory, purchase orders & receiving',
      'Fixed assets, tool check-out & maintenance',
      'Barcode scanning & mobile app',
      'Accounting journal export (CSV)',
      'Audit log',
      'Email support — real humans',
    ],
  },
  pro: {
    label:    'Pro',
    maxUsers: 15,
    prices:   { standard: 149, asean: 99 },
    features: [
      'Up to 15 users, everything in Starter',
      'Approvals & delegation of authority',
      'Job costing by cost center & job code',
      'Bookkeeping connection (no CSV imports)',
      'Recurring preventive maintenance',
      'Demand forecasting',
      'Priority support — same-day response',
      'Help importing your existing data',
    ],
  },
  enterprise: {
    label:    'Enterprise',
    price:    null, // contact sales — priced per deal, same in every region
    maxUsers: 999,
    features: ['Unlimited users, everything in Pro', 'JobLedger & POS integrations', 'Guided team onboarding', 'Uptime SLA guarantee', 'Dedicated support'],
  },
} as const

export type PlanKey = keyof typeof PLAN_CONFIG

/**
 * The self-serve, checkout-able plans, in display order. Single source of truth —
 * import this instead of hardcoding plan names, so adding or removing a tier
 * doesn't mean hunting through the pricing UI, checkout validation and paywall.
 */
export const PAID_PLANS = ['starter', 'pro'] as const
export type PaidPlanKey = (typeof PAID_PLANS)[number]

export function isPaidPlan(v: unknown): v is PaidPlanKey {
  return typeof v === 'string' && (PAID_PLANS as readonly string[]).includes(v)
}

/** Monthly price in USD for a plan in a region. */
export function monthlyPrice(plan: PaidPlanKey, region: PricingRegion): number {
  return PLAN_CONFIG[plan].prices[region]
}

/** Annual price in USD — ten months' worth (two months free). */
export function annualPrice(plan: PaidPlanKey, region: PricingRegion): number {
  return monthlyPrice(plan, region) * 10
}
