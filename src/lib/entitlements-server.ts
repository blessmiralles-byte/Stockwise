import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { createClient } from '@/lib/supabase/server'
import {
  type Feature, FEATURES, PLAN_REQUIRED_CODE, planHasFeature, upgradeMessage,
} from '@/lib/entitlements'

/**
 * Server-side plan enforcement. Policy lives in lib/entitlements.ts; this file
 * only looks up the org's plan and applies it.
 */

export async function orgPlan(orgId: string): Promise<string | null> {
  if (!orgId) return null
  const { data } = await createServiceClient()
    .from('organizations')
    .select('plan')
    .eq('id', orgId)
    .maybeSingle()
  return (data as any)?.plan ?? null
}

/** Plan of the signed-in user's org (server components / layouts). */
export async function currentUserPlan(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await createServiceClient()
    .from('user_profiles')
    .select('org_id')
    .eq('id', user.id)
    .maybeSingle()
  return orgPlan((profile as any)?.org_id ?? '')
}

export async function orgHasFeature(orgId: string, feature: Feature): Promise<boolean> {
  return planHasFeature(await orgPlan(orgId), feature)
}

/**
 * Returns a 403 response if the org's plan doesn't include `feature`, or null
 * if it does. Usage:
 *   const gate = await requireFeature(auth.orgId, 'forecasting')
 *   if (gate) return gate
 */
export async function requireFeature(orgId: string, feature: Feature): Promise<NextResponse | null> {
  if (await orgHasFeature(orgId, feature)) return null
  return NextResponse.json(
    {
      error:         upgradeMessage(feature),
      code:          PLAN_REQUIRED_CODE,
      feature,
      required_plan: FEATURES[feature].minPlan,
    },
    { status: 403 },
  )
}
