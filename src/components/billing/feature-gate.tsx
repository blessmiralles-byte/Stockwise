import { Topbar } from '@/components/layout/topbar'
import { UpgradePrompt } from '@/components/billing/upgrade-prompt'
import { type Feature, planHasFeature } from '@/lib/entitlements'
import { currentUserPlan } from '@/lib/entitlements-server'

/**
 * Server-side page gate for a route segment's layout.tsx. Renders the page
 * when the org's plan includes `feature`, otherwise an upgrade panel. The
 * page's API routes enforce the same rule, so this is presentation only.
 */
export async function FeatureGate({
  feature, title, children,
}: { feature: Feature; title?: string; children: React.ReactNode }) {
  if (planHasFeature(await currentUserPlan(), feature)) return <>{children}</>
  return (
    <div>
      {title && <Topbar title={title} />}
      <UpgradePrompt feature={feature} />
    </div>
  )
}
