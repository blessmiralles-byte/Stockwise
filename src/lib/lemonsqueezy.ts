'server only'

import crypto from 'crypto'

/**
 * Server-side Lemon Squeezy client — never import this in client components.
 * For plan config (safe in client), import from @/lib/plan-config instead.
 *
 * Lemon Squeezy is our Merchant of Record: it handles checkout, tax/VAT,
 * subscriptions, invoices, and the customer portal. We talk to it over its
 * JSON:API and receive lifecycle changes via signed webhooks.
 *
 * Env vars:
 *   LEMONSQUEEZY_API_KEY          — API key (Settings → API)
 *   LEMONSQUEEZY_STORE_ID         — numeric store id
 *   LEMONSQUEEZY_WEBHOOK_SECRET   — signing secret set when creating the webhook
 *   LEMONSQUEEZY_VARIANT_STARTER  — variant id of the Starter product
 *   LEMONSQUEEZY_VARIANT_PRO      — variant id of the Pro product
 */

const LS_API = 'https://api.lemonsqueezy.com/v1'

function authHeaders() {
  const key = process.env.LEMONSQUEEZY_API_KEY
  if (!key) throw new Error('LEMONSQUEEZY_API_KEY is not set')
  return {
    Accept:          'application/vnd.api+json',
    'Content-Type':  'application/vnd.api+json',
    Authorization:   `Bearer ${key}`,
  }
}

/** plan key → Lemon Squeezy variant id (from env). */
export const PLAN_VARIANTS: Record<string, string | undefined> = {
  starter: process.env.LEMONSQUEEZY_VARIANT_STARTER,
  pro:     process.env.LEMONSQUEEZY_VARIANT_PRO,
}

/** Map a Lemon Squeezy variant id back to our internal plan + seat count. */
export function planFromVariant(variantId: string | number | null | undefined): {
  plan: string
  maxUsers: number
} {
  const v = String(variantId ?? '')
  if (v && v === process.env.LEMONSQUEEZY_VARIANT_PRO)     return { plan: 'pro',     maxUsers: 20 }
  if (v && v === process.env.LEMONSQUEEZY_VARIANT_STARTER) return { plan: 'starter', maxUsers: 5  }
  return { plan: 'enterprise', maxUsers: 999 }
}

/**
 * Map a Lemon Squeezy subscription status to our plan_status.
 * Honors the paid-through-period rule: a `cancelled` subscription keeps access
 * ('active') until it `expired` at the end of the billing period.
 */
export function planStatusFromLS(status: string): string {
  switch (status) {
    case 'active':
    case 'on_trial':
    case 'cancelled':   // cancelled but still within the paid period
      return 'active'
    case 'past_due':
      return 'past_due'
    case 'paused':
    case 'unpaid':
    case 'expired':
      return 'cancelled'
    default:
      return 'past_due'
  }
}

/**
 * Create a hosted checkout and return the URL to redirect the browser to.
 * org_id is stashed in checkout custom data so the webhook can link the
 * resulting subscription back to the organization.
 */
export async function createCheckout(opts: {
  variantId:   string
  orgId:       string
  email?:      string
  name?:       string
  redirectUrl: string
}): Promise<string> {
  const storeId = process.env.LEMONSQUEEZY_STORE_ID
  if (!storeId) throw new Error('LEMONSQUEEZY_STORE_ID is not set')

  const res = await fetch(`${LS_API}/checkouts`, {
    method:  'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      data: {
        type: 'checkouts',
        attributes: {
          checkout_data: {
            email:  opts.email,
            name:   opts.name,
            // Custom data must be strings; echoed back in webhook meta.custom_data
            custom: { org_id: opts.orgId },
          },
          product_options: {
            redirect_url:     opts.redirectUrl,
            enabled_variants: [Number(opts.variantId)],
          },
        },
        relationships: {
          store:   { data: { type: 'stores',   id: String(storeId) } },
          variant: { data: { type: 'variants', id: String(opts.variantId) } },
        },
      },
    }),
  })

  if (!res.ok) {
    throw new Error(`Lemon Squeezy checkout failed (${res.status}): ${await res.text()}`)
  }
  const json = await res.json()
  const url  = json?.data?.attributes?.url
  if (!url) throw new Error('Lemon Squeezy did not return a checkout URL')
  return url as string
}

/** Fetch a subscription (used to get a fresh, signed customer-portal URL). */
export async function getSubscription(subscriptionId: string): Promise<any> {
  const res = await fetch(`${LS_API}/subscriptions/${subscriptionId}`, {
    headers: authHeaders(),
  })
  if (!res.ok) {
    throw new Error(`Lemon Squeezy get subscription failed (${res.status}): ${await res.text()}`)
  }
  return res.json()
}

/**
 * Verify a Lemon Squeezy webhook using the X-Signature header
 * (hex HMAC-SHA256 of the raw request body with the webhook signing secret).
 */
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET
  if (!secret || !signature) return false

  const digest = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')
  const a = Buffer.from(digest,    'hex')
  const b = Buffer.from(signature, 'hex')
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}
