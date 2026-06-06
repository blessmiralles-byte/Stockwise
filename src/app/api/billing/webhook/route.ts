import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { stripe } from '@/lib/stripe'
import type Stripe from 'stripe'

/**
 * POST /api/billing/webhook
 * Stripe webhook handler — processes subscription lifecycle events.
 *
 * Events handled:
 *   checkout.session.completed      → subscription activated after first checkout
 *   customer.subscription.updated   → plan change or renewal
 *   customer.subscription.deleted   → cancellation / expiry
 *   invoice.payment_failed          → mark plan_status = 'past_due'
 *
 * Org update logic:
 *   - Derives plan from the Stripe price ID (matches STRIPE_PRICE_STARTER / _PRO env vars)
 *   - Updates organizations: plan, plan_status, stripe_subscription_id, max_users
 */
export async function POST(req: NextRequest) {
  const sig    = req.headers.get('stripe-signature')
  const secret = process.env.STRIPE_WEBHOOK_SECRET

  if (!sig || !secret) {
    return NextResponse.json({ error: 'Missing signature or webhook secret' }, { status: 400 })
  }

  let event: Stripe.Event
  const body = await req.text()

  try {
    event = stripe.webhooks.constructEvent(body, sig, secret)
  } catch (err: any) {
    console.error('[webhook] signature verification failed:', err.message)
    return NextResponse.json({ error: `Webhook error: ${err.message}` }, { status: 400 })
  }

  const supabase = createServiceClient()

  try {
    switch (event.type) {

      // ── Checkout completed (first subscription payment) ───────────────────
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        if (session.mode !== 'subscription') break

        // org_id is stored in session.metadata (set at checkout creation)
        // and mirrored in the subscription's metadata for future events
        const orgId          = (session.metadata as any)?.org_id
        const subscriptionId = session.subscription as string

        if (!orgId) {
          console.error('[webhook] checkout.session.completed: no org_id in metadata')
          break
        }

        const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
          expand: ['items.data.price'],
        })

        const { plan, maxUsers } = derivePlan(subscription)

        await supabase
          .from('organizations')
          .update({
            plan,
            plan_status:           'active',
            stripe_subscription_id: subscriptionId,
            max_users:             maxUsers,
          })
          .eq('id', orgId)

        console.log(`[webhook] org ${orgId} upgraded to ${plan}`)
        break
      }

      // ── Subscription updated (plan change / renewal) ──────────────────────
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription
        const orgId        = subscription.metadata?.org_id

        if (!orgId) {
          // Fall back: look up org by stripe_customer_id
          const customerId = subscription.customer as string
          const { data: org } = await supabase
            .from('organizations')
            .select('id')
            .eq('stripe_customer_id', customerId)
            .single()

          if (!org) {
            console.error('[webhook] subscription.updated: no org found for customer', customerId)
            break
          }

          await updateOrgFromSubscription(supabase, org.id, subscription)
          break
        }

        await updateOrgFromSubscription(supabase, orgId, subscription)
        break
      }

      // ── Subscription cancelled / expired ──────────────────────────────────
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        const customerId   = subscription.customer as string

        const { data: org } = await supabase
          .from('organizations')
          .select('id')
          .eq('stripe_customer_id', customerId)
          .single()

        if (!org) {
          console.error('[webhook] subscription.deleted: no org for customer', customerId)
          break
        }

        await supabase
          .from('organizations')
          .update({
            plan:                  'trial',
            plan_status:           'cancelled',
            stripe_subscription_id: null,
            max_users:             5,
          })
          .eq('id', org.id)

        console.log(`[webhook] org ${org.id} subscription cancelled`)
        break
      }

      // ── Payment failed ────────────────────────────────────────────────────
      case 'invoice.payment_failed': {
        const invoice    = event.data.object as Stripe.Invoice
        const customerId = invoice.customer as string

        const { data: org } = await supabase
          .from('organizations')
          .select('id')
          .eq('stripe_customer_id', customerId)
          .single()

        if (!org) break

        await supabase
          .from('organizations')
          .update({ plan_status: 'past_due' })
          .eq('id', org.id)

        console.log(`[webhook] org ${org.id} payment failed → past_due`)
        break
      }

      default:
        // Silently ignore unhandled event types
        break
    }
  } catch (err) {
    console.error('[webhook] handler error:', err)
    return NextResponse.json({ error: 'Internal handler error' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Map a Stripe subscription's price ID to our internal plan name + max_users.
 */
function derivePlan(subscription: Stripe.Subscription): { plan: string; maxUsers: number } {
  const priceId = subscription.items?.data?.[0]?.price?.id ?? ''

  if (priceId === process.env.STRIPE_PRICE_PRO)     return { plan: 'pro',     maxUsers: 20  }
  if (priceId === process.env.STRIPE_PRICE_STARTER) return { plan: 'starter', maxUsers: 5   }

  // Unknown price → enterprise or custom
  return { plan: 'enterprise', maxUsers: 999 }
}

async function updateOrgFromSubscription(
  supabase: ReturnType<typeof import('@/lib/supabase/service').createServiceClient>,
  orgId: string,
  subscription: Stripe.Subscription
) {
  const { plan, maxUsers } = derivePlan(subscription)

  // Map Stripe status to our plan_status
  const statusMap: Record<string, string> = {
    active:             'active',
    past_due:           'past_due',
    canceled:           'cancelled',
    incomplete:         'past_due',
    incomplete_expired: 'cancelled',
    trialing:           'active',
    unpaid:             'past_due',
    paused:             'past_due',
  }
  const planStatus = statusMap[subscription.status] ?? 'past_due'

  await supabase
    .from('organizations')
    .update({
      plan,
      plan_status:           planStatus,
      stripe_subscription_id: subscription.id,
      max_users:             maxUsers,
    })
    .eq('id', orgId)
}

// Note: Next.js App Router routes automatically provide the raw body via req.text()
// — no bodyParser config needed (that was a Pages Router concept).
