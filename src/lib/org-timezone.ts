'server only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { DEFAULT_TIME_ZONE, isValidTimeZone, todayInZone } from '@/lib/dates'
import { createServiceClient } from '@/lib/supabase/service'

/** Today's date ('YYYY-MM-DD') for the organization, in its own time zone. */
export async function orgToday(orgId: string | null | undefined): Promise<string> {
  return todayInZone(await getOrgTimeZone(createServiceClient(), orgId))
}

/**
 * The organization's time zone (IANA name), for working out "today" and day
 * boundaries on the server. UTC when it hasn't been set yet, or if the column
 * doesn't exist (database not migrated): the old behaviour, never an error.
 */
export async function getOrgTimeZone(supabase: SupabaseClient, orgId: string | null | undefined): Promise<string> {
  if (!orgId) return DEFAULT_TIME_ZONE
  try {
    const { data, error } = await supabase.from('organizations').select('timezone').eq('id', orgId).maybeSingle()
    if (error) return DEFAULT_TIME_ZONE
    const tz = (data as { timezone?: string | null } | null)?.timezone
    return isValidTimeZone(tz) ? tz : DEFAULT_TIME_ZONE
  } catch {
    return DEFAULT_TIME_ZONE
  }
}
