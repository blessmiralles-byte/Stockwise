import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join, relative } from 'path'

/**
 * Multi-tenant guard.
 *
 * Every API route talks to Supabase through the SERVICE client, which bypasses
 * row-level security — so each query has to scope itself to the caller's
 * organization. Forgetting that is how one customer ends up reading (or
 * writing) another's data; it has happened here before (the maintenance alert
 * route mailed every org's schedule to one address).
 *
 * This walks the route files and fails if one uses the service client without
 * mentioning org_id anywhere. It's a coarse net — it can't prove a query is
 * scoped correctly — but it catches the whole-file omissions, which is the
 * shape the real leaks took.
 */
const API_DIR = join(process.cwd(), 'src', 'app', 'api')

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(entry => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return routeFiles(full)
    return entry === 'route.ts' ? [full] : []
  })
}

/**
 * Routes that legitimately don't filter by org_id, each with the reason.
 * Adding to this list is a deliberate act — think before you do.
 */
const EXEMPT: Record<string, string> = {
  'account/route.ts':            'deletes the caller’s own account, keyed by their user id',
  'admin/metrics/route.ts':      'cross-org metrics for the operator, gated on an admin secret',
  'health/route.ts':             'uptime ping — counts rows to prove the database answers, reads no tenant data',
  'billing/webhook/route.ts':    'Lemon Squeezy webhook — resolves the org from signed payload data',
  'notifications/maintenance/route.ts': 'nightly cron; loops every org and groups alerts by org_id',
  'pricing/region/route.ts':     'public — returns a price band from the request country only',
  'user/profile/route.ts':       'the caller’s own profile row, keyed by their user id',
  'push/register/route.ts':      'stores a device token against the caller’s user id',
}

describe('every API route is scoped to one organization', () => {
  const files = routeFiles(API_DIR)

  it('finds the route files', () => {
    expect(files.length).toBeGreaterThan(20)
  })

  it.each(files.map(f => [relative(join(process.cwd(), 'src', 'app', 'api'), f).replaceAll('\\', '/'), f]))(
    '%s', (rel, full) => {
      const src = readFileSync(full, 'utf8')
      if (!src.includes('createServiceClient')) return          // no privileged access
      if (EXEMPT[rel as string]) return                          // documented exception

      const scoped =
        // filtered by the caller's org…
        src.includes("'org_id'") || src.includes('org_id:') ||
        src.includes('org_id,')  || src.includes('.org_id') || src.includes('auth.orgId') ||
        // …or by the caller themselves (their own notifications, profile, …)
        src.includes('auth.userId')
      expect(scoped, `${rel} uses the service client without any org_id filter — either scope its queries or add it to EXEMPT with a reason`).toBe(true)
    })
})

describe('service-client routes authenticate the caller', () => {
  const files = routeFiles(API_DIR)

  // An API-key integration or a webhook authenticates differently; everything
  // else must identify the caller before touching privileged data.
  const KEY_AUTH = ['API_KEY', 'WEBHOOK_SECRET', 'CRON_SECRET', 'timingSafeEqual', 'ADMIN_SECRET']

  it.each(files.map(f => [relative(join(process.cwd(), 'src', 'app', 'api'), f).replaceAll('\\', '/'), f]))(
    '%s', (rel, full) => {
      const src = readFileSync(full, 'utf8')
      if (!src.includes('createServiceClient')) return
      if (EXEMPT[rel as string]) return

      const authed =
        src.includes('requireAuth') || src.includes('requireRole') || src.includes('requireAnyRole') ||
        KEY_AUTH.some(k => src.includes(k))
      expect(authed, `${rel} uses the service client without authenticating the caller`).toBe(true)
    })
})
