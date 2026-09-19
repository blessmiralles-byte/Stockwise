/**
 * Small helpers shared by the approval chain (lib/approval-chain.ts), which is
 * where reporting-line routing and approval-limit enforcement live.
 */

/** Owners/admins have unlimited approval authority. */
export function isUnlimited(role?: string): boolean {
  return role === 'owner' || role === 'admin'
}

/** Sum of quantity × unit_cost across line items. */
export function sumLineValue(
  items: any[] | null | undefined,
  qtyKey = 'quantity',
  costKey = 'unit_cost',
): number {
  return (items ?? []).reduce(
    (s, it) => s + Number(it?.[qtyKey] ?? 0) * Number(it?.[costKey] ?? 0),
    0,
  )
}

export function fmtMoney(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}
