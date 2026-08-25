import type { NextConfig } from 'next'
import { withSentryConfig } from '@sentry/nextjs'

const nextConfig: NextConfig = {
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
