'use client'

import { useEffect } from 'react'
import { deviceTimeZone } from '@/lib/dates'

/**
 * Rendered only while the organization has no time zone: reports this
 * browser's zone once, so the server's "today" matches the customer's day.
 * The server ignores it if a zone was set in the meantime.
 */
export function TimeZoneSync() {
  useEffect(() => {
    const timezone = deviceTimeZone()
    if (!timezone) return
    fetch('/api/org/timezone', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timezone }),
    }).catch(() => { /* best effort; tried again on the next page load */ })
  }, [])
  return null
}
