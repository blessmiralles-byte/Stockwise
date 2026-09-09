/**
 * Plan configuration — safe to import in client components.
 * Contains no secrets and does not import any payment SDK.
 *
 * PRICING MODEL: every plan includes every feature. Tiers differ by team size
 * and level of support. This matches what the code actually enforces — the only
 * hard limit is `maxUsers` (checked in /api/users/invite). Do NOT advertise a
 * capability as tier-exclusive unless a gate is genuinely implemented for it.
 *
 * Annual price = 10x monthly (two months free).
 */
export const PLAN_CONFIG = {
  trial: {
    label:    'Free Trial',
    price:    0,
    maxUsers: 5,
    features: ['14-day free trial', 'Up to 5 users', 'All features included'],
  },
  starter: {
    label:       'Starter',
    price:       59,
    priceAnnual: 590,
    maxUsers:    5,
    features: [
      'Up to 5 users',
      'All features included',
      'Inventory, fixed assets & maintenance',
      'Purchase orders, approvals & receiving',
      'Barcode scanning & mobile app',
      'Accounting export (QuickBooks / Xero)',
      'Email support — real humans',
    ],
  },
  pro: {
    label:       'Pro',
    price:       149,
    priceAnnual: 1490,
    maxUsers:    15,
    features: [
      'Up to 15 users',
      'All features included — nothing locked',
      'Priority support — same-day response',
      'Help importing your existing data',
    ],
  },
  business: {
    label:       'Business',
    price:       299,
    priceAnnual: 2990,
    maxUsers:    50,
    features: [
      'Up to 50 users',
      'All features included — nothing locked',
      'Guided onboarding & data migration',
      'Priority support with response SLA',
    ],
  },
  enterprise: {
    label:    'Enterprise',
    price:    null, // contact sales
    maxUsers: 999,
    features: ['Unlimited users', 'Guided team onboarding', 'Uptime SLA guarantee', 'Dedicated support'],
  },
} as const

export type PlanKey = keyof typeof PLAN_CONFIG

/**
 * The self-serve, checkout-able plans, in display order. Single source of truth —
 * import this instead of hardcoding ['starter','pro'], so adding a tier doesn't
 * mean hunting through the pricing UI, checkout validation and paywall.
 */
export const PAID_PLANS = ['starter', 'pro', 'business'] as const
export type PaidPlanKey = (typeof PAID_PLANS)[number]

export function isPaidPlan(v: unknown): v is PaidPlanKey {
  return typeof v === 'string' && (PAID_PLANS as readonly string[]).includes(v)
}
