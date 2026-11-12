import { NextResponse } from 'next/server'
import { OPEN_COUNT_STATUSES, frozenBy, freezeMessage, type OpenCount } from '@/lib/count-freeze'

/** Every count still open in this organization, with its location's name. */
export async function loadOpenCounts(supabase: any, orgId: string): Promise<OpenCount[]> {
  const { data, error } = await supabase
    .from('stock_counts')
    .select('location_id, count_number, location:locations(name)')
    .eq('org_id', orgId)
    .in('status', [...OPEN_COUNT_STATUSES])
  if (error) {
    // Failing to read the counts must not stop all stock movement; it is
    // logged, and the count's approval still checks its own figures.
    console.error('[count freeze] could not read open counts', error.message)
    return []
  }
  return (data ?? []).map((c: any) => ({
    location_id: c.location_id,
    count_number: c.count_number,
    location_name: c.location?.name ?? null,
  }))
}

/** The open count holding any of these locations, or null. */
export async function findCountFreeze(supabase: any, orgId: string, locationIds: (string | null | undefined)[]): Promise<OpenCount | null> {
  if (!locationIds.some(Boolean)) return null
  return frozenBy(await loadOpenCounts(supabase, orgId), locationIds)
}

/** A 409 to return when stock would move at a location being counted. */
export async function countFreezeRefusal(supabase: any, orgId: string, locationIds: (string | null | undefined)[]): Promise<NextResponse | null> {
  const c = await findCountFreeze(supabase, orgId, locationIds)
  return c ? NextResponse.json({ error: freezeMessage(c), count_number: c.count_number }, { status: 409 }) : null
}
