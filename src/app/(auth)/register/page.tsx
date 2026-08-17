'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Eye, EyeOff, UserPlus, Mail } from 'lucide-react'
import { captureAttribution, getAttribution } from '@/lib/attribution'

export default function RegisterPage() {
  const router = useRouter()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [emailExists, setEmailExists] = useState(false)
  const [needsConfirmation, setNeedsConfirmation] = useState(false)
  const [agreedToTerms, setAgreedToTerms] = useState(false)

  // Capture plan intent from the landing pricing CTAs (/register?plan=pro).
  // We can't act on it during a no-card trial signup, so we stash it for the
  // billing page to pre-highlight once the user decides to upgrade.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const plan = params.get('plan')
    if (plan === 'starter' || plan === 'pro') {
      localStorage.setItem('stocked.intended_plan', plan)
    }
    const interval = params.get('interval')
    if (interval === 'annual' || interval === 'monthly') {
      localStorage.setItem('stocked.intended_interval', interval)
    }
    // Direct arrivals (ad → /register, shared link) still get first-touch
    // attribution even if they never saw the landing page
    captureAttribution()
  }, [])

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    if (!agreedToTerms) {
      setError('Please agree to the Terms of Service and Privacy Policy to continue.')
      return
    }

    // H-5: Enforce email domain restriction if configured
    const allowedDomain = process.env.NEXT_PUBLIC_ALLOWED_EMAIL_DOMAIN
    if (allowedDomain) {
      const emailDomain = email.split('@')[1]?.toLowerCase()
      if (emailDomain !== allowedDomain.toLowerCase()) {
        setError(`Registration is restricted to @${allowedDomain} email addresses.`)
        return
      }
    }

    setLoading(true)
    setError(null)
    setEmailExists(false)

    const supabase = createClient()
    const attribution = getAttribution()
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName.trim().slice(0, 100),
          // Record acceptance of the legal terms for an auditable consent trail
          terms_accepted_at: new Date().toISOString(),
          terms_version:     'v1',
          // First-touch channel data — stamped onto the organization at onboarding
          ...(attribution ? { attribution } : {}),
        },
      },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    // Supabase obscures existing emails to prevent enumeration: signUp for an
    // already-registered address returns a user with an EMPTY identities array
    // (and sends no email). Detect that and tell them to sign in instead.
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      setEmailExists(true)
      setLoading(false)
      return
    }

    // If we got a session back, email confirmation is disabled — go straight in
    if (data.session) {
      router.push('/dashboard')
      router.refresh()
      return
    }

    // No session = Supabase requires email confirmation
    setNeedsConfirmation(true)
    setLoading(false)
  }

  if (needsConfirmation) {
    return (
      <Card className="shadow-xl border-0">
        <CardContent className="pt-8 pb-8 text-center space-y-4">
          <div className="w-14 h-14 bg-indigo-50 rounded-full flex items-center justify-center mx-auto">
            <Mail className="w-7 h-7 text-indigo-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Check your email</h2>
            <p className="text-sm text-slate-500 mt-1">
              We sent a confirmation link to <span className="font-medium text-slate-700">{email}</span>.
              Click it to activate your account, then come back to sign in.
            </p>
          </div>
          <Link href="/login">
            <Button variant="outline" className="w-full">Go to sign in</Button>
          </Link>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="shadow-xl border-0">
      <CardHeader className="pb-4">
        <CardTitle className="text-xl">Start your free trial</CardTitle>
        <CardDescription>
          14 days free · No credit card · Cancel anytime
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleRegister} className="space-y-4">
          {emailExists ? (
            <div className="bg-amber-50 text-amber-800 text-sm px-3 py-2.5 rounded-lg border border-amber-100">
              An account with this email already exists.{' '}
              <Link href="/login" className="font-semibold underline hover:text-amber-900">Sign in</Link>
              {' '}or{' '}
              <Link href="/forgot-password" className="font-semibold underline hover:text-amber-900">reset your password</Link>.
            </div>
          ) : error ? (
            <div className="bg-red-50 text-red-700 text-sm px-3 py-2.5 rounded-lg border border-red-100">
              {error}
            </div>
          ) : null}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Full name</label>
            <Input
              placeholder="Juan Cruz"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
            <Input
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                placeholder="Min. 8 characters"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className="pr-10"
              />
              <button
                type="button"
                suppressHydrationWarning
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <label className="flex items-start gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={agreedToTerms}
              onChange={e => setAgreedToTerms(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 flex-shrink-0"
            />
            <span className="text-xs text-slate-500 leading-relaxed">
              I agree to the{' '}
              <Link href="/terms" target="_blank" className="text-indigo-600 font-medium hover:underline">Terms of Service</Link>
              {' '}and{' '}
              <Link href="/privacy" target="_blank" className="text-indigo-600 font-medium hover:underline">Privacy Policy</Link>,
              and I consent to the processing of my data as described.
            </span>
          </label>

          <Button type="submit" className="w-full gap-2" disabled={loading || !agreedToTerms}>
            <UserPlus className="w-4 h-4" />
            {loading ? 'Creating account…' : 'Create account'}
          </Button>

          <p className="text-center text-sm text-slate-500">
            Already have an account?{' '}
            <Link href="/login" className="text-indigo-600 font-medium hover:underline">
              Sign in
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  )
}
