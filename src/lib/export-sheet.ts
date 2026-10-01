'use client'

/**
 * Report exports — Excel (.xlsx) and CSV from the same rows.
 *
 * Excel is what most people actually want: numbers arrive as numbers (so they
 * total and sort correctly instead of being text), columns are sized to fit,
 * and the header row gets filter dropdowns. CSV stays available because
 * accounting packages import it.
 *
 * SheetJS is loaded on demand, so the library only reaches the browser when
 * somebody exports something.
 */

export type Cell = string | number | null | undefined
export type Row = Cell[]

export interface Sheet {
  /** Tab name. Excel allows 31 characters and forbids : \ / ? * [ ] */
  name: string
  /** First row is treated as the header. */
  rows: Row[]
  /** Lines placed above the table — scope notes, the period covered, filters. */
  notes?: string[]
}

/** Excel rejects : \ / ? * [ ] in tab names, and truncates past 31 characters. */
export function safeSheetName(name: string): string {
  const cleaned = (name || 'Sheet').replace(/[:\\/?*[\]]/g, ' ').trim() || 'Sheet'
  return cleaned.slice(0, 31)
}

/** Column widths from the widest cell, clamped so one long note can't stretch a column off-screen. */
export function columnWidths(rows: Row[]): { wch: number }[] {
  const widths: number[] = []
  for (const row of rows) {
    row.forEach((cell, i) => {
      const len = cell == null ? 0 : String(cell).length
      widths[i] = Math.max(widths[i] ?? 10, Math.min(len + 2, 48))
    })
  }
  return widths.map(wch => ({ wch }))
}

/** A filename without the characters Windows refuses, plus today's date. */
export function exportFilename(base: string, ext: 'xlsx' | 'csv'): string {
  const stamp = new Date().toISOString().slice(0, 10)
  const clean = base
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')          // "Cost Analysis: by job" → one dash, not two
    .replace(/^-|-$/g, '')
    .toLowerCase()
  return `${clean}-${stamp}.${ext}`
}

function save(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Download one or more sheets as a single .xlsx workbook.
 *
 *   await downloadExcel('Expenses', [{ name: 'By job', rows }])
 */
export async function downloadExcel(base: string, sheets: Sheet[]): Promise<void> {
  const XLSX = await import('xlsx')
  const book = XLSX.utils.book_new()

  for (const sheet of sheets) {
    const notes = (sheet.notes ?? []).map(n => [n] as Row)
    const body  = notes.length ? [...notes, [], ...sheet.rows] : sheet.rows
    const ws    = XLSX.utils.aoa_to_sheet(body)

    ws['!cols'] = columnWidths(sheet.rows)

    // Filter dropdowns on the header row — the first thing anyone does with a
    // report is narrow it down.
    const headerRow = notes.length ? notes.length + 1 : 0
    const cols = sheet.rows[0]?.length ?? 0
    if (cols > 0 && sheet.rows.length > 1) {
      const end = XLSX.utils.encode_cell({ r: headerRow + sheet.rows.length - 1, c: cols - 1 })
      const start = XLSX.utils.encode_cell({ r: headerRow, c: 0 })
      ws['!autofilter'] = { ref: `${start}:${end}` }
    }

    XLSX.utils.book_append_sheet(book, ws, safeSheetName(sheet.name))
  }

  const out = XLSX.write(book, { bookType: 'xlsx', type: 'array' })
  save(
    new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    exportFilename(base, 'xlsx'),
  )
}

/** Quote a cell for CSV: double any quotes, wrap anything with a comma, quote or newline. */
export function csvCell(cell: Cell): string {
  const v = cell == null ? '' : String(cell)
  return /[",\n\r]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v
}

export function toCsv(rows: Row[]): string {
  return rows.map(r => r.map(csvCell).join(',')).join('\r\n')
}

/** Download rows as CSV (one sheet only — the format has no tabs). */
export function downloadCsv(base: string, rows: Row[], notes: string[] = []): void {
  const prefixed = notes.length ? [...notes.map(n => [`# ${n}`] as Row), ...rows] : rows
  // The BOM makes Excel open UTF-8 correctly when someone double-clicks a CSV.
  save(new Blob(['﻿' + toCsv(prefixed)], { type: 'text/csv;charset=utf-8;' }), exportFilename(base, 'csv'))
}
