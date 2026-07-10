import { Sidebar } from '@/components/layout/sidebar'
import { BillingWall } from '@/components/billing/billing-wall'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { billingState } from '@/lib/billing'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Access gate: an org whose trial has ended or whose subscription was
  // cancelled sees a paywall instead of the app. Computed live from the org
  // row — no cron required to lock. Middleware already handles unauthenticated.
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

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
        .select('plan, plan_status, trial_ends_at, stripe_customer_id')
        .eq('id', profile.org_id)
        .single()

      if (org) {
        const state = billingState(org)
        if (state.locked) {
          const canManage = ['owner', 'admin'].includes(profile.role ?? '')
          return (
            <BillingWall
              reason={state.reason}
              canManage={canManage}
              hasSubscription={!!(org as any).stripe_customer_id}
            />
          )
        }
      }
    }
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-slate-50">{children}</main>
    </div>
  )
}
