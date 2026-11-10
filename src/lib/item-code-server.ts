import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Which item, if any, in this organization already uses a code or barcode.
 *
 * Asked before writing so a clash can be explained — "PLB-0001 is already the
 * code for Teflon tape" — instead of surfacing as a bare duplicate-key error.
 * The unique index stays the real guard; this only makes the refusal useful.
 */
export async function findCodeHolder(
  supabase: SupabaseClient,
  orgId: string,
  field: 'sku' | 'barcode',
  value: string,
  exceptId?: string,
): Promise<{ id: string; name: string } | null> {
  let q = supabase
    .from('products')
    .select('id, name')
    .eq('org_id', orgId)
    .eq(field, value)
    .limit(1)
  if (exceptId) q = q.neq('id', exceptId)
  const { data } = await q.maybeSingle()
  return data ? { id: (data as any).id, name: (data as any).name ?? 'another item' } : null
}

/**
 * Which column a duplicate-key error (23505) on products was about, read from
 * the index name Postgres reports. Used when a clash slips past the check
 * above — two people saving at the same moment.
 */
export function clashedField(error: { message?: string; details?: string } | null | undefined): 'sku' | 'barcode' | null {
  const text = `${error?.message ?? ''} ${error?.details ?? ''}`
  if (/barcode/i.test(text)) return 'barcode'
  if (/sku/i.test(text))     return 'sku'
  return null
}

export function clashMessage(field: 'sku' | 'barcode' | null, holderName?: string): string {
  const who = holderName ? ` — ${holderName}` : ''
  if (field === 'barcode') return `You already have an item with that barcode${who}.`
  if (field === 'sku')     return `You already have an item with that code${who}.`
  return 'You already have an item with that code or barcode.'
}
