import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import QRCode from 'qrcode'

/**
 * GET /api/barcode/generate
 *
 * Query params:
 *   code    string   required — the data to encode
 *   label   string   optional — text shown below the code (e.g. product name)
 *   type    string   optional — 'qr' (default) | 'qr_url'
 *   size    number   optional — width/height in px, default 200, max 600
 *   format  string   optional — 'svg' (default) | 'png_dataurl'
 *
 * Returns:
 *   Content-Type: image/svg+xml  (svg format)
 *   Content-Type: application/json { dataUrl: 'data:image/png;base64,...' } (png_dataurl)
 *
 * Usage in img tags:
 *   <img src="/api/barcode/generate?code=AST-001&label=Server+Rack" />
 *
 * Caching: immutable for 1 hour (same code = same image)
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const { searchParams } = req.nextUrl
  const code    = searchParams.get('code')?.trim()
  const label   = searchParams.get('label')?.trim() ?? ''
  const size    = Math.min(Math.max(Number(searchParams.get('size') ?? '200'), 60), 600)
  const format  = searchParams.get('format') ?? 'svg'

  if (!code) {
    return NextResponse.json({ error: 'code param is required' }, { status: 400 })
  }

  try {
    if (format === 'png_dataurl') {
      const dataUrl = await QRCode.toDataURL(code, {
        width:         size,
        margin:        2,
        errorCorrectionLevel: 'M',
        color: { dark: '#1e293b', light: '#ffffff' },
      })
      return NextResponse.json({ dataUrl, code, label }, {
        headers: { 'Cache-Control': 'public, max-age=3600, immutable' },
      })
    }

    // SVG — embed label below the QR code if provided
    const qrSvg = await QRCode.toString(code, {
      type:   'svg',
      width:   size,
      margin:  2,
      errorCorrectionLevel: 'M',
      color: { dark: '#1e293b', light: '#ffffff' },
    })

    let finalSvg: string

    if (label) {
      // Inject a <text> element below the QR code
      const fontSize   = Math.max(10, Math.round(size * 0.06))
      const totalHeight = size + fontSize + 10
      // Replace the closing </svg> with label text + new height
      finalSvg = qrSvg
        .replace(/viewBox="[^"]*"/, `viewBox="0 0 ${size} ${totalHeight}"`)
        .replace(/<\/svg>/, `
  <text
    x="${size / 2}"
    y="${size + fontSize + 2}"
    text-anchor="middle"
    font-family="ui-monospace, monospace"
    font-size="${fontSize}"
    fill="#1e293b"
  >${escapeXml(label.slice(0, 40))}</text>
</svg>`)
    } else {
      finalSvg = qrSvg
    }

    return new NextResponse(finalSvg, {
      headers: {
        'Content-Type':  'image/svg+xml',
        'Cache-Control': 'public, max-age=3600, immutable',
      },
    })
  } catch (err) {
    console.error('[GET /api/barcode/generate]', err)
    return NextResponse.json({ error: 'Failed to generate barcode' }, { status: 500 })
  }
}

function escapeXml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
