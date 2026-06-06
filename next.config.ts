import type { NextConfig } from 'next'
import { withSentryConfig } from '@sentry/nextjs'

const nextConfig: NextConfig = {
  /* config options here */
}

export default withSentryConfig(nextConfig, {
  org:     process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  // Suppress verbose Sentry build output in local dev
  silent: !process.env.CI,
  // Tree-shake Sentry logger calls
  disableLogger: true,
  // Only upload source maps when SENTRY_AUTH_TOKEN is present (i.e. production CI)
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
})
