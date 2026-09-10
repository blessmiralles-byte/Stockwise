'use client'

import { useEffect, useState } from 'react'
import { isPricingRegion, type PricingRegion } from '@/lib/plan-config'

/**
 * The regional price band for an anonymous visitor on a public pricing page.
 *
 * Returns null until known — render a placeholder rather than a price, so a
 * visitor never sees one region's number flash and then change. Logged-in
 * billing should use the org's locked region from /api/org instead.
 */
export function usePricingRegion(): PricingRegion | null {
  const [region, setRegion] = useState<PricingRegion | null>(null)
  useEffect(() => {
    // Forward ?region= so previews work (the API ignores it in production).
    const preview = new URLSearchParams(window.location.search).get('region')
    fetch(`/api/pricing/region${preview ? `?region=${encodeURIComponent(preview)}` : ''}`)
      .then(r => r.json())
      .then(j => setRegion(isPricingRegion(j.region) ? j.region : 'standard'))
      .catch(() => setRegion('standard'))
  }, [])
  return region
}
