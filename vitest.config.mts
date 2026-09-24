import { defineConfig } from 'vitest/config'

/**
 * Unit tests for the rules that are expensive to get wrong: plan entitlements,
 * billing state, approval routing, trial claims, recurrence dates, the journal
 * mapping, and per-org scoping of the API routes. They run in Node with no
 * database — Supabase access is faked — so `npm test` runs on every build.
 */
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
