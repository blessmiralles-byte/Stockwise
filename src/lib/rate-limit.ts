/**
 * Sliding-window rate limiter with Upstash Redis backend.
 *
 * When UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN are set, uses
 * Upstash Redis for distributed rate limiting (works correctly across all
 * Vercel serverless instances).
 *
 * Falls back to an in-process store for local dev / single-instance deployments.
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
  resetAt:   number
}

// ── Upstash Redis backend ─────────────────────────────────────────────────────

async function redisCheck(
  identifier: string,
  windowMs: number,
  max: number
): Promise<RateLimitResult> {
  const url   = process.env.UPSTASH_REDIS_REST_URL!
  const token = process.env.UPSTASH_REDIS_REST_TOKEN!
  const key   = `rl:${identifier}`
  const now   = Date.now()
  const win   = Math.floor(windowMs / 1000) // Redis TTL in seconds

  // MULTI-EXEC pipeline: INCR + EXPIRE in one round trip
  const res = await fetch(`${url}/pipeline`, {
    method:  'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify([
      ['INCR', key],
      ['EXPIRE', key, win, 'NX'], // only set TTL on first request
    ]),
  })

  if (!res.ok) throw new Error(`Upstash error ${res.status}`)

  const [[, count]] = await res.json() as [[string, number]]
  const ok        = count <= max
  const remaining = Math.max(0, max - count)
  const resetAt   = now + windowMs

  return { ok, remaining, resetAt }
}

// ── In-memory fallback ────────────────────────────────────────────────────────

const store = new Map<string, number[]>()

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

function memoryCheck(
  identifier: string,
  windowMs: number,
  max: number
): RateLimitResult {
  const now  = Date.now()
  const hits = (store.get(identifier) ?? []).filter(t => now - t < windowMs)
  hits.push(now)
  store.set(identifier, hits)

  return {
    ok:        hits.length <= max,
    remaining: Math.max(0, max - hits.length),
    resetAt:   hits.length > 0 ? hits[0] + windowMs : now + windowMs,
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

const isRedisConfigured = () =>
  !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)

export function rateLimit(options: RateLimitOptions = {}) {
  const windowMs = options.windowMs ?? 60_000
  const max      = options.max      ?? 30

  return async function check(identifier: string): Promise<RateLimitResult> {
    if (isRedisConfigured()) {
      try {
        return await redisCheck(identifier, windowMs, max)
      } catch (e) {
        console.warn('[rate-limit] Upstash error, falling back to memory:', e)
      }
    }
    return memoryCheck(identifier, windowMs, max)
  }
}

/** Strict limiter for expensive/mutating endpoints (20 req/min) */
export const importLimiter = rateLimit({ windowMs: 60_000, max: 20 })

/** General API limiter (120 req/min) */
export const apiLimiter    = rateLimit({ windowMs: 60_000, max: 120 })
