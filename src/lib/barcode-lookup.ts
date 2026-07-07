import { createServiceClient } from '@/lib/supabase/service'

/**
 * Global barcode lookup — resolves a UPC/EAN to product info from external
 * catalog providers, with a platform-wide cache (barcode_cache table).
 *
 * Providers, tried in order until one answers:
 *   1. Open Food Facts — free, no key, huge but FOOD/GROCERY/consumables only.
 *   2. UPCitemdb       — broad retail; enabled only when UPCITEMDB_API_KEY is set.
 *
 * Add more providers by pushing to PROVIDERS. All results normalize to
 * BarcodeInfo. Failures are swallowed — a lookup miss is never an error.
 */

export interface BarcodeInfo {
  barcode:    string
  name?:      string | null
  brand?:     string | null
  category?:  string | null
  image_url?: string | null
  source:     string           // 'internal' | 'open_food_facts' | 'upcitemdb' | 'cache' | 'none'
}

type Provider = {
  name: string
  enabled: () => boolean
  fetch: (barcode: string) => Promise<BarcodeInfo | null>
}

// Only digits — most barcodes are UPC-A(12)/EAN-13/EAN-8; reject junk early.
function isPlausibleBarcode(code: string): boolean {
  return /^[0-9]{6,14}$/.test(code)
}

// ── Open Food Facts (free, no key) ────────────────────────────────────────────
const openFoodFacts: Provider = {
  name: 'open_food_facts',
  enabled: () => true,
  async fetch(barcode) {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=product_name,brands,categories,image_url`,
      { headers: { 'User-Agent': 'Stocked/1.0 (stocked.tech)' }, signal: AbortSignal.timeout(6000) },
    )
    if (!res.ok) return null
    const json: any = await res.json()
    if (json.status !== 1 || !json.product) return null
    const p = json.product
    const name = (p.product_name ?? '').trim()
    if (!name) return null
    return {
      barcode,
      name,
      brand:     (p.brands ?? '').split(',')[0]?.trim() || null,
      category:  (p.categories ?? '').split(',').pop()?.trim() || null,
      image_url: p.image_url || null,
      source:    'open_food_facts',
    }
  },
}

// ── UPCitemdb (broad retail; requires key) ────────────────────────────────────
const upcItemDb: Provider = {
  name: 'upcitemdb',
  enabled: () => !!process.env.UPCITEMDB_API_KEY,
  async fetch(barcode) {
    const res = await fetch(
      `https://api.upcitemdb.com/prod/v1/lookup?upc=${encodeURIComponent(barcode)}`,
      {
        headers: {
          'user_key': process.env.UPCITEMDB_API_KEY!,
          'key_type': '3scale',
        },
        signal: AbortSignal.timeout(6000),
      },
    )
    if (!res.ok) return null
    const json: any = await res.json()
    const item = json.items?.[0]
    if (!item?.title) return null
    return {
      barcode,
      name:      String(item.title).trim(),
      brand:     item.brand || null,
      category:  item.category?.split('>').pop()?.trim() || null,
      image_url: item.images?.[0] || null,
      source:    'upcitemdb',
    }
  },
}

const PROVIDERS: Provider[] = [openFoodFacts, upcItemDb]

/**
 * Look up a barcode globally. Returns cached data instantly, otherwise queries
 * providers and caches the result (including negatives). Returns null only for
 * an implausible barcode; a genuine miss returns { found:false } via source 'none'.
 */
export async function lookupBarcode(rawCode: string): Promise<BarcodeInfo & { found: boolean } | null> {
  const barcode = rawCode.trim()
  if (!isPlausibleBarcode(barcode)) return null

  const supabase = createServiceClient()

  // 1. Cache (positive or negative)
  const { data: cached } = await supabase
    .from('barcode_cache')
    .select('barcode, found, name, brand, category, image_url, source')
    .eq('barcode', barcode)
    .maybeSingle()
  if (cached) {
    return { ...cached, source: cached.source ?? 'cache', found: cached.found } as any
  }

  // 2. Providers, in order
  let hit: BarcodeInfo | null = null
  for (const provider of PROVIDERS) {
    if (!provider.enabled()) continue
    try {
      const result = await provider.fetch(barcode)
      if (result?.name) { hit = result; break }
    } catch { /* try the next provider */ }
  }

  // 3. Cache the result (negative cache prevents repeat provider hits)
  const row = hit
    ? { barcode, found: true, name: hit.name ?? null, brand: hit.brand ?? null, category: hit.category ?? null, image_url: hit.image_url ?? null, source: hit.source }
    : { barcode, found: false, name: null, brand: null, category: null, image_url: null, source: 'none' }
  await supabase.from('barcode_cache').upsert(row, { onConflict: 'barcode' })

  return { ...row } as any
}
