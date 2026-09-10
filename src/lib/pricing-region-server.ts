import { headers } from 'next/headers'
import { createServiceClient } from '@/lib/supabase/service'
import { regionForCountry, isPricingRegion, type PricingRegion } from '@/lib/plan-config'

/**
 * Server-side pricing-region resolution. Never import in client components.
 *
 * Vercel sets `x-vercel-ip-country` (ISO alpha-2) on every request at no cost.
 * It is absent in local dev, where we fall back to 'standard' WITHOUT saving —
 * otherwise a dev session would permanently lock orgs to standard pricing.
 */

/** The visitor's country code from the request, or null when unknown. */
export async function requestCountry(): Promise<string | null> {
  try {
    const h = await headers()
    const c = h.get('x-vercel-ip-country')
    return c && /^[A-Za-z]{2}$/.test(c) ? c.toUpperCase() : null
  } catch {
    return null
  }
}

/** Pricing region for the current (anonymous) visitor — not persisted. */
export async function requestPricingRegion(): Promise<PricingRegion> {
  return regionForCountry(await requestCountry())
}

/**
 * An organization's pricing region. Once set it never changes on its own, so the
 * price is stable when the owner travels. If it has never been set, derive it
 * from this request's country and lock it (only when the country is actually
 * known, and only if still unset, so concurrent requests can't overwrite it).
 */
export async function resolveOrgPricingRegion(
  orgId: string,
  stored: string | null | undefined,
): Promise<PricingRegion> {
  if (isPricingRegion(stored)) return stored

  const country = await requestCountry()
  const region  = regionForCountry(country)

  if (country) {
    try {
      await createServiceClient()
        .from('organizations')
        .update({ pricing_region: region })
        .eq('id', orgId)
        .is('pricing_region', null)
    } catch (err) {
      // Pricing display must never fail on this — worst case we re-derive next time.
      console.error('[pricing-region] could not lock region for org', orgId, err)
    }
  }
  return region
}
