/**
 * Per-organization API keys (HANDOFF.md, Launch audit A3).
 *
 * A key belongs to ONE organization and ONE scope. The key itself decides the
 * company: callers can't name another company's id and get its data, which is
 * what the old shared POS_API_KEY / ACCOUNTING_API_KEY / JOBLEDGER_API_KEY did.
 *
 * Format: `stk_<scope>_<43 base64url chars>` (32 random bytes). Only a SHA-256
 * hash is stored; the full key is shown once at creation.
 *
 * Pure helpers only — no database. Server lookups live in api-keys-server.ts.
 */
import crypto from 'crypto'
import type { ApiKeyScope } from '@/lib/api-key-scopes'

export { API_KEY_SCOPES, SCOPE_INFO, isApiKeyScope, type ApiKeyScope } from '@/lib/api-key-scopes'

const KEY_RE = /^stk_(pos|accounting|jobledger)_[A-Za-z0-9_-]{43}$/

/** True for anything shaped like one of our keys (cheap check before any database lookup). */
export function looksLikeApiKey(v: string | null | undefined): v is string {
  return typeof v === 'string' && KEY_RE.test(v)
}

/** The scope written into a well-formed key, or null. */
export function scopeOfKey(key: string): ApiKeyScope | null {
  const m = KEY_RE.exec(key)
  return m ? (m[1] as ApiKeyScope) : null
}

export function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key, 'utf8').digest('hex')
}

/** First characters of the key: enough to tell keys apart, useless to an attacker. */
export function keyPrefix(key: string): string {
  const scope = scopeOfKey(key)
  const head  = scope ? `stk_${scope}_` : ''
  return head + key.slice(head.length, head.length + 6)
}

export function generateApiKey(scope: ApiKeyScope): { key: string; hash: string; prefix: string } {
  const key = `stk_${scope}_${crypto.randomBytes(32).toString('base64url')}`
  return { key, hash: hashApiKey(key), prefix: keyPrefix(key) }
}

/** The key from an `Authorization: Bearer …` header, if it is one of ours. */
export function apiKeyFromHeader(header: string | null | undefined): string | null {
  if (!header) return null
  const m = /^Bearer\s+(\S+)$/i.exec(header.trim())
  return m && looksLikeApiKey(m[1]) ? m[1] : null
}
