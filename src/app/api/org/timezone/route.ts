import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAuth } from '@/lib/api-auth'
import { isValidTimeZone } from '@/lib/dates'

/**
 * POST /api/org/timezone  { timezone: 'Asia/Manila' }
 *
 * Fills in the organization's time zone from the first signed-in browser,
 * so nobody has to set it. Only when none is set yet: changing an existing
 * zone is the owner's choice, through PATCH /api/org on the Settings page.
 * Returns { timezone } — the zone now in effect.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  if (!auth.orgId) return NextResponse.json({ error: 'No organization found' }, { status: 404 })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }
  if (!isValidTimeZone(body?.timezone)) {
    return NextResponse.json({ error: 'Unknown time zone' }, { status: 422 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('organizations')
    .update({ timezone: body.timezone })
    .eq('id', auth.orgId)
    .is('timezone', null)
    .select('timezone')

  if (error) {
    console.error('[POST /api/org/timezone]', error.message)
    return NextResponse.json({ error: 'Could not save the time zone' }, { status: 500 })
  }
  if (data?.length) return NextResponse.json({ timezone: data[0].timezone, set: true })

  const { data: org } = await supabase.from('organizations').select('timezone').eq('id', auth.orgId).single()
  return NextResponse.json({ timezone: org?.timezone ?? null, set: false })
}
