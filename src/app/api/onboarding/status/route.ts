import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAuth } from '@/lib/api-auth'

/**
 * GET /api/onboarding/status
 *
 * Returns a checklist of first-run setup steps so the dashboard
 * can show a "Getting Started" guide to new users.
 */
export async function GET() {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const supabase = createServiceClient()

  const [
    { count: locationCount },
    { count: categoryCount },
    { count: productCount  },
    { count: userCount     },
    { count: supplierCount },
  ] = await Promise.all([
    supabase.from('locations')    .select('*', { count: 'exact', head: true }).eq('org_id', auth.orgId),
    supabase.from('categories')   .select('*', { count: 'exact', head: true }).eq('org_id', auth.orgId),
    supabase.from('products')     .select('*', { count: 'exact', head: true }).eq('org_id', auth.orgId).eq('is_active', true),
    supabase.from('user_profiles').select('*', { count: 'exact', head: true }).eq('org_id', auth.orgId),
    supabase.from('suppliers')    .select('*', { count: 'exact', head: true }).eq('org_id', auth.orgId),
  ])

  const steps = [
    {
      id:       'location',
      label:    'Add a storage location',
      done:     (locationCount ?? 0) > 0,
      href:     '/locations',
      priority: 1,
    },
    {
      id:       'category',
      label:    'Create a product category',
      done:     (categoryCount ?? 0) > 0,
      href:     '/inventory',
      priority: 2,
    },
    {
      id:       'product',
      label:    'Add your first inventory item',
      done:     (productCount ?? 0) > 0,
      href:     '/inventory/new',
      priority: 3,
    },
    {
      id:       'supplier',
      label:    'Add a supplier',
      done:     (supplierCount ?? 0) > 0,
      href:     '/suppliers',
      priority: 4,
    },
    {
      id:       'team',
      label:    'Invite a team member',
      done:     (userCount ?? 0) > 1,        // >1 means someone else was invited
      href:     '/settings?tab=users',
      priority: 5,
    },
  ]

  const completedCount = steps.filter(s => s.done).length
  const allDone        = completedCount === steps.length

  return NextResponse.json({ steps, completedCount, totalSteps: steps.length, allDone })
}
