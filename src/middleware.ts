import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

const PUBLIC_PATHS = ['/', '/login', '/register', '/auth/callback', '/forgot-password', '/reset-password', '/onboarding', '/privacy', '/terms', '/one-pager']

// H-1: API routes that use their own non-session auth (API key or cron secret).
// These are explicitly exempted from the central session check.
const API_EXEMPT_PATHS = [
  '/api/pos/sale',
  '/api/notifications/maintenance',
  '/api/auth/',
  '/api/billing/webhook',    // Stripe signature auth — no session required
  '/api/accounting/',        // Supports API key auth in addition to session
  '/api/jobledger/',         // Machine-to-machine: JOBLEDGER_API_KEY header auth
]

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Static assets + auth pages — pass through immediately
  if (
    pathname.startsWith('/_next/') ||
    pathname === '/favicon.ico' ||
    PUBLIC_PATHS.some(p => pathname.startsWith(p))
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

  // H-1: API routes — exempt specific paths, block everything else if unauthenticated.
  // Individual route handlers still perform their own role checks (defense-in-depth).
  if (pathname.startsWith('/api/')) {
    if (API_EXEMPT_PATHS.some(p => pathname.startsWith(p))) {
      return NextResponse.next()
    }

    // getUser() verifies the JWT with Supabase — more secure than getSession()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return response
  }

  // Page routes — redirect unauthenticated users to login
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Onboarding gate — redirect fresh signups to name their workspace.
  //
  // Strategy (zero extra DB queries):
  //   - Invited users have `org_id` in user_metadata (set by the invite flow) → skip
  //   - Users who completed onboarding have `onboarding_complete: true` in
  //     user_metadata (set by the onboarding page after a successful PATCH /api/org) → skip
  //   - Everyone else (fresh self-signup, org name still "My Company") → redirect
  //
  if (pathname !== '/onboarding' && !pathname.startsWith('/api/')) {
    const meta = user.user_metadata ?? {}
    const isInvited          = !!meta.org_id               // joined via invite link
    const onboardingComplete = meta.onboarding_complete === true

    if (!isInvited && !onboardingComplete) {
      return NextResponse.redirect(new URL('/onboarding', request.url))
    }
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
