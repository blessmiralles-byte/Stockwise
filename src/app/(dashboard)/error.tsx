'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'
import { RefreshCw, AlertTriangle } from 'lucide-react'

/**
 * Error boundary for the signed-in app. Without it, an error while rendering a
 * page left a blank screen with no way back. The sidebar (from the layout)
 * stays usable; this replaces only the page area.
 */
export default function DashboardError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error('[dashboard] page error:', error)
    Sentry.captureException(error)
  }, [error])

  const digest = (error as { digest?: string } | null)?.digest

  return (
    <div className="flex flex-col items-center justify-center gap-4 px-4 py-24 text-center">
      <div className="w-14 h-14 rounded-2xl bg-amber-100 flex items-center justify-center">
        <AlertTriangle className="w-7 h-7 text-amber-600" />
      </div>
      <div>
        <p className="text-base font-semibold text-slate-900">This page hit a problem</p>
        <p className="text-sm text-slate-500 mt-1 max-w-sm">
          Nothing was lost. Try again, or open another page from the menu. If it keeps happening, email
          {' '}<a href="mailto:support@stocked.tech" className="underline">support@stocked.tech</a>
          {digest ? <> and quote <code className="font-mono text-xs bg-slate-100 px-1 rounded">{digest}</code></> : null}.
        </p>
      </div>
      <button
        onClick={() => retry()}
        className="inline-flex items-center gap-2 h-10 px-5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700"
      >
        <RefreshCw className="w-4 h-4" />
        Try again
      </button>
    </div>
  )
}
