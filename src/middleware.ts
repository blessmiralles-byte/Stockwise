import { NextRequest, NextResponse } from 'next/server'
// import { createServerClient } from '@supabase/ssr'

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

// TEMP DEBUG: passthrough everything to isolate routing issue
export async function middleware(request: NextRequest) {
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
