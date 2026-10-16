import { NextRequest, NextResponse } from 'next/server'
import { publicLimiter } from '@/lib/rate-limit'
import { requestPricingRegion } from '@/lib/pricing-region-server'
import { isPricingRegion } from '@/lib/plan-config'

/**
 * GET /api/pricing/region — which regional prices to show an anonymous visitor.
 *
 * Public (see API_EXEMPT_PATHS in proxy.ts). Returns only a region code derived
 * from Vercel's IP-country header; it never persists anything. Logged-in billing
 * uses the org's LOCKED region instead (via /api/org), not this.
 *
 * `?region=asean|standard` overrides for previewing — honoured only outside
 * production, so the public page can never be made to show a price that
 * checkout won't charge.
 */
export async function GET(req: NextRequest) {
  // Public and unauthenticated — the only handle we have is the caller's IP.
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'anonymous'
  const { ok } = await publicLimiter(ip)
  if (!ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const override = req.nextUrl.searchParams.get('region')
  const isProd   = process.env.VERCEL_ENV === 'production'

  const region = !isProd && isPricingRegion(override)
    ? override
    : await requestPricingRegion()

  return NextResponse.json(
    { region },
    // Varies per visitor; must not be cached by any shared cache.
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
}
