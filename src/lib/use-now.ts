'use client'

import { useState } from 'react'

/**
 * The time when the component first rendered, in milliseconds. Use instead of
 * Date.now() in render code ("is this overdue?") so every render agrees.
 */
export function useNow(): number {
  const [now] = useState(() => Date.now())
  return now
}
