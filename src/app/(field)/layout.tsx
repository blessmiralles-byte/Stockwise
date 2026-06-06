import type { ReactNode } from 'react'
import { FieldNav } from '@/components/layout/field-nav'

export default function FieldLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-lg mx-auto">
      {/* Page scrolls above the fixed bottom nav */}
      <main className="flex-1 overflow-auto pb-20">
        {children}
      </main>
      <FieldNav />
    </div>
  )
}
