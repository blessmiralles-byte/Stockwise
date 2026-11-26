'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Package, ArrowLeftRight,
  MapPin, Wrench, Settings, ChevronLeft, ChevronRight,
  BarChart3, Building2, TrendingUp,
  Truck, ShoppingCart, ScanBarcode, Cpu, ClipboardList, PackageSearch,
  Shield, Sliders,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useState, useEffect } from 'react'
import { X, Menu } from 'lucide-react'

/** Fired by the top bar's menu button on phones to open the sidebar. */
export const OPEN_NAV_EVENT = 'stocked:open-nav'

/** The phone-only menu button that opens the sidebar. Put it before a page title. */
export function MobileNavButton({ className = '' }: { className?: string }) {
  return (
    <button
      onClick={() => window.dispatchEvent(new Event(OPEN_NAV_EVENT))}
      aria-label="Open menu"
      className={cn('md:hidden -ml-1 h-9 w-9 flex-shrink-0 flex items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100', className)}
    >
      <Menu className="w-5 h-5" />
    </button>
  )
}
import { type Feature, FEATURES, planHasFeature, isToolsPlan, toolsPageAllowed } from '@/lib/entitlements'
import { PlanBadge } from '@/components/billing/upgrade-prompt'
import { canSeePage } from '@/lib/permissions'

const navItems: { href: string; icon: any; label: string; feature?: Feature }[] = [
  { href: '/dashboard',       icon: LayoutDashboard, label: 'Dashboard'       },
  { href: '/inventory',       icon: Package,         label: 'Inventory'       },
  { href: '/transactions',    icon: ArrowLeftRight,  label: 'Transactions'    },
  { href: '/forecasting',     icon: TrendingUp,      label: 'Forecasting',     feature: 'forecasting' },
  { href: '/vendors',         icon: Building2,       label: 'Vendors'         },
  { href: '/purchase-orders', icon: ShoppingCart,    label: 'Purchase Orders' },
  { href: '/reorder',         icon: PackageSearch,   label: 'Reorder'         },
  { href: '/requisitions',    icon: ClipboardList,   label: 'Requisitions',    feature: 'approvals' },
  { href: '/stock-counts',    icon: Truck,           label: 'Stock Counts'    },
  { href: '/assets',          icon: Cpu,             label: 'Fixed Assets'    },
  { href: '/maintenance',     icon: Wrench,          label: 'Maintenance'     },
  { href: '/reports',         icon: BarChart3,       label: 'Reports'         },
  { href: '/setup',           icon: Sliders,         label: 'Setup & Import'  },
  { href: '/audit-log',       icon: Shield,          label: 'Audit Log'       },
  { href: '/settings',        icon: Settings,        label: 'Settings'        },
]

/** What a Stocked Tools account calls things: it has tools, not fixed assets. */
const TOOLS_LABELS: Record<string, string> = { '/assets': 'Tools' }
const TOOLS_LOCATIONS: (typeof navItems)[number] = { href: '/locations', icon: MapPin, label: 'Locations' }

const fieldItems = [
  { href: '/field', icon: ScanBarcode, label: 'Field View' },
]

export function Sidebar({ plan, role }: { plan?: string | null; role?: string | null }) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  // A Tools account sees only the tool tracker — no locked rows advertising
  // the rest; the upgrade lives in Settings.
  const toolsOnly = isToolsPlan(plan)
  const forPlan = toolsOnly
    ? navItems
        .filter(i => toolsPageAllowed(i.href))
        .map(i => ({ ...i, label: TOOLS_LABELS[i.href] ?? i.label }))
        // Full Stocked reaches Locations through Setup; Tools has no Setup page.
        .flatMap(i => i.href === '/assets' ? [i, TOOLS_LOCATIONS] : [i])
    : navItems
  // Nor a page the role can't open (lib/permissions): no link to a 403.
  const items = forPlan.filter(i => canSeePage(role, i.href))

  // Phones: the sidebar is a slide-in panel opened from the top bar's menu
  // button (see Topbar), closed by picking a page or tapping outside.
  const [mobileOpen, setMobileOpen] = useState(false)
  useEffect(() => {
    const open = () => setMobileOpen(true)
    window.addEventListener(OPEN_NAV_EVENT, open)
    return () => window.removeEventListener(OPEN_NAV_EVENT, open)
  }, [])
  // Close the phone menu when the page changes (adjusted during render, not in an effect).
  const [navPath, setNavPath] = useState(pathname)
  if (navPath !== pathname) { setNavPath(pathname); setMobileOpen(false) }

  return (
    <>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <div className="relative w-64 max-w-[80%] h-full overflow-y-auto shadow-xl">
            {panel(false, true)}
          </div>
          <button
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
            className="relative ml-2 mt-3 h-9 w-9 rounded-full bg-white/90 flex items-center justify-center shadow"
          >
            <X className="w-4 h-4 text-slate-700" />
          </button>
        </div>
      )}
      <div className="hidden md:flex">{panel(collapsed, false)}</div>
    </>
  )

  function panel(collapsed: boolean, mobile: boolean) {
  return (
    <aside
      className={cn(
        'relative flex flex-col bg-slate-950 text-white transition-all duration-300 min-h-screen border-r border-slate-800/60',
        mobile ? 'w-full' : collapsed ? 'w-16' : 'w-60'
      )}
    >
      {/* Logo */}
      <div className={cn(
        'flex items-center gap-2.5 border-b border-slate-800/60',
        collapsed ? 'px-4 py-5 justify-center' : 'px-5 py-5'
      )}>
        <div className="flex-shrink-0 w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center shadow-sm shadow-indigo-900/40">
          <Package className="w-3.5 h-3.5 text-white" strokeWidth={2.5} />
        </div>
        {!collapsed && (
          <div>
            <span className="text-[15px] font-semibold text-white tracking-tight leading-none">Stocked</span>
            <p className="text-[10px] text-slate-500 mt-0.5 leading-none">{toolsOnly ? 'Tool tracking' : 'Inventory management'}</p>
          </div>
        )}
      </div>

      {/* Main nav */}
      <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">
        {!collapsed && (
          <p className="px-3 pb-1.5 text-[10px] font-semibold text-slate-600 uppercase tracking-widest">
            Workspace
          </p>
        )}
        {items.map(({ href, icon: Icon, label, feature }) => {
          const active = pathname.startsWith(href)
          const lockedTier = feature && !planHasFeature(plan, feature) ? FEATURES[feature].minPlan : null
          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? label : undefined}
              className={cn(
                'flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-100',
                collapsed && 'justify-center',
                active
                  ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-900/50'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/70'
              )}
            >
              <Icon className={cn('flex-shrink-0', collapsed ? 'w-5 h-5' : 'w-4 h-4', active ? 'text-white' : 'text-slate-500')} />
              {!collapsed && <span className="flex-1">{label}</span>}
              {!collapsed && lockedTier && <PlanBadge tier={lockedTier} />}
            </Link>
          )
        })}

        {/* Field worker section — the field view is inventory work */}
        {!toolsOnly && <div className="pt-3 pb-1">
          <div className="border-t border-slate-800/60 mb-3" />
          {!collapsed && (
            <p className="px-3 pb-1.5 text-[10px] font-semibold text-slate-600 uppercase tracking-widest">
              Field
            </p>
          )}
          {fieldItems.map(({ href, icon: Icon, label }) => {
            const active = pathname.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                title={collapsed ? label : undefined}
                className={cn(
                  'flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-100',
                  collapsed && 'justify-center',
                  active
                    ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-900/50'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/70'
                )}
              >
                <Icon className={cn('flex-shrink-0', collapsed ? 'w-5 h-5' : 'w-4 h-4', active ? 'text-white' : 'text-slate-500')} />
                {!collapsed && <span>{label}</span>}
              </Link>
            )
          })}
        </div>}
      </nav>

      {/* Collapse toggle */}
      {!mobile && <button
        onClick={() => setCollapsed(!collapsed)}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 bg-slate-800 rounded-full flex items-center justify-center hover:bg-slate-700 transition-colors border border-slate-700 shadow-sm"
      >
        {collapsed
          ? <ChevronRight className="w-3 h-3 text-slate-400" />
          : <ChevronLeft  className="w-3 h-3 text-slate-400" />
        }
      </button>}
    </aside>
  )
  }
}
