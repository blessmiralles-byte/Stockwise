import { ImageResponse } from 'next/og'

// Static share card shown when the landing page is posted to Slack, LinkedIn,
// iMessage, etc. Next wires this into og:image and twitter:image automatically
// (metadataBase in layout.tsx makes the URL absolute).
export const alt = 'Stocked — inventory, assets, and field stock in one place'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 55%, #0f172a 100%)',
          padding: '72px',
        }}
      >
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div
            style={{
              width: '72px',
              height: '72px',
              borderRadius: '18px',
              background: '#6366f1',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div style={{ width: '28px', height: '28px', borderRadius: '7px', border: '5px solid white' }} />
          </div>
          <div style={{ color: 'white', fontSize: '40px', fontWeight: 800, letterSpacing: '-1px' }}>
            Stocked
          </div>
        </div>

        {/* Headline */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
          <div
            style={{
              color: 'white',
              fontSize: '66px',
              fontWeight: 800,
              lineHeight: 1.05,
              letterSpacing: '-2px',
              maxWidth: '920px',
            }}
          >
            Stop losing money to stock you can’t see
          </div>
          <div style={{ color: '#c7d2fe', fontSize: '29px', lineHeight: 1.3, maxWidth: '880px' }}>
            Real-time inventory, expiry tracking, equipment &amp; mobile field access — for the
            businesses that keep the world running.
          </div>
        </div>

        {/* Trial pill */}
        <div style={{ display: 'flex' }}>
          <div
            style={{
              display: 'flex',
              color: '#c7d2fe',
              fontSize: '24px',
              fontWeight: 600,
              background: 'rgba(99,102,241,0.22)',
              border: '1px solid rgba(129,140,248,0.45)',
              borderRadius: '999px',
              padding: '12px 26px',
            }}
          >
            Free 14-day trial · No credit card
          </div>
        </div>
      </div>
    ),
    { ...size }
  )
}
