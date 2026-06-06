import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAnyRole } from '@/lib/api-auth'
import { stripe } from '@/lib/stripe'

/**
 * POST /api/billing/portal
 * Creates a Stripe Customer Portal session so the user can manage their
 * subscription, update payment method, view invoices, or cancel.
 *
 * Returns: { url: string }
 * Restricted to: owner
 */
export async function POST(req: NextRequest) {
  const auth = await requireAnyRole('owner')
  if (auth.error) return auth.error

  if (!auth.orgId) {
    return NextResponse.json({ error: 'No organization found' }, { status: 400 })
  }

  const supabase = createServiceClient()

  const { data: org } = await supabase
    .from('organizations')
    .select('stripe_customer_id')
    .eq('id', auth.orgId)
    .single()

  if (!org?.stripe_customer_id) {
    return NextResponse.json(
      { error: 'No billing account found. Please subscribe to a plan first.' },
      { status: 404 }
    )
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? ''

  const portalSession = await stripe.billingPortal.sessions.create({
    customer:   org.stripe_customer_id,
    return_url: `${siteUrl}/settings?tab=billing`,
  })

  return NextResponse.json({ url: portalSession.url })
}
