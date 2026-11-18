'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Eye, EyeOff, LogIn } from 'lucide-react'
import { ResendConfirmation } from '@/components/auth/resend-confirmation'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  // C-3: Validate redirect target — only allow relative paths to prevent open redirect
  const rawNext = searchParams.get('next') ?? '/dashboard'
  const next = /^\/(?!\/)/.test(rawNext) ? rawNext : '/dashboard'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notConfirmed, setNotConfirmed] = useState(false)
  const linkError = searchParams.get('error')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setNotConfirmed(false)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      // Signed up but never clicked the confirmation link: say so in plain
      // words and offer a fresh link below instead of a dead end.
      const unconfirmed = (error as { code?: string }).code === 'email_not_confirmed'
        || /email not confirmed/i.test(error.message)
      setNotConfirmed(unconfirmed)
      setError(unconfirmed
        ? 'Please confirm your email first. Use the link we sent when you signed up.'
        : error.message)
      setLoading(false)
      return
    }

    router.push(next)
    router.refresh()
  }

  return (
    <form onSubmit={handleLogin} className="space-y-4">
      {error && (
        <div className="bg-red-50 text-red-700 text-sm px-3 py-2.5 rounded-lg border border-red-100">
          {error}
          {notConfirmed && <ResendConfirmation email={email} className="mt-2" />}
        </div>
      )}
      {!error && linkError && (
        <div className="bg-amber-50 text-amber-800 text-sm px-3 py-2.5 rounded-lg border border-amber-100">
          {linkError === 'confirm_link_invalid' ? (
            <>
              That confirmation link has expired or was already used. If you already confirmed your
              email, just sign in below. If not, type your email below, then ask for a new link here.
              <ResendConfirmation email={email} className="mt-2" />
            </>
          ) : linkError === 'reset_link_invalid' ? (
            <>
              That password reset link didn&apos;t work. It may have expired, been used already, or been opened in a different browser from the one that requested it.{' '}
              <Link href="/forgot-password" className="font-semibold underline">Send a new one</Link>
              {' '}and open it on this device.
            </>
          ) : linkError === 'invite_link_invalid' ? (
            'That invite link has expired or was already used. Ask your admin to resend the invite.'
          ) : (
            'That sign-in link has expired or was already used. Please sign in, or request a new link.'
          )}
        </div>
      )}
      {searchParams.get('registered') && (
        <div className="bg-green-50 text-green-700 text-sm px-3 py-2.5 rounded-lg border border-green-100">
          Account created! You can now sign in.
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
        <Input
          type="email"
          placeholder="you@company.com"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          autoFocus
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
        <div className="relative">
          <Input
            type={showPassword ? 'text' : 'password'}
            placeholder="••••••••"
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

      <Button type="submit" className="w-full gap-2" disabled={loading}>
        <LogIn className="w-4 h-4" />
        {loading ? 'Signing in…' : 'Sign in'}
      </Button>

      <div className="flex items-center justify-between text-sm text-slate-500">
        <span>New to Stocked?{' '}
          <Link href="/register" className="text-indigo-600 font-medium hover:underline">Start free</Link>
        </span>
        <Link href="/forgot-password" className="text-indigo-600 font-medium hover:underline">
          Forgot password?
        </Link>
      </div>
    </form>
  )
}

export default function LoginPage() {
  return (
    <Card className="shadow-xl border-0">
      <CardHeader className="pb-4">
        <CardTitle className="text-xl">Welcome back</CardTitle>
        <CardDescription>Good to see you again</CardDescription>
      </CardHeader>
      <CardContent>
        <Suspense fallback={<div className="h-48 animate-pulse bg-slate-50 rounded-lg" />}>
          <LoginForm />
        </Suspense>
      </CardContent>
    </Card>
  )
}
