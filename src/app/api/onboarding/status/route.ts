import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAuth } from '@/lib/api-auth'

/**
 * GET /api/onboarding/status
 *
 * Returns an ordered, step-by-step setup guide so the app can show a
 * "Getting Started" experience to new owners (the dashboard widget and the
 * "Start here" tab on the Setup page both consume this).
 *
 * Each step carries a short description, a deep link into the right Setup tab
 * (or page), whether it's required or optional, and a rough time estimate.
 *
 * Backward-compatible: keeps `label`, `done`, `href`, `steps`,
 * `completedCount`, `totalSteps`, and `allDone` for the existing widget.
 */
export async function GET() {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const supabase = createServiceClient()

  const [
    { data: org },
    { count: locationCount },
    { count: categoryCount },
    { count: productCount  },
    { count: supplierCount },
    { count: userCount     },
    { count: assetCount    },
    { count: txnCount      },
  ] = await Promise.all([
    supabase.from('organizations').select('name').eq('id', auth.orgId).single(),
    supabase.from('locations')             .select('*', { count: 'exact', head: true }).eq('org_id', auth.orgId),
    supabase.from('categories')            .select('*', { count: 'exact', head: true }).eq('org_id', auth.orgId),
    supabase.from('products')              .select('*', { count: 'exact', head: true }).eq('org_id', auth.orgId).eq('is_active', true),
    supabase.from('suppliers')             .select('*', { count: 'exact', head: true }).eq('org_id', auth.orgId),
    supabase.from('user_profiles')         .select('*', { count: 'exact', head: true }).eq('org_id', auth.orgId),
    supabase.from('fixed_assets')          .select('*', { count: 'exact', head: true }).eq('org_id', auth.orgId),
    supabase.from('inventory_transactions').select('*', { count: 'exact', head: true }).eq('org_id', auth.orgId),
  ])

  const named = !!org?.name && org.name.trim() !== '' && org.name.trim() !== 'My Company'

  // Ordered — the recommended path a new owner should follow.
  const steps = [
    {
      id:          'company',
      label:       'Name your company',
      description: 'Set your business name — it appears on reports, purchase orders, and team invites.',
      done:        named,
      href:        '/settings?tab=general',
      cta:         'Set name',
      optional:    false,
      estMin:      1,
    },
    {
      id:          'location',
      label:       'Add storage locations',
      description: 'Where you keep stock and assets — warehouses, storerooms, vehicles, or job sites.',
      done:        (locationCount ?? 0) > 0,
      href:        '/setup?tab=locations',
      cta:         'Add locations',
      optional:    false,
      estMin:      3,
    },
    {
      id:          'category',
      label:       'Create categories',
      description: 'Group your products and assets so you can filter and report on them.',
      done:        (categoryCount ?? 0) > 0,
      href:        '/setup?tab=categories',
      cta:         'Add categories',
      optional:    false,
      estMin:      2,
    },
    {
      id:          'supplier',
      label:       'Add vendors / suppliers',
      description: 'The suppliers you buy from — needed to raise purchase orders and receive stock.',
      done:        (supplierCount ?? 0) > 0,
      href:        '/setup?tab=vendors',
      cta:         'Add vendors',
      optional:    false,
      estMin:      3,
    },
    {
      id:          'product',
      label:       'Import your products',
      description: 'Bulk-import your catalog from CSV/Excel, or add items one at a time.',
      done:        (productCount ?? 0) > 0,
      href:        '/setup?tab=products',
      cta:         'Add products',
      optional:    false,
      estMin:      5,
    },
    {
      id:          'stock',
      label:       'Record opening stock',
      description: 'Enter what you currently have on hand so balances and valuation start accurate.',
      done:        (txnCount ?? 0) > 0,
      href:        '/transactions/new',
      cta:         'Record stock',
      optional:    false,
      estMin:      5,
    },
    {
      id:          'asset',
      label:       'Add fixed assets & tools',
      description: 'Track equipment and tools with depreciation and check-in / check-out custody.',
      done:        (assetCount ?? 0) > 0,
      href:        '/setup?tab=assets',
      cta:         'Add assets',
      optional:    true,
      estMin:      5,
    },
    {
      id:          'team',
      label:       'Invite your team',
      description: 'Add coworkers and assign roles so they can log stock and receive purchase orders.',
      done:        (userCount ?? 0) > 1,
      href:        '/settings?tab=users',
      cta:         'Invite team',
      optional:    true,
      estMin:      2,
    },
  ]

  const requiredSteps  = steps.filter(s => !s.optional)
  const completedCount = steps.filter(s => s.done).length
  const requiredDone   = requiredSteps.filter(s => s.done).length

  return NextResponse.json({
    steps,
    completedCount,
    totalSteps:     steps.length,
    requiredDone,
    requiredTotal:  requiredSteps.length,
    // Hide the nudge once the essentials are done (optional steps don't block).
    allDone:        requiredDone === requiredSteps.length,
  })
}
