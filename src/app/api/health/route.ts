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

    if (error) {
      return NextResponse.json(
        { status: 'degraded', db: 'error', error: error.message, latencyMs },
        { status: 503 }
      )
    }

    return NextResponse.json({ status: 'ok', db: 'ok', latencyMs, time: new Date().toISOString() })
  } catch (e) {
    return NextResponse.json(
      { status: 'error', db: 'unreachable', error: String(e), latencyMs: Date.now() - start },
      { status: 503 }
    )
  }
}
