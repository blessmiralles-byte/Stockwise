import { describe, it, expect } from 'vitest'
import {
  CURRENCIES, DEFAULT_CURRENCY, isSupportedCurrency, currencyOf,
  formatMoney, formatMoneyShort, currencySymbol,
} from '@/lib/currency'

describe('the currency list', () => {
  it('offers the markets Stocked sells into', () => {
    const codes = CURRENCIES.map(c => c.code)
    for (const expected of ['USD', 'PHP', 'AUD', 'SGD', 'MYR', 'IDR', 'THB', 'VND', 'GBP', 'EUR']) {
      expect(codes, `${expected} missing`).toContain(expected)
    }
  })

  it('lists each currency once, with a valid ISO code', () => {
    const codes = CURRENCIES.map(c => c.code)
    expect(new Set(codes).size).toBe(codes.length)
    for (const c of CURRENCIES) expect(c.code).toMatch(/^[A-Z]{3}$/)
  })

  it('defaults to USD, which is what every existing account has been seeing', () => {
    expect(DEFAULT_CURRENCY).toBe('USD')
    expect(currencyOf(null).code).toBe('USD')
    expect(currencyOf('NOPE').code).toBe('USD')
  })

  it('accepts a known code in any case, and rejects nonsense', () => {
    expect(isSupportedCurrency('php')).toBe(true)
    expect(isSupportedCurrency('PHP')).toBe(true)
    expect(isSupportedCurrency('XYZ')).toBe(false)
    expect(isSupportedCurrency(null)).toBe(false)
    expect(isSupportedCurrency(42)).toBe(false)
  })
})

describe('formatting', () => {
  it('uses the right symbol for the currency', () => {
    expect(formatMoney(1200, 'PHP')).toContain('₱')
    expect(formatMoney(1200, 'USD')).toContain('$')
    expect(formatMoney(1200, 'GBP')).toContain('£')
  })

  // The bug this replaces: a peso amount rendered with a dollar sign.
  it('never labels one currency with another’s symbol', () => {
    expect(formatMoney(1200, 'PHP')).not.toContain('$')
    expect(formatMoney(1200, 'JPY')).not.toContain('$')
  })

  // Yen and dong have no minor unit at all, so Intl writes none. Rupiah does
  // have one in ISO 4217 (even though shops rarely print it), and we follow
  // the standard rather than second-guessing it.
  it('omits decimals for currencies that have no minor unit', () => {
    for (const code of ['JPY', 'VND']) {
      expect(formatMoney(1500, code), code).not.toMatch(/[.,]\d\d\b/)
    }
  })

  it('keeps cents where they exist', () => {
    expect(formatMoney(12.34, 'USD')).toContain('34')
    expect(formatMoney(12.34, 'PHP')).toContain('34')
  })

  it('rounds to whole units in the short form', () => {
    expect(formatMoneyShort(1234.56, 'USD')).not.toContain('.56')
  })

  it('treats nothing as zero rather than printing NaN', () => {
    for (const bad of [null, undefined, NaN]) {
      expect(formatMoney(bad as any, 'USD')).toContain('0')
      expect(formatMoney(bad as any, 'USD')).not.toContain('NaN')
    }
  })

  it('handles negatives and large numbers', () => {
    expect(formatMoney(-50, 'USD')).toMatch(/-|\(/)
    expect(formatMoney(1234567, 'USD')).toMatch(/1[.,]234[.,]567/)
  })

  it('falls back to dollars for an unknown code rather than throwing', () => {
    expect(() => formatMoney(10, 'XYZ')).not.toThrow()
    expect(formatMoney(10, 'XYZ')).toContain('$')
  })
})

describe('symbols', () => {
  it('gives the symbol alone, for input prefixes', () => {
    expect(currencySymbol('PHP')).toBe('₱')
    expect(currencySymbol('USD')).toBe('$')
    expect(currencySymbol(null)).toBe('$')
  })

  it('returns something printable for every currency offered', () => {
    for (const c of CURRENCIES) {
      const sym = currencySymbol(c.code)
      expect(sym.length, c.code).toBeGreaterThan(0)
    }
  })
})
