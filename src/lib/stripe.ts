'server only'

import Stripe from 'stripe'

/**
 * Server-side Stripe client — never import this in client components.
 * For plan config (safe in client), import from @/lib/stripe-config instead.
 */
if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is not set. Add it to .env.local')
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2026-05-27.dahlia',
  typescript: true,
})

// Plan → Stripe price ID mapping (server-only, uses env vars)
export const PLAN_PRICES: Record<string, string | undefined> = {
  starter: process.env.STRIPE_PRICE_STARTER,
  pro:     process.env.STRIPE_PRICE_PRO,
}

// Re-export config so server code can import everything from one place
export { PLAN_CONFIG, type PlanKey } from '@/lib/stripe-config'
