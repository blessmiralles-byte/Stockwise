'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

/**
 * "Resend the confirmation email" for a sign-up that hasn't been confirmed.
 * Without it, a customer whose link expired (or whose email went to spam and
 * got deleted) had no way back in: signing in only says "Email not confirmed".
 * Supabase limits resends to one a minute per address; its message is shown.
 */
export function ResendConfirmation({ email, className = '' }: { email: string; className?: string }) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function resend() {
    if (!email) { setError('Enter your email address first.'); return }
    setState('sending'); setError(null)
    const { error } = await createClient().auth.resend({ type: 'signup', email: email.trim() })
    if (error) { setError(error.message); setState('idle'); return }
    setState('sent')
  }

  return (
    <div className={`text-sm ${className}`}>
      {state === 'sent' ? (
        <p className="text-green-700">
          Sent. Check your inbox (and spam folder) for a new link to <span className="font-medium">{email.trim()}</span>.
        </p>
      ) : (
        <p className="text-slate-500">
          Didn&apos;t get it?{' '}
          <button type="button" onClick={resend} disabled={state === 'sending'}
            className="text-indigo-600 font-medium hover:underline disabled:opacity-50">
            {state === 'sending' ? 'Sending…' : 'Resend the confirmation email'}
          </button>
        </p>
      )}
      {error && <p className="text-red-600 mt-1">{error}</p>}
    </div>
  )
}
