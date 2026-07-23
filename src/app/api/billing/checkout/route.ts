import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAnyRole } from '@/lib/api-auth'
import { createCheckout, PLAN_VARIANTS } from '@/lib/lemonsqueezy'

/**
 * POST /api/billing/checkout
 * Creates a Lemon Squeezy hosted checkout for upgrading to a paid plan.
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

  const variantId = PLAN_VARIANTS[plan]
  if (!variantId) {
    return NextResponse.json(
      { error: `LEMONSQUEEZY_VARIANT_${plan.toUpperCase()} is not configured` },
      { status: 500 }
    )
  }

  // Lemon Squeezy rejects relative redirect URLs. Fail loudly here with a clear
  // message instead of letting the checkout return an opaque error if the site
  // URL env var is missing or misconfigured.
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? ''
  if (!/^https?:\/\//.test(siteUrl)) {
    return NextResponse.json(
      { error: 'Billing is not configured: set NEXT_PUBLIC_SITE_URL (or NEXT_PUBLIC_APP_URL) to an absolute URL.' },
      { status: 500 }
    )
  }

  const supabase = createServiceClient()

  const { data: org } = await supabase
    .from('organizations')
    .select('id, name')
    .eq('id', auth.orgId)
    .single()

  if (!org) {
    return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
  }

  // Prefill the checkout with the owner's email/name.
  // (user_profiles PK is `id`, which equals the auth user id — not `user_id`)
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('email, full_name')
    .eq('id', auth.userId)
    .single()

  try {
    const url = await createCheckout({
      variantId,
      orgId:       auth.orgId,
      email:       profile?.email ?? undefined,
      name:        profile?.full_name ?? org.name,
      redirectUrl: `${siteUrl}/settings?tab=billing&checkout=success`,
    })
    return NextResponse.json({ url })
  } catch (err: any) {
    console.error('[checkout] lemonsqueezy error:', err.message)
    return NextResponse.json({ error: 'Could not start checkout. Please try again.' }, { status: 502 })
  }
}
