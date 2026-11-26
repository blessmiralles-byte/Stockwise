'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'

/**
 * Last-resort error page: used when the root layout itself fails. It replaces
 * the whole document, so it carries its own <html>, <body> and inline styles
 * (the app's CSS isn't loaded here).
 */
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error('[global] error:', error)
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', background: '#f8fafc', color: '#0f172a' }}>
        <title>Something went wrong · Stocked</title>
        <main style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: '64px 16px', textAlign: 'center' }}>
          <h1 style={{ fontSize: 22, margin: 0 }}>Something went wrong</h1>
          <p style={{ fontSize: 14, color: '#64748b', maxWidth: 360, margin: 0 }}>
            Stocked couldn&apos;t load this page. Your data is safe. Try again in a moment, or email support@stocked.tech.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button
              onClick={() => retry()}
              style={{ height: 40, padding: '0 20px', borderRadius: 12, border: 0, background: '#4f46e5', color: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}
            >
              Try again
            </button>
            {/* A full page load on purpose: the app shell itself has failed here. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/" style={{ height: 40, padding: '0 20px', borderRadius: 12, border: '1px solid #cbd5e1', color: '#0f172a', fontWeight: 600, fontSize: 14, display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>
              Home page
            </a>
          </div>
        </main>
      </body>
    </html>
  )
}
