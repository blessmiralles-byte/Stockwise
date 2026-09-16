import { Sidebar } from '@/components/layout/sidebar'
import { BillingWall } from '@/components/billing/billing-wall'
import { SupportChat } from '@/components/support/support-chat'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { billingState } from '@/lib/billing'
import { resolveOrgPricingRegion } from '@/lib/pricing-region-server'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Access gate: an org whose trial has ended or whose subscription was
  // cancelled sees a paywall instead of the app. Computed live from the org
  // row — no cron required to lock. Middleware already handles unauthenticated.
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  let plan: string | null = null

  if (user) {
    const service = createServiceClient()
    const { data: profile } = await service
      .from('user_profiles')
      .select('org_id, role')
      .eq('id', user.id)
      .single()

    if (profile?.org_id) {
      const { data: org } = await service
        .from('organizations')
        .select('plan, plan_status, trial_ends_at, ls_subscription_id, pricing_region')
        .eq('id', profile.org_id)
        .single()

      if (org) {
        plan = org.plan
        // Locks the org's pricing region on its first dashboard load (right
        // after signup); a no-op read afterwards.
        const region = await resolveOrgPricingRegion(profile.org_id, (org as any).pricing_region)

        const state = billingState(org)
        if (state.locked) {
          const canManage = ['owner', 'admin'].includes(profile.role ?? '')
          return (
            <BillingWall
              reason={state.reason}
              canManage={canManage}
              hasSubscription={!!(org as any).ls_subscription_id}
              region={region}
            />
          )
        }
      }
    }
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar plan={plan} />
      <main className="flex-1 overflow-y-auto bg-slate-50">{children}</main>
      <SupportChat />
    </div>
  )
}
