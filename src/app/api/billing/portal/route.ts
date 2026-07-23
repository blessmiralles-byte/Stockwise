import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAnyRole } from '@/lib/api-auth'
import { getSubscription } from '@/lib/lemonsqueezy'

/**
 * POST /api/billing/portal
 * Returns the Lemon Squeezy customer portal URL so the user can manage their
 * subscription, update payment method, view invoices, or cancel.
 *
 * The portal URL is a short-lived signed link, so we fetch the subscription
 * fresh on each request rather than storing it.
 *
 * Returns: { url: string }
 * Restricted to: owner
 */
export async function POST() {
  const auth = await requireAnyRole('owner')
  if (auth.error) return auth.error

  if (!auth.orgId) {
    return NextResponse.json({ error: 'No organization found' }, { status: 400 })
  }

  const supabase = createServiceClient()

  const { data: org } = await supabase
    .from('organizations')
    .select('ls_subscription_id')
    .eq('id', auth.orgId)
    .single()

  if (!org?.ls_subscription_id) {
    return NextResponse.json(
      { error: 'No billing account found. Please subscribe to a plan first.' },
      { status: 404 }
    )
  }

  try {
    const sub = await getSubscription(org.ls_subscription_id)
    const url = sub?.data?.attributes?.urls?.customer_portal
    if (!url) {
      return NextResponse.json({ error: 'Billing portal is unavailable right now.' }, { status: 502 })
    }
    return NextResponse.json({ url })
  } catch (err: any) {
    console.error('[portal] lemonsqueezy error:', err.message)
    return NextResponse.json({ error: 'Could not open billing portal.' }, { status: 502 })
  }
}
