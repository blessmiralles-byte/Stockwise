import { describe, it, expect } from 'vitest'
import { csvCell, toCsv, columnWidths, safeSheetName, exportFilename } from '@/lib/export-sheet'

describe('CSV escaping', () => {
  it('leaves plain values alone', () => {
    expect(csvCell('Hammer')).toBe('Hammer')
    expect(csvCell(42)).toBe('42')
  })

  it('quotes anything with a comma, quote or newline', () => {
    expect(csvCell('Bolts, 10mm')).toBe('"Bolts, 10mm"')
    expect(csvCell('6" pipe')).toBe('"6"" pipe"')
    expect(csvCell('line1\nline2')).toBe('"line1\nline2"')
  })

  it('writes empty cells for null and undefined', () => {
    expect(csvCell(null)).toBe('')
    expect(csvCell(undefined)).toBe('')
  })

  // A stray comma used to split a row into two columns — this is the regression.
  it('keeps a row intact when a value contains a comma', () => {
    const csv = toCsv([['Item', 'Note'], ['Cable', 'Site A, bay 3']])
    expect(csv.split('\r\n')[1]).toBe('Cable,"Site A, bay 3"')
  })
})

describe('column widths', () => {
  it('sizes each column to its widest cell', () => {
    const w = columnWidths([['Tool', 'Holder'], ['Angle grinder', 'Jo']])
    expect(w[0].wch).toBeGreaterThan(w[1].wch)
  })

  it('never goes below a readable minimum or past a sane maximum', () => {
    const w = columnWidths([['x', 'y'.repeat(200)]])
    expect(w[0].wch).toBeGreaterThanOrEqual(10)
    expect(w[1].wch).toBeLessThanOrEqual(48)
  })

  it('copes with ragged rows', () => {
    expect(() => columnWidths([['a'], ['a', 'b', 'c'], []])).not.toThrow()
    expect(columnWidths([['a'], ['a', 'b', 'c']])).toHaveLength(3)
  })
})

describe('sheet names and filenames', () => {
  // Excel silently refuses a workbook with an illegal tab name.
  it.each([':', '\\', '/', '?', '*', '[', ']'])('strips %s from a tab name', ch => {
    expect(safeSheetName(`By ${ch} job`)).not.toContain(ch)
  })

  it('truncates to Excel’s 31-character limit', () => {
    expect(safeSheetName('x'.repeat(50))).toHaveLength(31)
  })

  it('falls back when the name is empty', () => {
    expect(safeSheetName('')).toBe('Sheet')
    expect(safeSheetName('   ')).toBe('Sheet')
  })

  it('dates the file and drops characters Windows refuses', () => {
    const name = exportFilename('Cost Analysis: by job', 'xlsx')
    expect(name).toMatch(/^cost-analysis-by-job-\d{4}-\d{2}-\d{2}\.xlsx$/)
  })
})
