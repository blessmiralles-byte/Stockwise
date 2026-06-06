'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, ScanBarcode, Cpu, Wrench, ClipboardList } from 'lucide-react'
import { cn } from '@/lib/utils'

const tabs = [
  { href: '/field',             icon: Home,          label: 'Hub'      },
  { href: '/field/log',         icon: ScanBarcode,   label: 'Log'      },
  { href: '/field/request',     icon: ClipboardList, label: 'Request'  },
  { href: '/field/equipment',   icon: Cpu,           label: 'Equipment'},
  { href: '/field/maintenance', icon: Wrench,        label: 'Tasks'    },
]

export function FieldNav() {
  const pathname = usePathname()
  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-lg bg-white border-t border-slate-200 flex z-50 safe-area-pb">
      {tabs.map(({ href, icon: Icon, label }) => {
        const active = pathname === href
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex-1 flex flex-col items-center gap-1 py-3 text-xs font-medium transition-colors',
              active ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'
            )}
          >
            <Icon className={cn('w-5 h-5', active && 'stroke-[2.5]')} />
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
