import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { lookupBarcode } from '@/lib/barcode-lookup'

/**
 * GET /api/barcode/lookup?code=<upc/ean>
 *
 * Resolve a barcode against global catalog providers (Open Food Facts, and
 * UPCitemdb when configured), platform-cached. Use to prefill a new product
 * when a scan isn't in the org's catalog.
 *
 * Response: { found: boolean, data: { barcode, name, brand, category, image_url, source } | null }
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const code = req.nextUrl.searchParams.get('code')?.trim()
  if (!code) {
    return NextResponse.json({ error: 'code param is required' }, { status: 400 })
  }

  const result = await lookupBarcode(code)
  if (!result) {
    return NextResponse.json({ found: false, data: null, error: 'Not a valid product barcode' }, { status: 422 })
  }

  return NextResponse.json({
    found: result.found,
    data:  result.found ? result : null,
  })
}
