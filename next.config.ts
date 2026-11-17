import type { NextConfig } from 'next'
import path from 'path'
import { withSentryConfig } from '@sentry/nextjs'

const nextConfig: NextConfig = {
  // Pin the project root. Without it, a stray package-lock.json in the user's
  // home folder made Turbopack treat the whole home folder as the root and
  // watch it; any file written there (editor, tooling) triggered a rebuild and
  // a full page reload in a loop, so pages never hydrated in `next dev`.
  turbopack: { root: path.resolve(process.cwd()) },
  // Type errors fail the build. With no test suite, the typechecker is the
  // safety net — don't re-enable ignoreBuildErrors to get a deploy out.
  typescript: { ignoreBuildErrors: false },
}

export default withSentryConfig(nextConfig, {
  org:     process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  disableLogger: true,
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
  autoInstrumentMiddleware: false,
})
