'use client'

import { createContext, useContext, useMemo } from 'react'
import { DEFAULT_CURRENCY, formatMoney, formatMoneyShort, currencySymbol } from '@/lib/currency'

/**
 * The organization's currency, handed down from the dashboard layout, which
 * already loads the org row on every request.
 *
 * Deliberately a context rather than a module-level variable: in the app
 * router a client component also renders on the server, where module state is
 * shared between requests — one tenant's currency could briefly label another
 * tenant's figures.
 */
const CurrencyContext = createContext<string>(DEFAULT_CURRENCY)

export function CurrencyProvider({ currency, children }: { currency?: string | null; children: React.ReactNode }) {
  return (
    <CurrencyContext.Provider value={currency ?? DEFAULT_CURRENCY}>
      {children}
    </CurrencyContext.Provider>
  )
}

export function useCurrencyCode(): string {
  return useContext(CurrencyContext)
}

/**
 * Formatters bound to this organization's currency.
 *
 *   const { money } = useMoney()
 *   money(1200)        // ₱1,200.00 for a Philippine account
 */
export function useMoney() {
  const code = useContext(CurrencyContext)
  return useMemo(() => ({
    code,
    money:      (n: number | null | undefined) => formatMoney(n, code),
    moneyShort: (n: number | null | undefined) => formatMoneyShort(n, code),
    symbol:     currencySymbol(code),
  }), [code])
}
