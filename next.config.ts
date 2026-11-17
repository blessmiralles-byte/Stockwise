import type { NextConfig } from 'next'
import path from 'path'
import { withSentryConfig } from '@sentry/nextjs'

const isDev = process.env.NODE_ENV !== 'production'

// The browser only ever talks to this site, our Supabase project (sign-in) and
// Sentry (error reports). Lemon Squeezy checkout is a full-page redirect, which
// a content security policy doesn't restrict.
const supabaseOrigin = (() => {
  try { return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').origin } catch { return '' }
})()
const supabaseWs = supabaseOrigin.replace(/^https:/, 'wss:')

const csp = [
  "default-src 'self'",
  // Next.js inlines its bootstrap scripts; label printing writes a popup with an
  // inline print script. 'unsafe-eval' only for the dev server's hot reload.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' ${supabaseOrigin} ${supabaseWs} https://*.sentry.io${isDev ? ' ws: http://localhost:*' : ''}`.replace(/\s+/g, ' ').trim(),
  "media-src 'self' blob:",          // camera preview in the barcode scanner
  "worker-src 'self' blob:",
  "object-src 'none'",
  "frame-src 'none'",
  "frame-ancestors 'none'",          // nobody may put Stocked in a frame (clickjacking)
  "base-uri 'self'",
  "form-action 'self'",
  ...(isDev ? [] : ['upgrade-insecure-requests']),
].join('; ')

const securityHeaders = [
  { key: 'Content-Security-Policy',   value: csp },
  { key: 'X-Content-Type-Options',    value: 'nosniff' },
  { key: 'X-Frame-Options',           value: 'DENY' },
  { key: 'Referrer-Policy',           value: 'strict-origin-when-cross-origin' },
  // Camera for the barcode scanner on our own pages; nothing else.
  { key: 'Permissions-Policy',        value: 'camera=(self), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()' },
]

const nextConfig: NextConfig = {
  // Pin the project root. Without it, a stray package-lock.json in the user's
  // home folder made Turbopack treat the whole home folder as the root and
  // watch it; any file written there (editor, tooling) triggered a rebuild and
  // a full page reload in a loop, so pages never hydrated in `next dev`.
  turbopack: { root: path.resolve(process.cwd()) },
  // Type errors fail the build. With no test suite, the typechecker is the
  // safety net — don't re-enable ignoreBuildErrors to get a deploy out.
  typescript: { ignoreBuildErrors: false },
  // Don't advertise the framework.
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
}

export default withSentryConfig(nextConfig, {
  org:     process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  disableLogger: true,
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
  autoInstrumentMiddleware: false,
})
