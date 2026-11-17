import { describe, it, expect } from 'vitest'
import { readdirSync, statSync } from 'fs'
import { join } from 'path'
import { PROTECTED_PREFIXES, isProtectedPath, isPublicPath } from '@/lib/route-access'

const APP = join(process.cwd(), 'src', 'app')
const folders = (group: string) =>
  readdirSync(join(APP, group)).filter(n => statSync(join(APP, group, n)).isDirectory())

describe('which URLs need a login', () => {
  // A new signed-in page folder missing from PROTECTED_PREFIXES would show a
  // logged-out visitor "page not found" instead of the login page.
  it.each([...folders('(dashboard)'), ...folders('(field)')])('/%s is a signed-in page', name => {
    expect(PROTECTED_PREFIXES).toContain('/' + name)
  })

  it('covers sub-pages and nothing that merely shares a prefix', () => {
    expect(isProtectedPath('/settings')).toBe(true)
    expect(isProtectedPath('/purchase-orders/123')).toBe(true)
    expect(isProtectedPath('/field/log')).toBe(true)
    expect(isProtectedPath('/settingsx')).toBe(false)
    expect(isProtectedPath('/no-such-page')).toBe(false)
    expect(isProtectedPath('/')).toBe(false)
  })

  it('keeps the public pages public and drops the retired ones', () => {
    for (const p of ['/', '/login', '/register', '/tools', '/privacy', '/terms', '/robots.txt', '/sitemap.xml']) {
      expect(isPublicPath(p), p).toBe(true)
    }
    expect(isPublicPath('/one-pager')).toBe(false)
    expect(isPublicPath('/luxury-preview')).toBe(false)
    expect(isPublicPath('/dashboard')).toBe(false)
  })
})
