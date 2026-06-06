/**
 * Simple in-process sliding-window rate limiter.
 *
 * Works for single-instance deployments (Vercel serverless with a warm function,
 * local dev, single VPS).  For distributed / high-traffic production, swap the
 * store for an Upstash Redis client:
 *   https://github.com/upstash/ratelimit
 *
 * Usage:
 *   const limit = rateLimit({ windowMs: 60_000, max: 30 })
 *   const { ok, remaining } = await limit(identifier)
 *   if (!ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
 */

interface RateLimitOptions {
  /** Rolling window size in ms (default 60 000 = 1 minute) */
  windowMs?: number
  /** Max requests per window per identifier (default 30) */
  max?: number
}

interface RateLimitResult {
  ok:        boolean
  remaining: number
  resetAt:   number   // epoch ms when the oldest request in the window expires
}

// Module-level store — persists across requests within the same function instance
const store = new Map<string, number[]>()

// Cleanup timer — prune stale entries every 5 minutes to avoid memory growth
if (typeof globalThis !== 'undefined' && typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    store.forEach((timestamps, key) => {
      if (timestamps.length === 0 || now - timestamps[timestamps.length - 1] > 300_000) {
        store.delete(key)
      }
    })
  }, 5 * 60_000)
}

export function rateLimit(options: RateLimitOptions = {}) {
  const windowMs = options.windowMs ?? 60_000
  const max      = options.max      ?? 30

  return function check(identifier: string): RateLimitResult {
    const now  = Date.now()
    const hits = (store.get(identifier) ?? []).filter(t => now - t < windowMs)
    hits.push(now)
    store.set(identifier, hits)

    const ok        = hits.length <= max
    const remaining = Math.max(0, max - hits.length)
    const resetAt   = hits.length > 0 ? hits[0] + windowMs : now + windowMs

    return { ok, remaining, resetAt }
  }
}

/** Convenience: strict limiter for expensive/mutating endpoints (20 req/min) */
export const importLimiter  = rateLimit({ windowMs: 60_000, max: 20 })

/** Convenience: general API limiter (120 req/min) */
export const apiLimiter     = rateLimit({ windowMs: 60_000, max: 120 })
