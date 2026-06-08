/**
 * GET /api/admin/metrics
 *
 * Platform-level health dashboard for support/operations.
 * Returns per-org activity metrics, DAU/WAU counts, and plan distribution.
 *
 * Access: Owner role only. Protected by proxy auth layer + requireRole check.
 *
 * Response shape:
 * {
 *   generatedAt: string (ISO)
 *   summary: { totalOrgs, activeOrgsLast30d, totalUsers, activeUsersLast24h, activeUsersLast7d }
 *   planDistribution: { plan: string, orgCount: number }[]
 *   orgs: [
 *     { orgId, orgName, plan, ownerEmail, userCount, activeUsersLast7d, lastActivityAt }
 *   ]
 * }
 */

import { NextResponse } from 'next/server'
import { requireRole }  from '@/lib/api-auth'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireRole('owner')
  if (auth.error) return auth.error

  const service = createServiceClient()

  const now      = new Date()
  const ago24h   = new Date(now.getTime() - 24  * 60 * 60 * 1000).toISOString()
  const ago7d    = new Date(now.getTime() -  7  * 24 * 60 * 60 * 1000).toISOString()
  const ago30d   = new Date(now.getTime() - 30  * 24 * 60 * 60 * 1000).toISOString()

  // ── Fetch all orgs ──────────────────────────────────────────────────────────
  const { data: orgs, error: orgsErr } = await service
    .from('organizations')
    .select('id, name, plan, created_at')
    .order('created_at', { ascending: false })

  if (orgsErr) {
    return NextResponse.json({ error: 'Failed to load organizations' }, { status: 500 })
  }

  // ── Fetch all active user profiles + last_seen_at ──────────────────────────
  const { data: profiles, error: profilesErr } = await service
    .from('user_profiles')
    .select('id, org_id, role, is_active, last_seen_at')
    .eq('is_active', true)

  if (profilesErr) {
    return NextResponse.json({ error: 'Failed to load user profiles' }, { status: 500 })
  }

  // ── Fetch owner email per org ──────────────────────────────────────────────
  // owner = user_profiles.role = 'owner' — we join with auth.users via service
  const ownerProfiles = (profiles ?? []).filter(p => p.role === 'owner' || p.role === 'admin')
  const ownerUserIds  = ownerProfiles.map(p => p.id)

  let ownerEmailMap: Record<string, string> = {}
  if (ownerUserIds.length > 0) {
    const { data: authUsers } = await service.auth.admin.listUsers({ perPage: 1000 })
    const usersArr = authUsers?.users ?? []
    ownerEmailMap = Object.fromEntries(
      usersArr
        .filter(u => ownerUserIds.includes(u.id))
        .map(u => [u.id, u.email ?? ''])
    )
  }

  // Build org-id → owner email
  const orgOwnerEmail: Record<string, string> = {}
  for (const p of ownerProfiles) {
    if (p.org_id && !orgOwnerEmail[p.org_id]) {
      orgOwnerEmail[p.org_id] = ownerEmailMap[p.id] ?? ''
    }
  }

  // ── Per-org aggregation ────────────────────────────────────────────────────
  const orgRows = (orgs ?? []).map(org => {
    const members   = (profiles ?? []).filter(p => p.org_id === org.id)
    const active7d  = members.filter(p => p.last_seen_at && p.last_seen_at >= ago7d)
    const lastSeen  = members
      .map(p => p.last_seen_at)
      .filter(Boolean)
      .sort()
      .at(-1) ?? null

    return {
      orgId:              org.id,
      orgName:            org.name,
      plan:               org.plan ?? 'free',
      ownerEmail:         orgOwnerEmail[org.id] ?? '',
      userCount:          members.length,
      activeUsersLast7d:  active7d.length,
      lastActivityAt:     lastSeen,
    }
  })

  // ── Platform-wide summary ──────────────────────────────────────────────────
  const allProfiles        = profiles ?? []
  const activeOrgsLast30d  = new Set(
    allProfiles
      .filter(p => p.last_seen_at && p.last_seen_at >= ago30d)
      .map(p => p.org_id)
  ).size

  const summary = {
    totalOrgs:           (orgs ?? []).length,
    activeOrgsLast30d,
    totalUsers:          allProfiles.length,
    activeUsersLast24h:  allProfiles.filter(p => p.last_seen_at && p.last_seen_at >= ago24h).length,
    activeUsersLast7d:   allProfiles.filter(p => p.last_seen_at && p.last_seen_at >= ago7d).length,
  }

  // ── Plan distribution ──────────────────────────────────────────────────────
  const planCounts: Record<string, number> = {}
  for (const org of orgs ?? []) {
    const plan = org.plan ?? 'free'
    planCounts[plan] = (planCounts[plan] ?? 0) + 1
  }
  const planDistribution = Object.entries(planCounts).map(([plan, orgCount]) => ({ plan, orgCount }))

  return NextResponse.json({
    generatedAt:      now.toISOString(),
    summary,
    planDistribution,
    orgs:             orgRows,
  })
}
