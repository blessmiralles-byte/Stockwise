'use client'

import { useEffect, useState, useCallback } from 'react'

/**
 * Fetch JSON from `url` (null = don't fetch). The last finished request is kept
 * together with the url it answered, and `loading` is worked out from that, so
 * nothing has to be reset inside the effect (which rendered every page twice).
 *
 * While a new url loads, the previous data stays on screen, as before; the
 * error is only shown for the request it belongs to.
 */
export function useApi<T>(url: string | null) {
  const [tick, setTick] = useState(0)
  const [result, setResult] = useState<{ key: string; data: T | null; error: string | null }>(
    { key: '', data: null, error: null },
  )
  const key = url ? `${tick}|${url}` : ''

  useEffect(() => {
    if (!url) return
    let cancelled = false
    fetch(url)
      .then(r => r.json())
      .then(json => { if (!cancelled) setResult({ key, data: json, error: null }) })
      .catch(e => { if (!cancelled) setResult(prev => ({ key, data: prev.data, error: e.message })) })
    return () => { cancelled = true }
  }, [url, key])

  const refetch = useCallback(() => setTick(t => t + 1), [])

  return {
    data:    url ? result.data : null,
    loading: !!url && result.key !== key,
    error:   url && result.key === key ? result.error : null,
    refetch,
  }
}
