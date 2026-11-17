import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Page not found',
  robots: { index: false },
}

/** Shown for any URL that isn't a page (see src/lib/route-access.ts). */
export default function NotFound() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-5 px-4 py-16 text-center bg-slate-50">
      <p className="text-sm font-semibold text-indigo-600">404</p>
      <h1 className="text-2xl font-bold text-slate-900">We couldn&apos;t find that page</h1>
      <p className="text-sm text-slate-500 max-w-sm">
        The link may be old or mistyped. Your data is fine. Head back home, or sign in to get to your account.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link href="/" className="inline-flex items-center h-10 px-5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700">
          Go to the home page
        </Link>
        <Link href="/dashboard" className="inline-flex items-center h-10 px-5 rounded-xl border border-slate-300 text-slate-800 text-sm font-semibold hover:bg-white">
          Open my account
        </Link>
      </div>
      <p className="text-xs text-slate-400">
        Still stuck? Email <a href="mailto:support@stocked.tech" className="underline">support@stocked.tech</a>
      </p>
    </main>
  )
}
