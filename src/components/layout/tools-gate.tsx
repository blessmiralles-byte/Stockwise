'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { toolsPageAllowed, TOOLS_HOME } from '@/lib/entitlements'

/**
 * Keeps a Stocked Tools account inside the tool tracker.
 *
 * Wraps the dashboard's pages for those accounts only. Anything outside the
 * allow-list — the post-login /dashboard, an old bookmark, a link in a
 * notification — renders nothing and moves them to their tools.
 *
 * This is done here in the browser, not with redirect() in the server layout.
 * That was tried first: the login page does router.push() followed by
 * router.refresh(), and a server redirect in the middle of that pair looped
 * forever on a blank page. A layout also doesn't re-run on in-app navigation,
 * so the server could only ever have caught full page loads.
 *
 * It decides what is shown, not what is permitted: the API refuses these
 * accounts the data regardless (lib/api-auth.ts).
 */
export function ToolsGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router   = useRouter()
  const allowed  = toolsPageAllowed(pathname)

  useEffect(() => {
    if (!allowed) router.replace(TOOLS_HOME)
  }, [allowed, router])

  return allowed ? <>{children}</> : null
}
