'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Package, ArrowLeftRight,
  MapPin, Wrench, Settings, ChevronLeft, ChevronRight,
  BarChart3, Building2, TrendingUp,
  Truck, ShoppingCart, ScanBarcode, Cpu, ClipboardList,
  Shield, Sliders,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useState } from 'react'

const navItems = [
  { href: '/dashboard',       icon: LayoutDashboard, label: 'Dashboard'       },
  { href: '/inventory',       icon: Package,         label: 'Inventory'       },
  { href: '/transactions',    icon: ArrowLeftRight,  label: 'Transactions'    },
  { href: '/forecasting',     icon: TrendingUp,      label: 'Forecasting'     },
  { href: '/vendors',         icon: Building2,       label: 'Vendors'         },
  { href: '/purchase-orders', icon: ShoppingCart,    label: 'Purchase Orders' },
  { href: '/requisitions',    icon: ClipboardList,   label: 'Requisitions'    },
  { href: '/stock-counts',    icon: Truck,           label: 'Stock Counts'    },
  { href: '/assets',          icon: Cpu,             label: 'Fixed Assets'    },
  { href: '/maintenance',     icon: Wrench,          label: 'Maintenance'     },
  { href: '/reports',         icon: BarChart3,       label: 'Reports'         },
  { href: '/setup',           icon: Sliders,         label: 'Setup & Import'  },
  { href: '/audit-log',       icon: Shield,          label: 'Audit Log'       },
  { href: '/settings',        icon: Settings,        label: 'Settings'        },
]

const fieldItems = [
  { href: '/field', icon: ScanBarcode, label: 'Field View' },
]

export function Sidebar() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  return (
    <aside
      className={cn(
        'relative flex flex-col bg-slate-950 text-white transition-all duration-300 min-h-screen border-r border-slate-800/60',
        collapsed ? 'w-16' : 'w-60'
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
            <p className="text-[10px] text-slate-500 mt-0.5 leading-none">Inventory management</p>
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
        {navItems.map(({ href, icon: Icon, label }) => {
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

        {/* Field worker section */}
        <div className="pt-3 pb-1">
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
        </div>
      </nav>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 bg-slate-800 rounded-full flex items-center justify-center hover:bg-slate-700 transition-colors border border-slate-700 shadow-sm"
      >
        {collapsed
          ? <ChevronRight className="w-3 h-3 text-slate-400" />
          : <ChevronLeft  className="w-3 h-3 text-slate-400" />
        }
      </button>
    </aside>
  )
}
