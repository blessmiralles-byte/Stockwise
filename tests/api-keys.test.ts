import { describe, it, expect } from 'vitest'
import {
  generateApiKey, hashApiKey, looksLikeApiKey, scopeOfKey, keyPrefix, apiKeyFromHeader,
  API_KEY_SCOPES, SCOPE_INFO, isApiKeyScope,
} from '@/lib/api-keys'

describe('per-organization API keys', () => {
  it('makes a well-formed key for each scope, with its hash and a short prefix', () => {
    for (const scope of API_KEY_SCOPES) {
      const { key, hash, prefix } = generateApiKey(scope)
      expect(looksLikeApiKey(key)).toBe(true)
      expect(scopeOfKey(key)).toBe(scope)
      expect(hash).toBe(hashApiKey(key))
      expect(hash).toMatch(/^[0-9a-f]{64}$/)
      expect(key.startsWith(prefix)).toBe(true)
      expect(prefix).toBe(`stk_${scope}_` + key.slice(`stk_${scope}_`.length, `stk_${scope}_`.length + 6))
    }
  })

  it('never makes the same key twice', () => {
    const seen = new Set(Array.from({ length: 200 }, () => generateApiKey('pos').key))
    expect(seen.size).toBe(200)
  })

  // The prefix is shown on screen and stored in clear; it must not give the key away.
  it('keeps the prefix far shorter than the secret part', () => {
    const { key, prefix } = generateApiKey('accounting')
    expect(key.length - prefix.length).toBeGreaterThanOrEqual(37)
  })

  it('reads a key from a Bearer header, and nothing else', () => {
    const { key } = generateApiKey('jobledger')
    expect(apiKeyFromHeader(`Bearer ${key}`)).toBe(key)
    expect(apiKeyFromHeader(`bearer ${key}`)).toBe(key)
    expect(apiKeyFromHeader(key)).toBeNull()                       // no "Bearer"
    expect(apiKeyFromHeader('Bearer eyJhbGciOi.session.jwt')).toBeNull() // a login token, not a key
    expect(apiKeyFromHeader('Bearer old-shared-secret')).toBeNull()
    expect(apiKeyFromHeader(null)).toBeNull()
  })

  it('rejects keys with an unknown scope or the wrong length', () => {
    const { key } = generateApiKey('pos')
    expect(looksLikeApiKey(key.replace('stk_pos_', 'stk_admin_'))).toBe(false)
    expect(looksLikeApiKey(key.slice(0, -1))).toBe(false)
    expect(looksLikeApiKey(key + 'x')).toBe(false)
    expect(scopeOfKey('stk_pos_short')).toBeNull()
  })

  it('maps each scope to the plan feature that unlocks it', () => {
    expect(SCOPE_INFO.pos.feature).toBe('integrations')
    expect(SCOPE_INFO.jobledger.feature).toBe('integrations')
    expect(SCOPE_INFO.accounting.feature).toBe('accounting_sync')
    expect(isApiKeyScope('pos')).toBe(true)
    expect(isApiKeyScope('admin')).toBe(false)
  })
})
