import { describe, it, expect } from 'vitest'
import {
  FEATURES, effectiveTier, isToolsPlan, planHasFeature, toolsApiBlock, toolsPageAllowed, type Feature,
} from '@/lib/entitlements'
import {
  PLAN_CONFIG, FREE_TOOL_LIMIT, CHECKOUT_PLANS, PAID_PLANS, isCheckoutPlan,
  toolLimit, toolsOverLimit, monthlyPrice, annualPrice,
} from '@/lib/plan-config'
import { settleSubscription } from '@/lib/lemonsqueezy'

const ALL = Object.keys(FEATURES) as Feature[]

describe('Stocked Tools sits below Starter', () => {
  it('recognises both Tools plans', () => {
    expect(effectiveTier('tools_free')).toBe('tools_free')
    expect(effectiveTier('tools')).toBe('tools')
    expect(isToolsPlan('tools_free')).toBe(true)
    expect(isToolsPlan('tools')).toBe(true)
    for (const p of ['trial', 'starter', 'pro', 'enterprise', null, undefined, '']) {
      expect(isToolsPlan(p as any)).toBe(false)
    }
  })

  it('gives the free plan none of the gated features', () => {
    for (const f of ALL) expect(planHasFeature('tools_free', f)).toBe(false)
  })

  it('gives paid Tools the reminders, history and export, and nothing else', () => {
    for (const f of ALL) {
      expect(planHasFeature('tools', f)).toBe(FEATURES[f].minPlan === 'tools')
    }
    expect(planHasFeature('tools', 'tool_reminders')).toBe(true)
    expect(planHasFeature('tools', 'tool_reports')).toBe(true)
  })

  it('keeps inventory and asset accounting for full Stocked', () => {
    for (const plan of ['tools_free', 'tools']) {
      expect(planHasFeature(plan, 'inventory')).toBe(false)
      expect(planHasFeature(plan, 'asset_accounting')).toBe(false)
    }
    expect(planHasFeature('starter', 'inventory')).toBe(true)
    expect(planHasFeature('starter', 'asset_accounting')).toBe(true)
  })

  // Existing customers must lose nothing to the features Tools introduced.
  it('includes the paid Tools features in every full-Stocked plan', () => {
    for (const plan of ['trial', 'starter', 'pro', 'enterprise']) {
      expect(planHasFeature(plan, 'tool_reminders')).toBe(true)
      expect(planHasFeature(plan, 'tool_reports')).toBe(true)
    }
  })
})

describe('what a Tools account can call', () => {
  it.each([
    '/api/assets', '/api/assets/abc/checkout', '/api/assets/checkouts', '/api/assets/incidents',
    '/api/accountable-persons', '/api/maintenance/123', '/api/locations', '/api/org',
    '/api/user/profile', '/api/users/invite', '/api/billing/checkout', '/api/import/assets',
    '/api/notifications', '/api/notifications/tools-overdue', '/api/categories',
  ])('allows %s', path => {
    expect(toolsApiBlock(path)).toBe(null)
  })

  it.each([
    '/api/inventory', '/api/products', '/api/products/recode', '/api/purchase-orders/pending',
    '/api/requisitions', '/api/stock-counts/x', '/api/suppliers', '/api/transfers',
    '/api/forecasting', '/api/accounting/journal', '/api/import/products', '/api/reports/x',
    '/api/cost-centers', '/api/periods', '/api/dashboard',
  ])('refuses %s as inventory', path => {
    expect(toolsApiBlock(path)).toBe('inventory')
  })

  it('carves depreciation back out of the assets routes', () => {
    expect(toolsApiBlock('/api/assets/depreciation')).toBe('asset_accounting')
    expect(toolsApiBlock('/api/assets/depreciation/run')).toBe('asset_accounting')
  })

  it('carves the reorder digest out of notifications', () => {
    expect(toolsApiBlock('/api/notifications/reorder')).toBe('inventory')
  })

  // Allow-list, so tomorrow's route is closed until someone opens it.
  it('refuses a route nobody has listed', () => {
    expect(toolsApiBlock('/api/something-new')).toBe('inventory')
  })

  // /api/assets-export must not ride in on the /api/assets prefix.
  it('matches whole path segments, not string prefixes', () => {
    expect(toolsApiBlock('/api/assets-export')).toBe('inventory')
    expect(toolsApiBlock('/api/organizations')).toBe('inventory')
  })

  it('treats a missing path as closed', () => {
    expect(toolsApiBlock(null)).toBe('inventory')
    expect(toolsApiBlock('')).toBe('inventory')
  })

  it('ignores a query string', () => {
    expect(toolsApiBlock('/api/assets/checkouts?status=out')).toBe(null)
  })
})

describe('what a Tools account can open', () => {
  it.each([
    '/assets', '/maintenance', '/locations', '/settings', '/audit-log', '/scan', '/reports',
    '/reports/tools-out', '/reports/tool-history', '/reports/tool-compliance', '/reports/tools-by-crew',
  ])('allows %s', path => {
    expect(toolsPageAllowed(path)).toBe(true)
  })

  it.each([
    '/dashboard', '/inventory', '/inventory/new', '/purchase-orders', '/requisitions',
    '/stock-counts', '/vendors', '/reorder', '/forecasting', '/transactions', '/setup',
    '/reports/valuation', '/reports/depreciation', '/reports/accounting-export',
  ])('closes %s', path => {
    expect(toolsPageAllowed(path)).toBe(false)
  })
})

describe('the tool limit on the free plan', () => {
  it('caps only the free Tools plan', () => {
    expect(toolLimit('tools_free')).toBe(FREE_TOOL_LIMIT)
    for (const p of ['tools', 'trial', 'starter', 'pro', 'enterprise', null]) {
      expect(toolLimit(p as any)).toBe(null)
    }
  })

  it('lets the last tool in and stops the next', () => {
    expect(toolsOverLimit(20, 19, 1)).toBe(false)
    expect(toolsOverLimit(20, 20, 1)).toBe(true)
  })

  it('counts a whole import against the room left', () => {
    expect(toolsOverLimit(20, 15, 5)).toBe(false)
    expect(toolsOverLimit(20, 15, 6)).toBe(true)
  })

  it('never stops a plan without a limit', () => {
    expect(toolsOverLimit(null, 5000, 500)).toBe(false)
  })
})

describe('Tools pricing and checkout', () => {
  it('can be bought, without joining the full-Stocked pricing page', () => {
    expect(isCheckoutPlan('tools')).toBe(true)
    expect(CHECKOUT_PLANS).toContain('tools')
    expect(PAID_PLANS as readonly string[]).not.toContain('tools')
    expect(isCheckoutPlan('tools_free')).toBe(false)
  })

  it('costs the same in every region, with two months free on annual', () => {
    expect(monthlyPrice('tools', 'standard')).toBe(monthlyPrice('tools', 'asean'))
    expect(annualPrice('tools', 'standard')).toBe(monthlyPrice('tools', 'standard') * 10)
  })

  it('stays well under Starter, so moving up is a real step', () => {
    for (const region of ['standard', 'asean'] as const) {
      expect(monthlyPrice('tools', region)).toBeLessThan(monthlyPrice('starter', region) / 2)
    }
  })
})

describe('when a subscription event lands', () => {
  // There is a free tier to fall to, and their tools are still out with crew.
  it('drops a lapsed Tools subscription to the free plan instead of locking it', () => {
    expect(settleSubscription({ plan: 'tools', planStatus: 'cancelled', maxUsers: 3 }))
      .toEqual({ plan: 'tools_free', planStatus: 'active', maxUsers: PLAN_CONFIG.tools_free.maxUsers })
  })

  it('leaves a live or past-due Tools subscription alone', () => {
    for (const planStatus of ['active', 'past_due']) {
      const s = { plan: 'tools', planStatus, maxUsers: 3 }
      expect(settleSubscription(s)).toEqual(s)
    }
  })

  it('still locks a lapsed full-Stocked subscription, which has no free tier', () => {
    const s = { plan: 'starter', planStatus: 'cancelled', maxUsers: 5 }
    expect(settleSubscription(s)).toEqual(s)
  })
})
