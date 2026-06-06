'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { Package, Building2, Loader2, ArrowRight, CheckCircle2 } from 'lucide-react'

/**
 * /onboarding — Company name setup for new accounts.
 * Shown after the very first sign-up via middleware redirect.
 * Updates the organization name (created automatically on signup as "My Company").
 */
export default function OnboardingPage() {
  const router = useRouter()
  const [companyName, setCompanyName] = useState('')
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState('')
  const [done, setDone]               = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const name = companyName.trim()
    if (!name) return

    setLoading(true)
    setError('')

    try {
      // 1. Save company name via API
      const res  = await fetch('/api/org', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Failed to save')
        return
      }

      // 2. Stamp onboarding_complete in auth metadata so the middleware
      //    gate opens without needing an extra DB query on every future page load.
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      )
      await supabase.auth.updateUser({ data: { onboarding_complete: true } })

      setDone(true)
      // Full page reload so the updated session cookie is picked up by the proxy
      setTimeout(() => { window.location.href = '/dashboard' }, 1500)
    } catch {
      setError('Network error — please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-slate-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2.5 mb-10">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-200">
            <Package className="w-5 h-5 text-white" strokeWidth={2.5} />
          </div>
          <span className="text-2xl font-bold text-slate-900 tracking-tight">StockWise</span>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
          {done ? (
            <div className="text-center py-4">
              <CheckCircle2 className="w-14 h-14 text-green-500 mx-auto mb-4" />
              <h2 className="text-xl font-bold text-slate-900 mb-1">You're all set!</h2>
              <p className="text-sm text-slate-500">Redirecting to your dashboard…</p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-indigo-600" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-slate-900">Name your workspace</h1>
                  <p className="text-sm text-slate-500">Used in reports and team invites</p>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Company / Organization Name
                  </label>
                  <input
                    type="text"
                    value={companyName}
                    onChange={e => setCompanyName(e.target.value)}
                    placeholder="e.g. Acme Supplies Co."
                    maxLength={100}
                    required
                    autoFocus
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>

                {error && (
                  <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={loading || !companyName.trim()}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                  {loading
                    ? <><Loader2 className="w-4 h-4 animate-spin" />Saving…</>
                    : <><span>Continue to Dashboard</span><ArrowRight className="w-4 h-4" /></>}
                </button>
              </form>

              <p className="text-xs text-slate-400 text-center mt-4">
                You can change this anytime in Settings → Organization
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
