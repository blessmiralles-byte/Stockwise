import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAnyRole } from '@/lib/api-auth'
import { stripe, PLAN_PRICES } from '@/lib/stripe'

/**
 * POST /api/billing/checkout
 * Creates a Stripe Checkout Session for upgrading to a paid plan.
 *
 * Body: { plan: 'starter' | 'pro' }
 *
 * Returns: { url: string } — redirect the browser to this URL.
 * Restricted to: owner
 */
export async function POST(req: NextRequest) {
  const auth = await requireAnyRole('owner')
  if (auth.error) return auth.error

  if (!auth.orgId) {
    return NextResponse.json({ error: 'No organization found' }, { status: 400 })
  }

  let body: any
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { plan } = body
  if (!plan || !['starter', 'pro'].includes(plan)) {
    return NextResponse.json({ error: "plan must be 'starter' or 'pro'" }, { status: 400 })
  }

  const priceId = PLAN_PRICES[plan]
  if (!priceId) {
    return NextResponse.json(
      { error: `STRIPE_PRICE_${plan.toUpperCase()} is not configured` },
      { status: 500 }
    )
  }

  const supabase = createServiceClient()

  // Fetch org for stripe_customer_id and email
  const { data: org } = await supabase
    .from('organizations')
    .select('id, name, stripe_customer_id, plan')
    .eq('id', auth.orgId)
    .single()

  if (!org) {
    return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
  }

  // Fetch the owner's email for the Stripe customer record
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('email, full_name')
    .eq('user_id', auth.userId)
    .single()

  // Reuse or create Stripe customer
  let customerId = org.stripe_customer_id ?? undefined

  if (!customerId) {
    const customer = await stripe.customers.create({
      email:    profile?.email ?? undefined,
      name:     profile?.full_name ?? org.name,
      metadata: { org_id: auth.orgId },
    })
    customerId = customer.id

    // Persist immediately so we don't create duplicate customers on retry
    await supabase
      .from('organizations')
      .update({ stripe_customer_id: customerId })
      .eq('id', auth.orgId)
  }

  // Stripe rejects relative success/cancel URLs. Fail loudly here with a clear
  // message instead of letting Stripe return an opaque error if the site URL
  // env var is missing or misconfigured.
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? ''
  if (!/^https?:\/\//.test(siteUrl)) {
    return NextResponse.json(
      { error: 'Billing is not configured: set NEXT_PUBLIC_SITE_URL (or NEXT_PUBLIC_APP_URL) to an absolute URL.' },
      { status: 500 }
    )
  }

  const session = await stripe.checkout.sessions.create({
    customer:             customerId,
    mode:                 'subscription',
    line_items: [{
      price:    priceId,
      quantity: 1,
    }],
    // Pass org_id in session.metadata (for checkout.session.completed webhook)
    // AND in subscription_data.metadata (for subscription.updated/deleted webhooks)
    metadata: { org_id: auth.orgId },
    subscription_data: {
      metadata: { org_id: auth.orgId },
    },
    success_url: `${siteUrl}/settings?tab=billing&checkout=success`,
    cancel_url:  `${siteUrl}/settings?tab=billing&checkout=cancelled`,
    allow_promotion_codes: true,
  })

  return NextResponse.json({ url: session.url })
}
