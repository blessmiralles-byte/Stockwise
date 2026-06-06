/**
 * Stripe plan configuration — safe to import in client components.
 * Contains no secrets and does not import the Stripe SDK.
 */
export const PLAN_CONFIG = {
  trial: {
    label:    'Free Trial',
    price:    0,
    maxUsers: 5,
    features: ['14-day free trial', 'Up to 5 users', 'All features included'],
  },
  starter: {
    label:    'Starter',
    price:    19,
    maxUsers: 5,
    features: ['Up to 5 users', 'Unlimited products & assets', 'All features', 'Email support'],
  },
  pro: {
    label:    'Pro',
    price:    49,
    maxUsers: 20,
    features: ['Up to 20 users', 'Everything in Starter', 'Priority support', 'Audit log export'],
  },
  enterprise: {
    label:    'Enterprise',
    price:    null, // contact sales
    maxUsers: 999,
    features: ['Unlimited users', 'Custom onboarding', 'SLA', 'Dedicated support'],
  },
} as const

export type PlanKey = keyof typeof PLAN_CONFIG
