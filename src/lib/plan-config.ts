/**
 * Plan configuration — safe to import in client components.
 * Contains no secrets and does not import any payment SDK.
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
    price:       49,
    priceAnnual: 490,   // 2 months free
    maxUsers:    5,
    features: [
      'Up to 5 users',
      'Inventory & asset management',
      'Purchase orders & receiving',
      'Barcode scanning & mobile app',
      'Email support — real humans',
    ],
  },
  pro: {
    label:       'Pro',
    price:       99,
    priceAnnual: 990,   // 2 months free
    maxUsers:    20,
    features: [
      'Up to 20 users',
      'Everything in Starter',
      'Reports & accounting export',
      'Forecasting & ABC-XYZ analysis',
      'Full audit trail export',
      'Priority support',
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
