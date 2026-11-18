import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { ENV_VARS, checkEnv } from '@/lib/env-check'
import { variantEnvKey } from '@/lib/lemonsqueezy'
import { CHECKOUT_PLANS, PRICING_REGIONS } from '@/lib/plan-config'
import { isPlatformAdminEmail, platformAdminEmails } from '@/lib/platform-admin'

function files(dir: string, ext = /\.(ts|tsx)$/): string[] {
  return readdirSync(dir).flatMap(e => {
    const full = join(dir, e)
    if (statSync(full).isDirectory()) return files(full, ext)
    return ext.test(e) ? [full] : []
  })
}

const ROOT = process.cwd()
const listed = new Set(ENV_VARS.map(v => v.name))
const PLATFORM = new Set(['NODE_ENV', 'NEXT_RUNTIME', 'VERCEL_ENV', 'CI'])

describe('env-vars.json', () => {
  it('lists every variable the code reads', () => {
    const sources = [
      ...files(join(ROOT, 'src')),
      ...['next.config.ts', 'sentry.client.config.ts', 'sentry.server.config.ts', 'sentry.edge.config.ts', 'instrumentation.ts']
        .map(f => join(ROOT, f)),
    ]
    const read = new Set<string>()
    for (const f of sources) {
      for (const m of readFileSync(f, 'utf8').matchAll(/process\.env\.([A-Z0-9_]+)/g)) read.add(m[1])
    }
    const missing = [...read].filter(n => !PLATFORM.has(n) && !listed.has(n))
    expect(missing, 'add these to src/lib/env-vars.json').toEqual([])
    const obsoleteButRead = ENV_VARS.filter(v => v.level === 'obsolete' && read.has(v.name)).map(v => v.name)
    expect(obsoleteButRead, 'marked obsolete but still read').toEqual([])
  })

  it('has every Lemon Squeezy price variant as required', () => {
    for (const plan of CHECKOUT_PLANS) for (const region of PRICING_REGIONS) for (const i of ['monthly', 'annual'] as const) {
      const name = variantEnvKey(plan, i, region)
      expect(ENV_VARS.find(v => v.name === name)?.level, name).toBe('required')
    }
  })

  it('has no duplicates', () => {
    expect(listed.size).toBe(ENV_VARS.length)
  })
})

describe('checkEnv', () => {
  const full = Object.fromEntries(ENV_VARS.filter(v => v.level !== 'obsolete' && !v.warnIfSet)
    .map(v => [v.name, v.expectInProduction ?? 'x'.repeat(v.minLength ?? 8)]))

  it('passes a complete production config', () => {
    expect(checkEnv(full, { production: true }).problems).toEqual([])
  })

  it('never returns secret values', () => {
    const env = { ...full, SUPABASE_SERVICE_ROLE_KEY: 'super-secret-value', NEXT_PUBLIC_SITE_URL: 'https://www.stocked.tech' }
    const out = JSON.stringify(checkEnv(env))
    expect(out).not.toContain('super-secret-value')
    expect(out).toContain('https://www.stocked.tech')
  })

  it('flags missing, short, leftover, wrong site URL and domain lock', () => {
    const env: Record<string, string | undefined> = {
      ...full, CRON_SECRET: 'short', RESEND_API_KEY: '', STRIPE_SECRET_KEY: 'sk_test',
      NEXT_PUBLIC_SITE_URL: 'https://stocked.vercel.app', NEXT_PUBLIC_ALLOWED_EMAIL_DOMAIN: 'acme.com',
    }
    const p = checkEnv(env, { production: true }).problems.join('\n')
    expect(p).toContain('CRON_SECRET: Too short')
    expect(p).toContain('RESEND_API_KEY: Missing')
    expect(p).toContain('STRIPE_SECRET_KEY: Not used')
    expect(p).toContain('NEXT_PUBLIC_SITE_URL: Should be https://www.stocked.tech')
    expect(p).toContain('NEXT_PUBLIC_ALLOWED_EMAIL_DOMAIN')
  })

  it('does not insist on the production URL elsewhere', () => {
    expect(checkEnv({ ...full, NEXT_PUBLIC_SITE_URL: 'http://localhost:3005' }).problems).toEqual([])
  })
})

describe('platform admins', () => {
  it('parses the list case-insensitively and denies when unset', () => {
    expect(platformAdminEmails(' A@x.com, b@y.com ,')).toEqual(['a@x.com', 'b@y.com'])
    expect(isPlatformAdminEmail('B@Y.com', 'a@x.com,b@y.com')).toBe(true)
    expect(isPlatformAdminEmail('c@z.com', 'a@x.com')).toBe(false)
    expect(isPlatformAdminEmail('a@x.com', '')).toBe(false)
    expect(isPlatformAdminEmail(null, 'a@x.com')).toBe(false)
  })

  it('every /api/admin route uses requirePlatformAdmin (not a role check)', () => {
    const routes = files(join(ROOT, 'src', 'app', 'api', 'admin'), /^route\.ts$/)
    expect(routes.length).toBeGreaterThan(0)
    for (const r of routes) {
      const src = readFileSync(r, 'utf8')
      expect(src.includes('requirePlatformAdmin()'), r).toBe(true)
      expect(/requireRole|requireAnyRole/.test(src), r).toBe(false)
    }
  })
})
