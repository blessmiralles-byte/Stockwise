'use client'

import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { downloadExcel, downloadCsv, type Sheet, type Row } from '@/lib/export-sheet'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { type Feature, FEATURES, TIER_LABEL } from '@/lib/entitlements'
import { usePlan } from '@/lib/use-plan'

/**
 * Excel + CSV buttons for a report.
 *
 * Pass a function that builds the sheets when clicked (not the rows up front),
 * so a report with thousands of lines doesn't build the export on every render.
 */
export function ExportButtons({
  filename, build, disabled, className, csvSheetIndex = 0, feature,
}: {
  filename: string
  build: () => Sheet[]
  disabled?: boolean
  className?: string
  /** Which sheet the CSV contains, when the workbook has several. */
  csvSheetIndex?: number
  /** Plan feature this export belongs to; without it the buttons become an upgrade link. */
  feature?: Feature
}) {
  const [busy, setBusy] = useState<'xlsx' | 'csv' | null>(null)
  const { has } = usePlan()

  const run = async (kind: 'xlsx' | 'csv') => {
    setBusy(kind)
    try {
      const sheets = build()
      if (!sheets.length) return
      if (kind === 'xlsx') {
        await downloadExcel(filename, sheets)
      } else {
        const sheet = sheets[csvSheetIndex] ?? sheets[0]
        downloadCsv(filename, sheet.rows as Row[], sheet.notes)
      }
    } finally {
      setBusy(null)
    }
  }

  const base = 'flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold transition-colors disabled:opacity-50'

  if (feature && !has(feature)) {
    return (
      <Link
        href="/settings?tab=billing"
        className={cn(base, 'border-amber-200 text-amber-800 bg-amber-50 hover:bg-amber-100', className)}
        title={FEATURES[feature].description}
      >
        <Download className="w-3.5 h-3.5" />
        Export — on {TIER_LABEL[FEATURES[feature].minPlan]}
      </Link>
    )
  }

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <button
        type="button"
        onClick={() => run('xlsx')}
        disabled={disabled || !!busy}
        className={cn(base, 'border-green-200 text-green-700 hover:bg-green-50')}
        title="Download as an Excel workbook"
      >
        {busy === 'xlsx' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
        Excel
      </button>
      <button
        type="button"
        onClick={() => run('csv')}
        disabled={disabled || !!busy}
        className={cn(base, 'border-slate-200 text-slate-600 hover:bg-slate-50')}
        title="Download as CSV"
      >
        {busy === 'csv' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
        CSV
      </button>
    </div>
  )
}
