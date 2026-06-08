import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

const PUBLIC_PATHS = ['/', '/login', '/register', '/auth/callback', '/forgot-password', '/reset-password', '/onboarding', '/privacy', '/terms', '/one-pager']

// API routes that use their own non-session auth (API key or cron secret).
const API_EXEMPT_PATHS = [
  '/api/pos/sale',
  '/api/notifications/maintenance',
  '/api/auth/',
  '/api/billing/webhook',
  '/api/accounting/',
  '/api/jobledger/',
]

// Update last_seen_at at most once per minute per user to avoid hammering the DB
// on every page navigation. Uses a lightweight in-memory set of "userId:minute" keys.
const seenThisMinute = new Set<string>()
setInterval(() => seenThisMinute.clear(), 60_000)

async function touchLastSeen(userId: string) {
  const key = `${userId}:${Math.floor(Date.now() / 60_000)}`
  if (seenThisMinute.has(key)) return
  seenThisMinute.add(key)

  const url   = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const token = process.env.SUPABASE_SERVICE_ROLE_KEY!
  // Fire-and-forget — don't await, don't block the response
  fetch(`${url}/rest/v1/user_profiles?id=eq.${userId}`, {
    method:  'PATCH',
    headers: {
      apikey:          token,
      Authorization:   `Bearer ${token}`,
      'Content-Type':  'application/json',
      Prefer:          'return=minimal',
    },
    body: JSON.stringify({ last_seen_at: new Date().toISOString() }),
  }).catch(() => { /* non-critical */ })
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Static assets + public pages — pass through immediately
  if (
    pathname.startsWith('/_next/') ||
    pathname === '/favicon.ico' ||
    PUBLIC_PATHS.some(p => pathname === p || (p !== '/' && pathname.startsWith(p)))
  ) {
    return NextResponse.next()
  }

  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // API routes — exempt specific paths, block everything else if unauthenticated
  if (pathname.startsWith('/api/')) {
    if (API_EXEMPT_PATHS.some(p => pathname.startsWith(p))) {
      return NextResponse.next()
    }
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    touchLastSeen(user.id)
    return response
  }

  // Page routes — redirect unauthenticated users to login
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Onboarding gate
  if (pathname !== '/onboarding' && !pathname.startsWith('/api/')) {
    const meta = user.user_metadata ?? {}
    const isInvited          = !!meta.org_id
    const onboardingComplete = meta.onboarding_complete === true
    if (!isInvited && !onboardingComplete) {
      return NextResponse.redirect(new URL('/onboarding', request.url))
    }
  }

  touchLastSeen(user.id)
  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
