/**
 * What each kind of API key connects. Safe to import in the browser (no
 * crypto); key generation and hashing live in api-keys.ts (server only).
 */
import type { Feature } from '@/lib/entitlements'

export const API_KEY_SCOPES = ['pos', 'accounting', 'jobledger'] as const
export type ApiKeyScope = (typeof API_KEY_SCOPES)[number]

export const SCOPE_INFO: Record<ApiKeyScope, {
  label: string
  description: string
  feature: Feature
  endpoints: string[]
}> = {
  pos: {
    label: 'Point of sale',
    description: 'Lets a till or online shop deduct stock when it sells.',
    feature: 'integrations',
    endpoints: ['POST /api/pos/sale'],
  },
  accounting: {
    label: 'Accounting',
    description: 'Lets your bookkeeping app read the journal and payables feeds.',
    feature: 'accounting_sync',
    endpoints: ['GET /api/accounting/journal', 'GET /api/accounting/payables'],
  },
  jobledger: {
    label: 'JobLedger',
    description: 'Lets JobLedger read products, job materials and job readiness.',
    feature: 'integrations',
    endpoints: ['GET /api/jobledger/products', 'GET /api/jobledger/materials', 'POST /api/jobledger/readiness'],
  },
}

export function isApiKeyScope(v: unknown): v is ApiKeyScope {
  return typeof v === 'string' && (API_KEY_SCOPES as readonly string[]).includes(v)
}
