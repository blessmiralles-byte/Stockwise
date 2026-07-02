import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAuth } from '@/lib/api-auth'

/**
 * GET /api/stock-counts/my-confirmations
 *
 * Stock counts where the current user is a listed attendee still awaiting
 * their confirmation. Used by the mobile app's "Pending confirmations" screen
 * so users can find count requests without relying on the push notification.
 */
export async function GET() {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const supabase = createServiceClient()

  const { data: rows, error } = await supabase
    .from('stock_count_attendees')
    .select(`
      id, confirmation_status,
      count:stock_counts(
        id, count_number, status, created_at,
        location:locations(id, name)
      )
    `)
    .eq('user_id', auth.userId)
    .eq('confirmation_status', 'pending')

  if (error) {
    console.error('[GET /api/stock-counts/my-confirmations]', error)
    return NextResponse.json({ error: 'Failed to fetch confirmations' }, { status: 500 })
  }

  // Only surface counts that are actively in progress / under review
  const data = (rows ?? [])
    .map((r: any) => r.count)
    .filter((c: any) => c && ['open', 'counting', 'reviewing'].includes(c.status))
    .sort((a: any, b: any) => (a.created_at < b.created_at ? 1 : -1))

  return NextResponse.json({ data })
}
