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

/** Tools a free Stocked Tools account can keep on its register. */
export const FREE_TOOL_LIMIT = 20

export const PLAN_CONFIG = {
  // ── Stocked Tools: the tool tracker on its own ──────────────────────────────
  tools_free: {
    label:    'Stocked Tools — Free',
    price:    0,
    maxUsers: 2,
    features: [
      `Up to ${FREE_TOOL_LIMIT} tools`,
      'Check-out, check-in & due dates',
      'Unlimited borrowers — no logins needed',
      'QR labels & phone scanning',
      'Lost, stolen & damaged reports',
    ],
  },
  tools: {
    label:    'Stocked Tools',
    maxUsers: 3,
    // One price everywhere — already priced for the smallest crews.
    prices:   { standard: 20, asean: 20 },
    features: [
      'Unlimited tools',
      'Everything in Free',
      'Overdue reminders by email',
      'Tool history by tool and by person',
      'Excel export',
      '3 team logins',
    ],
  },
  // ── Stocked: the full product ───────────────────────────────────────────────
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
      'Fixed assets, tool custody & maintenance',
      'Barcode scanning & mobile app',
      'Accounting journal export (CSV)',
      'Audit log',
      'Email support, answered by a person',
    ],
  },
  pro: {
    label:    'Pro',
    maxUsers: 15,
    prices:   { standard: 149, asean: 99 },
    features: [
      'Up to 15 users, everything in Starter',
      'Approval limits & reporting lines',
      'Job costing by cost center & job code',
      'Syncs with QuickBooks Online and Xero',
      'Recurring preventive maintenance',
      'Demand forecasting',
      'Priority support — same-day response',
      'We import your existing data for you',
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
/** The full-Stocked plans shown on the main pricing page and the paywall. */
export const PAID_PLANS = ['starter', 'pro'] as const
export type PaidPlanKey = (typeof PAID_PLANS)[number]

export function isPaidPlan(v: unknown): v is PaidPlanKey {
  return typeof v === 'string' && (PAID_PLANS as readonly string[]).includes(v)
}

/** Every plan that can be bought through checkout — Stocked Tools included. */
export const CHECKOUT_PLANS = ['tools', 'starter', 'pro'] as const
export type CheckoutPlanKey = (typeof CHECKOUT_PLANS)[number]

export function isCheckoutPlan(v: unknown): v is CheckoutPlanKey {
  return typeof v === 'string' && (CHECKOUT_PLANS as readonly string[]).includes(v)
}

/**
 * How many tools this plan may keep on its register; null = no limit.
 * Only the free Tools plan is capped.
 */
export function toolLimit(plan: string | null | undefined): number | null {
  return plan === 'tools_free' ? FREE_TOOL_LIMIT : null
}

/** Whether adding `adding` tools to the `have` already there breaks `limit`. */
export function toolsOverLimit(limit: number | null, have: number, adding = 1): boolean {
  return limit != null && have + adding > limit
}

/** Monthly price in USD for a plan in a region. */
export function monthlyPrice(plan: CheckoutPlanKey, region: PricingRegion): number {
  return PLAN_CONFIG[plan].prices[region]
}

/** Annual price in USD — ten months' worth (two months free). */
export function annualPrice(plan: CheckoutPlanKey, region: PricingRegion): number {
  return monthlyPrice(plan, region) * 10
}
