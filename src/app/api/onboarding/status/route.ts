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
    supabase.from('organizations').select('name, sample_data, require_checkout_approval').eq('id', auth.orgId).single(),
    supabase.from('locations')             .select('*', { count: 'exact', head: true }).eq('org_id', auth.orgId),
    supabase.from('categories')            .select('*', { count: 'exact', head: true }).eq('org_id', auth.orgId),
    supabase.from('products')              .select('*', { count: 'exact', head: true }).eq('org_id', auth.orgId).eq('is_active', true),
    supabase.from('suppliers')             .select('*', { count: 'exact', head: true }).eq('org_id', auth.orgId),
    supabase.from('user_profiles')         .select('*', { count: 'exact', head: true }).eq('org_id', auth.orgId),
    supabase.from('fixed_assets')          .select('*', { count: 'exact', head: true }).eq('org_id', auth.orgId),
    supabase.from('inventory_transactions').select('*', { count: 'exact', head: true }).eq('org_id', auth.orgId),
  ])

  // Newer features worth pointing at once the basics are in place.
  const [{ count: stockedCount }, { count: reportsToCount }] = await Promise.all([
    supabase.from('products').select('*', { count: 'exact', head: true })
      .eq('org_id', auth.orgId).eq('keep_in_stock', true),
    supabase.from('user_profiles').select('*', { count: 'exact', head: true })
      .eq('org_id', auth.orgId).not('reports_to', 'is', null),
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
      description: 'Everywhere stock sits - warehouse, storeroom, each van. Knowing which van has the part is half the value.',
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
      label:       'Add vendors',
      description: 'Who you buy from, with their lead times. Set a preferred vendor on each product and reorder drafts group themselves by supplier.',
      done:        (supplierCount ?? 0) > 0,
      href:        '/setup?tab=vendors',
      cta:         'Add vendors',
      optional:    false,
      estMin:      3,
    },
    {
      id:          'product',
      label:       'Import your products',
      description: 'Bring in your catalogue from a spreadsheet - name, SKU and unit are enough to start. Tick "keep in stock" on the ones you always hold.',
      done:        (productCount ?? 0) > 0,
      href:        '/setup?tab=products',
      cta:         'Add products',
      optional:    false,
      estMin:      5,
    },
    {
      id:          'stock',
      label:       'Record opening stock',
      description: 'Count what you have on hand today. From here the balances stay right on their own, because every receipt and issue updates them.',
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
      description: 'Your crew logs materials from their phone; roles decide what each person can do. The person who orders cannot approve the receipt.',
      done:        (userCount ?? 0) > 1,
      href:        '/settings?tab=users',
      cta:         'Invite team',
      optional:    true,
      estMin:      2,
    },
    {
      id:          'reorder',
      label:       'Set reorder points',
      description: 'Tick "keep this item in stock" and give it a level. Procurement is emailed when stock drops, and can raise the purchase order in a click.',
      done:        (stockedCount ?? 0) > 0,
      href:        '/setup?tab=products',
      cta:         'Set levels',
      optional:    true,
      estMin:      4,
    },
    {
      id:          'approvals',
      label:       'Set who approves what',
      description: 'Give each person a manager and a spending limit. Requests climb the line until someone has the authority to sign them off.',
      done:        (reportsToCount ?? 0) > 0,
      href:        '/settings?tab=users',
      cta:         'Set approvals',
      optional:    true,
      estMin:      4,
    },
  ]

  const requiredSteps  = steps.filter(s => !s.optional)
  const completedCount = steps.filter(s => s.done).length
  const requiredDone   = requiredSteps.filter(s => s.done).length

  return NextResponse.json({
    steps,
    sampleLoaded: !!(org as any)?.sample_data,
    completedCount,
    totalSteps:     steps.length,
    requiredDone,
    requiredTotal:  requiredSteps.length,
    // Hide the nudge once the essentials are done (optional steps don't block).
    allDone:        requiredDone === requiredSteps.length,
  })
}
