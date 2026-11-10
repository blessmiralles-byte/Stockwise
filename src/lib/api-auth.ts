import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import {
  FEATURES, PLAN_REQUIRED_CODE, isToolsPlan, toolsApiBlock, upgradeMessage,
} from '@/lib/entitlements'

/**
 * Stocked Tools accounts get the tool tracker and nothing else. Rather than
 * gate dozens of inventory and purchasing routes one by one — and forget the
 * next one added — the refusal happens here, where every route already comes
 * to find out who is calling. The path arrives in a header set by proxy.ts.
 */
async function toolsPlanRefusal(plan: string | null | undefined): Promise<NextResponse | null> {
  if (!isToolsPlan(plan)) return null
  let path: string | null = null
  try { path = (await headers()).get('x-pathname') } catch { /* no request scope */ }
  const feature = toolsApiBlock(path)
  if (!feature) return null
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

/**
 * Resolve the authenticated user from either an Authorization: Bearer <jwt>
 * header (mobile app / API clients) or the session cookie (web). Returns the
 * user id, or null if neither is valid.
 */
async function resolveUserId(): Promise<string | null> {
  // 1. Bearer token — used by the Expo mobile app
  try {
    const h = await headers()
    const authz = h.get('authorization') ?? ''
    if (authz.toLowerCase().startsWith('bearer ')) {
      const token = authz.slice(7).trim()
      if (token) {
        const sb = createSupabaseClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        )
        const { data: { user } } = await sb.auth.getUser(token)
        if (user) return user.id
      }
    }
  } catch { /* fall through to cookie auth */ }

  // 2. Session cookie — used by the web app
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}

// ── SOD roles ─────────────────────────────────────────────────────────────────
// owner       — full access, assigns roles (was: admin)
// procurement — create/send POs, manage suppliers; CANNOT receive goods
// operations  — manage stock counts, approve adjustments; CANNOT create POs
// receiver    — record GRN / goods receipt; CANNOT create POs or approve adjustments
// finance     — read-only: valuation, inventory ledger, PO matching
// viewer      — read-only everywhere
// ─────────────────────────────────────────────────────────────────────────────
export type Role =
  | 'owner'
  | 'procurement'
  | 'operations'
  | 'receiver'
  | 'finance'
  | 'viewer'
  // Legacy aliases kept for backward compat with existing DB rows and UI code
  | 'admin'
  | 'manager'

// Numeric level for "at least X" checks (non-SOD routes)
const ROLE_LEVEL: Record<Role, number> = {
  owner:       6,
  admin:       6, // alias for owner
  procurement: 4,
  operations:  3,
  manager:     3, // alias for operations
  receiver:    2,
  finance:     2,
  viewer:      1,
}

// Canonical display name
export const ROLE_LABELS: Record<Role, string> = {
  owner:       'Owner',
  admin:       'Owner',
  procurement: 'Procurement Manager',
  operations:  'Operations Manager',
  manager:     'Operations Manager',
  receiver:    'Receiver / Field Officer',
  finance:     'Finance / AP',
  viewer:      'Viewer',
}

export interface AuthResult {
  userId: string
  role: Role
  orgId: string
  /** Non-null means auth failed — return this response immediately */
  error: NextResponse | null
}

/**
 * Validates the session cookie and returns the user ID + role.
 * Use at the top of every API route handler.
 *
 * Usage:
 *   const auth = await requireAuth()
 *   if (auth.error) return auth.error
 *   // auth.userId and auth.role are safe to use
 */
export async function requireAuth(): Promise<AuthResult> {
  const userId = await resolveUserId()

  if (!userId) {
    return { userId: '', role: 'viewer', orgId: '', error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  // Load role + active status — gracefully default to 'viewer' if table isn't set up yet
  try {
    const service = createServiceClient()
    // The org's plan rides along in the same query. If that embed ever fails,
    // fall back to the plain profile — signing in must not depend on it.
    let profile: any = null
    const withPlan = await service
      .from('user_profiles')
      .select('role, is_active, org_id, organization:organizations(plan)')
      .eq('id', userId)
      .single()
    if (withPlan.error) {
      const plain = await service
        .from('user_profiles')
        .select('role, is_active, org_id')
        .eq('id', userId)
        .single()
      profile = plain.data
      // Still find the plan, so the gate below can't be skipped by accident.
      if (profile?.org_id) {
        const { data: org } = await service
          .from('organizations').select('plan').eq('id', profile.org_id).maybeSingle()
        profile = { ...profile, organization: org ?? null }
      }
    } else {
      profile = withPlan.data
    }

    // C-2: Deactivated users are blocked at the auth layer regardless of role
    if (profile?.is_active === false) {
      return {
        userId,
        role: 'viewer',
        orgId: profile?.org_id ?? '',
        error: NextResponse.json(
          { error: 'Your account has been deactivated. Contact your administrator.' },
          { status: 403 }
        ),
      }
    }

    const role  = (profile?.role as Role) ?? 'viewer'
    const orgId = profile?.org_id ?? ''

    const refusal = await toolsPlanRefusal(profile?.organization?.plan)
    if (refusal) return { userId, role, orgId, error: refusal }

    return { userId, role, orgId, error: null }
  } catch {
    // user_profiles table missing (setup not yet run) — grant owner to prevent lockout
    return { userId, role: 'owner', orgId: '', error: null }
  }
}

/**
 * Like requireAuth() but enforces a minimum role level.
 * For simple "at least manager" guards on non-SOD routes.
 *
 * Usage:
 *   const auth = await requireRole('manager')
 *   if (auth.error) return auth.error
 */
export async function requireRole(minimum: Role): Promise<AuthResult> {
  const auth = await requireAuth()
  if (auth.error) return auth

  const userLevel = ROLE_LEVEL[auth.role] ?? 0
  const requiredLevel = ROLE_LEVEL[minimum]

  if (userLevel < requiredLevel) {
    return {
      ...auth,
      error: NextResponse.json(
        { error: `Requires ${minimum} role or above` },
        { status: 403 }
      ),
    }
  }

  return auth
}

/**
 * Returns 403 if the user has no org_id (i.e. hasn't completed onboarding).
 * Call this after requireAuth/requireRole/requireAnyRole.
 */
export function requireOrg(auth: AuthResult): AuthResult {
  if (!auth.orgId) {
    return {
      ...auth,
      error: NextResponse.json(
        { error: 'Organization setup required. Please complete onboarding.' },
        { status: 403 }
      ),
    }
  }
  return auth
}

/**
 * Segregation-of-duties guard: requires the user to have one of the
 * explicitly listed roles. Owner always passes.
 *
 * Usage:
 *   const auth = await requireAnyRole('owner', 'receiver')
 *   if (auth.error) return auth.error
 */
export async function requireAnyRole(...allowed: Role[]): Promise<AuthResult> {
  const auth = await requireAuth()
  if (auth.error) return auth

  // owner / admin always passes
  if (auth.role === 'owner' || auth.role === 'admin') return auth

  const set = new Set(allowed)
  if (!set.has(auth.role)) {
    const names = allowed.map(r => ROLE_LABELS[r] ?? r).join(', ')
    return {
      ...auth,
      error: NextResponse.json(
        { error: `Access denied. Required role: ${names}` },
        { status: 403 }
      ),
    }
  }

  return auth
}
