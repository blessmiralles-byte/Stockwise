/**
 * The currency an organization records its money in.
 *
 * This is a label, not a conversion: Stocked never converts between
 * currencies. An organization buys and sells in one currency, and every amount
 * it enters is in that currency. Saying so stops a Philippine contractor's
 * ₱1,200 part appearing as "$1,200" — which matters most when someone is
 * approving spend against a limit.
 */

export interface Currency {
  code: string
  name: string
  /** Locale used to place the symbol and group digits the way that market expects. */
  locale: string
}

/** Offered in Settings. Ordered by who is most likely to be using Stocked. */
export const CURRENCIES: Currency[] = [
  { code: 'USD', name: 'US Dollar',          locale: 'en-US' },
  { code: 'PHP', name: 'Philippine Peso',    locale: 'en-PH' },
  { code: 'AUD', name: 'Australian Dollar',  locale: 'en-AU' },
  { code: 'NZD', name: 'New Zealand Dollar', locale: 'en-NZ' },
  { code: 'SGD', name: 'Singapore Dollar',   locale: 'en-SG' },
  { code: 'MYR', name: 'Malaysian Ringgit',  locale: 'ms-MY' },
  { code: 'IDR', name: 'Indonesian Rupiah',  locale: 'id-ID' },
  { code: 'THB', name: 'Thai Baht',          locale: 'th-TH' },
  { code: 'VND', name: 'Vietnamese Dong',    locale: 'vi-VN' },
  { code: 'GBP', name: 'Pound Sterling',     locale: 'en-GB' },
  { code: 'EUR', name: 'Euro',               locale: 'de-DE' },
  { code: 'CAD', name: 'Canadian Dollar',    locale: 'en-CA' },
  { code: 'AED', name: 'UAE Dirham',         locale: 'en-AE' },
  { code: 'SAR', name: 'Saudi Riyal',        locale: 'en-SA' },
  { code: 'INR', name: 'Indian Rupee',       locale: 'en-IN' },
  { code: 'ZAR', name: 'South African Rand', locale: 'en-ZA' },
  { code: 'HKD', name: 'Hong Kong Dollar',   locale: 'en-HK' },
  { code: 'JPY', name: 'Japanese Yen',       locale: 'ja-JP' },
]

export const DEFAULT_CURRENCY = 'USD'

const BY_CODE = new Map(CURRENCIES.map(c => [c.code, c]))

export function isSupportedCurrency(code: unknown): code is string {
  return typeof code === 'string' && BY_CODE.has(code.toUpperCase())
}

export function currencyOf(code: string | null | undefined): Currency {
  return BY_CODE.get((code ?? '').toUpperCase()) ?? BY_CODE.get(DEFAULT_CURRENCY)!
}

/**
 * Format an amount in a given currency.
 *
 * Intl handles the parts that are easy to get wrong: ₱ before the number,
 * € after it in German, and no decimal places at all for yen, dong or rupiah,
 * where fractions of a unit do not exist.
 */
export function formatMoney(amount: number | null | undefined, code: string | null | undefined): string {
  const c = currencyOf(code)
  const n = Number(amount ?? 0)
  return new Intl.NumberFormat(c.locale, {
    style: 'currency',
    currency: c.code,
  }).format(Number.isFinite(n) ? n : 0)
}

/** The same, rounded to whole units — for headline figures and approval limits. */
export function formatMoneyShort(amount: number | null | undefined, code: string | null | undefined): string {
  const c = currencyOf(code)
  const n = Number(amount ?? 0)
  return new Intl.NumberFormat(c.locale, {
    style: 'currency',
    currency: c.code,
    maximumFractionDigits: 0,
  }).format(Number.isFinite(n) ? n : 0)
}

/** Just the symbol, for input prefixes and column headers. */
export function currencySymbol(code: string | null | undefined): string {
  const c = currencyOf(code)
  const parts = new Intl.NumberFormat(c.locale, { style: 'currency', currency: c.code })
    .formatToParts(0)
  return parts.find(p => p.type === 'currency')?.value ?? c.code
}
