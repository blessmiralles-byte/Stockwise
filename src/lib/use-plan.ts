'use client'

import { useEffect, useState } from 'react'
import { type Feature, planHasFeature } from '@/lib/entitlements'

// One fetch per page load, shared by every component that asks.
let planPromise: Promise<string | null> | null = null

function loadPlan(): Promise<string | null> {
  planPromise ??= fetch('/api/org')
    .then(r => (r.ok ? r.json() : null))
    .then(j => j?.data?.plan ?? null)
    .catch(() => { planPromise = null; return null })
  return planPromise
}

/**
 * The org's plan on the client, for showing badges and disabling locked
 * controls. `has()` returns true until the plan is known so nothing flickers
 * locked for paying customers; the server enforces the real rule regardless.
 */
export function usePlan() {
  const [plan, setPlan] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    loadPlan().then(p => { if (!cancelled) { setPlan(p); setLoaded(true) } })
    return () => { cancelled = true }
  }, [])

  return {
    plan,
    loaded,
    has: (feature: Feature) => !loaded || planHasFeature(plan, feature),
  }
}
