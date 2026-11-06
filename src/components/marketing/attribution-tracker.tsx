'use client'

import { useEffect } from 'react'
import { captureAttribution } from '@/lib/attribution'

/**
 * Records first-touch UTM/referrer so a signup can be attributed to a channel.
 *
 * It renders nothing. It exists as its own component so the landing page
 * itself can stay a Server Component — this and the pricing toggle were the
 * only two things on it that needed the browser.
 */
export function AttributionTracker() {
  useEffect(() => { captureAttribution() }, [])
  return null
}
