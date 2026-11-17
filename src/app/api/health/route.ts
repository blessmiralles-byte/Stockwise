/**
 * GET /api/health
 *
 * Public liveness + readiness probe.
 * Used by UptimeRobot / Better Uptime and load balancers.
 *
 * Returns 200 when the app is live and the database is reachable.
 * Returns 503 when the database ping fails.
 *
 * Response is intentionally tiny — no secrets, no user data.
 */

import { NextResponse }       from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

// A monitor must see the live state, never a cached copy.
const NO_STORE = { 'Cache-Control': 'no-store' }

export async function GET() {
  const start = Date.now()

  try {
    // Lightweight DB ping — count(1) on a small system table
    const service = createServiceClient()
    const { error } = await service
      .from('organizations')
      .select('id', { count: 'exact', head: true })
      .limit(1)

    const latencyMs = Date.now() - start

    // Public endpoint: log the database's reason, never return it.
    if (error) {
      console.error('[health] database ping failed:', error.message)
      return NextResponse.json({ status: 'degraded', db: 'error', latencyMs }, { status: 503, headers: NO_STORE })
    }

    return NextResponse.json({ status: 'ok', db: 'ok', latencyMs, time: new Date().toISOString() }, { headers: NO_STORE })
  } catch (e) {
    console.error('[health] database unreachable:', e)
    return NextResponse.json({ status: 'error', db: 'unreachable', latencyMs: Date.now() - start }, { status: 503, headers: NO_STORE })
  }
}
