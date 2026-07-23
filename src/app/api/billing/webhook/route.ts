import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { verifyWebhookSignature, planFromVariant, planStatusFromLS } from '@/lib/lemonsqueezy'

/**
 * POST /api/billing/webhook
 * Lemon Squeezy webhook handler — processes subscription lifecycle events.
 *
 * Verified via the X-Signature header (HMAC-SHA256 of the raw body with
 * LEMONSQUEEZY_WEBHOOK_SECRET).
 *
 * Events handled:
 *   subscription_created / _updated / _cancelled / _resumed /
 *   _paused / _unpaused / _expired  → full sync of plan + status from the
 *                                     subscription's current state
 *   subscription_payment_failed     → mark plan_status = 'past_due'
 *
 * org_id is carried through checkout custom data (meta.custom_data.org_id);
 * for later events we also fall back to matching on ls_subscription_id.
 */
export async function POST(req: NextRequest) {
  const raw       = await req.text()
  const signature = req.headers.get('x-signature')

  if (!verifyWebhookSignature(raw, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let payload: any
  try { payload = JSON.parse(raw) } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const eventName  = payload?.meta?.event_name as string | undefined
  const customOrg  = payload?.meta?.custom_data?.org_id as string | undefined
  const data       = payload?.data
  const attrs      = data?.attributes ?? {}

  const supabase = createServiceClient()

  try {
    switch (eventName) {

      // ── Subscription lifecycle (data = subscription object) ────────────────
      case 'subscription_created':
      case 'subscription_updated':
      case 'subscription_cancelled':
      case 'subscription_resumed':
      case 'subscription_paused':
      case 'subscription_unpaused':
      case 'subscription_expired': {
        const subId = String(data?.id ?? '')
        const orgId = await resolveOrgId(supabase, customOrg, subId)
        if (!orgId) {
          console.error('[webhook] no org for subscription', subId, eventName)
          break
        }

        const { plan, maxUsers } = planFromVariant(attrs.variant_id)
        const planStatus         = planStatusFromLS(String(attrs.status ?? ''))

        await supabase
          .from('organizations')
          .update({
            plan,
            plan_status:        planStatus,
            ls_subscription_id: subId,
            ls_customer_id:     attrs.customer_id != null ? String(attrs.customer_id) : null,
            ls_variant_id:      attrs.variant_id  != null ? String(attrs.variant_id)  : null,
            max_users:          maxUsers,
          })
          .eq('id', orgId)

        console.log(`[webhook] org ${orgId} ${eventName} → ${plan}/${planStatus}`)
        break
      }

      // ── Payment failed (data = subscription-invoice object) ────────────────
      case 'subscription_payment_failed': {
        // On an invoice payload the subscription id lives in attributes.
        const subId = String(attrs.subscription_id ?? '')
        const orgId = await resolveOrgId(supabase, customOrg, subId)
        if (!orgId) break

        await supabase
          .from('organizations')
          .update({ plan_status: 'past_due' })
          .eq('id', orgId)

        console.log(`[webhook] org ${orgId} payment failed → past_due`)
        break
      }

      default:
        // Silently ignore unhandled event types (orders, invoices, etc.)
        break
    }
  } catch (err) {
    console.error('[webhook] handler error:', err)
    return NextResponse.json({ error: 'Internal handler error' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Resolve the organization id for a webhook: prefer the org_id echoed back in
 * checkout custom data; otherwise match the stored ls_subscription_id.
 */
async function resolveOrgId(
  supabase: ReturnType<typeof createServiceClient>,
  orgIdFromCustom: string | undefined,
  subscriptionId: string,
): Promise<string | null> {
  if (orgIdFromCustom) return orgIdFromCustom
  if (!subscriptionId) return null

  const { data } = await supabase
    .from('organizations')
    .select('id')
    .eq('ls_subscription_id', subscriptionId)
    .single()

  return data?.id ?? null
}
