import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount)
}

export function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  })
}

/**
 * Max quantity still receivable against a PO line, including the supplier's
 * over-receipt tolerance. Shared by the receive API and the GRN dialog so the
 * server cap and the UI hint can never diverge.
 */
export function receivableCap(ordered: number, already: number, tolerancePct = 0): number {
  return Math.max(0, Math.floor(ordered * (1 + tolerancePct / 100)) - already)
}

/** Clamp an over-receipt tolerance to a valid percentage [0, 100]; 0 = strict. */
export function clampTolerance(v: unknown): number {
  const n = Number(v)
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.min(n, 100)
}
