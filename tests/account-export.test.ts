import { describe, it, expect } from 'vitest'
import {
  EXPORT_TABLES, EXPORT_ROW_LIMIT, forbiddenColumns, cellValue, toSheetRows, summarySheet,
} from '@/lib/account-export'
import { safeSheetName } from '@/lib/export-sheet'

describe('what the export contains', () => {
  it('covers the tables a customer would expect', () => {
    const tables = EXPORT_TABLES.map(t => t.table)
    for (const expected of [
      'products', 'inventory_balances', 'inventory_transactions', 'locations', 'suppliers',
      'purchase_orders', 'requisitions', 'fixed_assets', 'maintenance_schedules', 'audit_log',
    ]) {
      expect(tables, `${expected} missing from the export`).toContain(expected)
    }
  })

  it('lists each table once', () => {
    const tables = EXPORT_TABLES.map(t => t.table)
    expect(new Set(tables).size).toBe(tables.length)
  })

  it('gives every tab a unique name Excel will accept', () => {
    const sheets = EXPORT_TABLES.map(t => t.sheet)
    expect(new Set(sheets).size).toBe(sheets.length)
    for (const s of sheets) {
      expect(s.length).toBeLessThanOrEqual(31)
      expect(safeSheetName(s)).toBe(s)      // no characters Excel refuses
    }
  })

  it('names its columns explicitly, including the id', () => {
    for (const t of EXPORT_TABLES) {
      expect(t.columns.length, t.table).toBeGreaterThan(0)
      expect(t.columns, t.table).toContain('id')
      expect(new Set(t.columns).size, `${t.table} has a duplicate column`).toBe(t.columns.length)
    }
  })

  // The real risk of a "download everything" feature is handing over something
  // that shouldn't leave the building.
  it('carries no secrets, tokens or billing identifiers', () => {
    expect(forbiddenColumns()).toEqual([])
  })

  it('would catch a secret added to the spec later', () => {
    const bad = [{ table: 'x', sheet: 'X', columns: ['id', 'stripe_customer_id'] }]
    expect(forbiddenColumns(bad as any)).toEqual(['x.stripe_customer_id'])
  })

  it('sorts the tables that have a natural order', () => {
    for (const t of EXPORT_TABLES.filter(t => t.orderBy)) {
      expect(t.columns, `${t.table} sorts by ${t.orderBy} but does not include it`).toContain(t.orderBy!)
    }
  })
})

describe('turning rows into a sheet', () => {
  const spec = EXPORT_TABLES.find(t => t.table === 'categories')!

  it('writes the header first, then the rows in column order', () => {
    const rows = toSheetRows(spec, [{ id: 'c1', name: 'Electrical', type: 'inventory', created_at: '2026-01-01' }])
    expect(rows[0]).toEqual(spec.columns)
    expect(rows[1][spec.columns.indexOf('name')]).toBe('Electrical')
  })

  it('leaves a gap where a value is missing rather than shifting the row', () => {
    const rows = toSheetRows(spec, [{ id: 'c1' }])
    expect(rows[1]).toHaveLength(spec.columns.length)
    expect(rows[1][spec.columns.indexOf('name')]).toBe(null)
  })

  it('keeps numbers and booleans as themselves', () => {
    expect(cellValue(42)).toBe(42)
    expect(cellValue(0)).toBe(0)
    expect(cellValue(false)).toBe(false)
  })

  it('writes json columns as readable json', () => {
    expect(cellValue({ status: 'draft', qty: 2 })).toBe('{"status":"draft","qty":2}')
  })

  it('treats null and undefined as empty', () => {
    expect(cellValue(null)).toBe(null)
    expect(cellValue(undefined)).toBe(null)
  })
})

describe('the summary tab', () => {
  const base = { orgName: 'Dauntless Electrical', generatedAt: '2026-10-17', counts: { Products: 120, Locations: 4 }, truncated: [] as string[] }

  it('names the account, the date and the row counts', () => {
    const flat = summarySheet(base).flat().join(' ')
    expect(flat).toContain('Dauntless Electrical')
    expect(flat).toContain('2026-10-17')
    expect(flat).toContain('Products')
    expect(flat).toContain('120')
  })

  // If we quietly cut their data off, they would find out by discovering a gap.
  it('says plainly when a tab was truncated, and how to get the rest', () => {
    const flat = summarySheet({ ...base, truncated: ['Stock movements'] }).flat().join(' ')
    expect(flat).toContain('Stock movements')
    expect(flat).toContain(EXPORT_ROW_LIMIT.toLocaleString())
    expect(flat).toContain('support@stocked.tech')
  })

  it('says nothing about truncation when nothing was cut', () => {
    expect(summarySheet(base).flat().join(' ')).not.toContain('Truncated')
  })
})
