import Link from 'next/link'
import { Lock, Sparkles } from 'lucide-react'
import { type Feature, type TierPlan, FEATURES, TIER_LABEL } from '@/lib/entitlements'
import { cn } from '@/lib/utils'

/** Upgrade destination. Enterprise is contact-sales, not self-serve checkout. */
function upgradeHref(tier: TierPlan) {
  return tier === 'enterprise'
    ? 'mailto:support@stocked.tech?subject=Stocked%20Enterprise'
    : '/settings?tab=billing'
}

/** Small "PRO" / "ENTERPRISE" pill shown next to locked features. */
export function PlanBadge({ tier, className }: { tier: TierPlan; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded px-1.5 py-px text-[9px] font-bold uppercase tracking-wider',
        tier === 'enterprise' ? 'bg-slate-800 text-amber-300' : 'bg-amber-100 text-amber-800',
        className,
      )}
    >
      <Sparkles className="w-2.5 h-2.5" />
      {TIER_LABEL[tier]}
    </span>
  )
}

/**
 * Shown in place of a feature the org's plan doesn't include. Renders on the
 * server or the client (no hooks). `compact` is an inline notice for use inside
 * a form or card; the default is a full-page panel.
 */
export function UpgradePrompt({ feature, compact = false }: { feature: Feature; compact?: boolean }) {
  const f = FEATURES[feature]
  const tier = TIER_LABEL[f.minPlan]
  const cta = f.minPlan === 'enterprise' ? 'Contact sales' : `Upgrade to ${tier}`

  if (compact) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
        <Lock className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
        <p className="flex-1">
          <span className="font-semibold">{f.label}</span> is on the {tier} plan.{' '}
          <Link href={upgradeHref(f.minPlan)} className="font-semibold underline underline-offset-2">
            {cta}
          </Link>
        </p>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
          <Lock className="h-5 w-5 text-amber-700" />
        </div>
        <PlanBadge tier={f.minPlan} />
        <h2 className="mt-3 text-lg font-semibold text-slate-900">{f.label}</h2>
        <p className="mt-2 text-sm text-slate-600">{f.description}</p>
        <p className="mt-4 text-sm text-slate-500">
          Available on the {tier} plan. Anything your team already recorded here is kept.
        </p>
        <Link
          href={upgradeHref(f.minPlan)}
          className="mt-6 inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          {cta}
        </Link>
      </div>
    </div>
  )
}
