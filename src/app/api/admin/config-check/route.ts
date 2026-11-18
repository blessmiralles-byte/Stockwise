import { NextResponse } from 'next/server'
import { requirePlatformAdmin } from '@/lib/platform-admin'
import { checkEnv } from '@/lib/env-check'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/config-check — which environment variables this deployment
 * has, for the people in PLATFORM_ADMIN_EMAILS only (404 for everyone else).
 * Reports set / not set; secret values are never returned.
 */
export async function GET() {
  const admin = await requirePlatformAdmin()
  if (admin.error) return admin.error

  const production = process.env.VERCEL_ENV === 'production'
  const { vars, problems } = checkEnv(process.env, { production })
  return NextResponse.json(
    {
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
      ok: problems.length === 0,
      problems,
      vars,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
