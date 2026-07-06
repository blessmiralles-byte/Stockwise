'use client'

import { useEffect } from 'react'
import { RefreshCw, AlertTriangle } from 'lucide-react'

/**
 * Error boundary for the field view. Without this, a runtime error in a client
 * component (e.g. the camera scanner colliding with the DOM) crashes the whole
 * subtree into a blank, un-reloadable page on mobile. This catches it and
 * offers a recovery action.
 */
export default function FieldError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[field] runtime error:', error)
  }, [error])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-8 text-center bg-gray-50">
      <div className="w-14 h-14 rounded-2xl bg-amber-100 flex items-center justify-center">
        <AlertTriangle className="w-7 h-7 text-amber-600" />
      </div>
      <div>
        <p className="text-base font-semibold text-gray-900">Something went wrong</p>
        <p className="text-sm text-gray-500 mt-1 max-w-xs">
          The screen hit an error. Try again — your data is safe.
        </p>
      </div>
      <button
        onClick={reset}
        className="inline-flex items-center gap-2 h-12 px-6 rounded-2xl bg-indigo-600 text-white text-sm font-semibold active:bg-indigo-700 transition-colors"
      >
        <RefreshCw className="w-4 h-4" />
        Try again
      </button>
      <a href="/field" className="text-sm text-indigo-600 font-medium">Back to field home</a>
    </div>
  )
}
