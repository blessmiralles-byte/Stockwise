/**
 * Which page URLs are public, which need a login, and which are neither (so
 * they fall through to the 404 page). Used by src/proxy.ts; kept here, pure,
 * so tests/route-access.test.ts can check it against the folders in src/app.
 */

/** Pages anyone may open. A prefix also covers everything under it (except '/'). */
export const PUBLIC_PATHS = [
  '/', '/login', '/register', '/auth/callback', '/auth/confirm', '/forgot-password', '/reset-password',
  '/onboarding', '/privacy', '/terms', '/getting-started', '/delete-account',
  // Stocked Tools landing page
  '/tools',
  // Public SEO / social-share assets — must be reachable by unauthenticated
  // crawlers (Slackbot, LinkedIn, Twitterbot, Googlebot), not redirected to login.
  '/opengraph-image', '/twitter-image', '/robots.txt', '/sitemap.xml',
] as const

/**
 * Signed-in pages: every top-level folder of src/app/(dashboard) and
 * src/app/(field). A logged-out visitor is sent to the login page for these.
 * Any other unknown URL is NOT redirected: it reaches the 404 page, so a
 * mistyped link says "page not found" instead of asking for a password.
 */
export const PROTECTED_PREFIXES = [
  '/assets', '/audit-log', '/dashboard', '/forecasting', '/import', '/inventory', '/locations',
  '/maintenance', '/purchase-orders', '/reorder', '/reports', '/requisitions', '/scan', '/settings',
  '/setup', '/stock-counts', '/suppliers', '/transactions', '/vendors',
  '/field',
] as const

const under = (path: string, prefix: string) => path === prefix || path.startsWith(prefix + '/')

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(p => pathname === p || (p !== '/' && pathname.startsWith(p)))
}

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(p => under(pathname, p))
}
