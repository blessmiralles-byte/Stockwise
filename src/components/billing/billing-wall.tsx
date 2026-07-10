'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { PLAN_CONFIG } from '@/lib/stripe-config'
import { Lock, CheckCircle2, Loader2 } from 'lucide-react'
import type { BillingReason } from '@/lib/billing'

/**
 * Full-screen paywall shown by the dashboard layout when an org's trial has
 * ended or its subscription was cancelled. Owners can upgrade inline (Stripe
 * Checkout); everyone else is told to ask the owner.
 */
export function BillingWall({
  reason,
  canManage,
  hasSubscription,
}: {
  reason: BillingReason
  canManage: boolean
  hasSubscription: boolean
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')

  const title = reason === 'cancelled' ? 'Your subscription was cancelled' : 'Your free trial has ended'
  const sub   = reason === 'cancelled'
    ? 'Reactivate a plan to get back into your account. Your data is safe and waiting.'
    : 'Choose a plan to keep using Stocked. Your data is safe and waiting.'

  async function checkout(plan: 'starter' | 'pro') {
    setBusy(plan); setError('')
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      })
      const json = await res.json()
      if (!res.ok || !json.url) { setError(json.error ?? 'Could not start checkout'); return }
      window.location.href = json.url
    } catch { setError('Network error — please try again.') }
    finally { setBusy(null) }
  }

  async function managePortal() {
    setBusy('portal'); setError('')
    try {
      const res = await fetch('/api/billing/portal', { method: 'POST' })
      const json = await res.json()
      if (!res.ok || !json.url) { setError(json.error ?? 'Could not open billing portal'); return }
      window.location.href = json.url
    } catch { setError('Network error — please try again.') }
    finally { setBusy(null) }
  }

  async function signOut() {
    await createClient().auth.signOut()
    window.location.href = '/login'
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-indigo-100 flex items-center justify-center mx-auto mb-4">
            <Lock className="w-7 h-7 text-indigo-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
          <p className="text-slate-500 mt-2 max-w-md mx-auto">{sub}</p>
        </div>

        {canManage ? (
          <>
            <div className="grid sm:grid-cols-2 gap-4">
              {(['starter', 'pro'] as const).map(plan => {
                const cfg = PLAN_CONFIG[plan]
                const highlight = plan === 'pro'
                return (
                  <div key={plan} className={`rounded-2xl border p-5 ${highlight ? 'border-indigo-300 bg-white shadow-md' : 'border-slate-200 bg-white'}`}>
                    <p className="font-bold text-slate-900">{cfg.label}</p>
                    <p className="text-3xl font-extrabold text-slate-900 mt-1">
                      ${cfg.price}<span className="text-sm font-normal text-slate-500">/mo</span>
                    </p>
                    <ul className="mt-3 space-y-1.5 mb-4">
                      {cfg.features.slice(0, 4).map(f => (
                        <li key={f} className="flex items-start gap-2 text-xs text-slate-600">
                          <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0 mt-0.5" /> {f}
                        </li>
                      ))}
                    </ul>
                    <button
                      onClick={() => checkout(plan)}
                      disabled={!!busy}
                      className={`w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 ${highlight ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-slate-900 text-white hover:bg-slate-800'}`}>
                      {busy === plan ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                      Choose {cfg.label}
                    </button>
                  </div>
                )
              })}
            </div>

            {hasSubscription && (
              <button onClick={managePortal} disabled={!!busy}
                className="mt-4 w-full text-sm text-indigo-600 font-medium hover:underline">
                Manage billing / update payment method
              </button>
            )}
          </>
        ) : (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 text-center">
            <p className="text-sm text-slate-600">
              Please ask your account owner to reactivate the subscription. Once they do,
              your access returns immediately.
            </p>
          </div>
        )}

        {error && <p className="text-center text-sm text-red-600 mt-4">{error}</p>}

        <button onClick={signOut} className="mt-6 w-full text-center text-xs text-slate-400 hover:text-slate-600">
          Sign out
        </button>
      </div>
    </div>
  )
}
