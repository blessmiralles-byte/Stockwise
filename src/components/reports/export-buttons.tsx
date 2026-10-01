'use client'

import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { downloadExcel, downloadCsv, type Sheet, type Row } from '@/lib/export-sheet'
import { cn } from '@/lib/utils'

/**
 * Excel + CSV buttons for a report.
 *
 * Pass a function that builds the sheets when clicked (not the rows up front),
 * so a report with thousands of lines doesn't build the export on every render.
 */
export function ExportButtons({
  filename, build, disabled, className, csvSheetIndex = 0,
}: {
  filename: string
  build: () => Sheet[]
  disabled?: boolean
  className?: string
  /** Which sheet the CSV contains, when the workbook has several. */
  csvSheetIndex?: number
}) {
  const [busy, setBusy] = useState<'xlsx' | 'csv' | null>(null)

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
