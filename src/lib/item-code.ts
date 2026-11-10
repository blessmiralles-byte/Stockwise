/**
 * Item codes (the `sku` column) — generating them, checking them, and planning
 * a bulk change from a customer's spreadsheet.
 *
 * A company moving to Stocked usually already has codes for everything it
 * stocks, often printed on shelf labels and quoted on every order. Items made
 * before they brought those codes over — added in the field, scanned in at
 * receiving, or created from the sample data — carry generated ones
 * (ITM-20261110-4821) that mean nothing to anyone. planRecode() turns "here
 * is my list of current code → new code" into a set of changes that can all
 * be applied together, and explains every row it can't apply.
 *
 * Pure: the route supplies the catalog and applies the result.
 */

export const ITEM_CODE_MAX = 50

/**
 * Prefix for the temporary codes a bulk change parks items on while it swaps
 * codes around. Reserved, so a real code can never collide with one.
 */
export const RECODE_PARKING_PREFIX = '__recode__'

/** A placeholder for items created without a code. Readable, dated, unique enough. */
export function generateItemCode(now: Date = new Date(), rand: () => number = Math.random): string {
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, '')
  const suffix   = rand().toString(36).slice(2, 6).toUpperCase().padEnd(4, '0')
  return `ITM-${datePart}-${suffix}`
}

/** Codes are compared exactly, so only surrounding whitespace is removed. */
export function normaliseItemCode(v: unknown): string {
  return v == null ? '' : String(v).trim()
}

/** null when the code is acceptable, otherwise the reason it isn't. */
export function validateItemCode(code: string): string | null {
  if (!code) return 'An item code can’t be blank.'
  if (code.length > ITEM_CODE_MAX) return `Item codes can be at most ${ITEM_CODE_MAX} characters.`
  if (code.startsWith(RECODE_PARKING_PREFIX)) return `Codes can’t start with ${RECODE_PARKING_PREFIX}.`
  return null
}

export interface CatalogItem {
  id: string
  sku: string
  name?: string | null
}

export interface RecodeRow {
  current: unknown
  next: unknown
  /** The spreadsheet line, so problems point at something the customer can find. */
  line: number
}

export interface RecodeChange {
  id: string
  name: string
  from: string
  to: string
  line: number
}

export interface RecodeProblem {
  line: number
  current: string
  next: string
  reason: string
}

export interface RecodePlan {
  changes: RecodeChange[]
  /** Rows left blank or with the same code — nothing to do, and not a problem. */
  unchanged: number
  problems: RecodeProblem[]
}

/**
 * Work out which code changes can be applied together.
 *
 * Changes are applied as one batch (see recode_products in
 * scripts/migrate-item-codes-per-org.sql), so a new code only has to be free
 * once the whole batch has landed. That is what makes chains (A→B while B→C)
 * and swaps (A↔B) legitimate, where applying them one at a time would trip
 * over each other halfway.
 */
export function planRecode(catalog: CatalogItem[], rows: RecodeRow[]): RecodePlan {
  const byCode = new Map<string, CatalogItem>()
  for (const item of catalog) byCode.set(item.sku, item)

  const problems: RecodeProblem[] = []
  let unchanged = 0

  type Candidate = { item: CatalogItem; from: string; to: string; line: number }
  let candidates: Candidate[] = []
  const claimedItems = new Set<string>()

  // ── Each row on its own merits ────────────────────────────────────────────
  for (const row of rows) {
    const current = normaliseItemCode(row.current)
    const next    = normaliseItemCode(row.next)
    const problem = (reason: string) => problems.push({ line: row.line, current, next, reason })

    if (!current && !next) continue                       // an empty line
    if (!next || next === current) { unchanged++; continue }
    if (!current) { problem('This row has a new code but no current code, so we can’t tell which item it is.'); continue }

    const item = byCode.get(current)
    if (!item) { problem(`You don’t have an item with the code ${current}.`); continue }

    const invalid = validateItemCode(next)
    if (invalid) { problem(invalid); continue }

    if (claimedItems.has(item.id)) { problem(`${current} is listed more than once — keep one row for it.`); continue }
    claimedItems.add(item.id)

    candidates.push({ item, from: current, to: next, line: row.line })
  }

  // ── Two rows can't both take the same new code ────────────────────────────
  const byTarget = new Map<string, Candidate[]>()
  for (const c of candidates) byTarget.set(c.to, [...(byTarget.get(c.to) ?? []), c])
  candidates = candidates.filter(c => {
    const rivals = byTarget.get(c.to)!
    if (rivals.length === 1) return true
    const lines = rivals.map(r => r.line).join(' and ')
    problems.push({ line: c.line, current: c.from, next: c.to, reason: `Lines ${lines} both want the new code ${c.to}.` })
    return false
  })

  // ── The new code must be free once the batch lands ────────────────────────
  // Free means nobody holds it now, or whoever holds it is moving off it in
  // this same batch. Rejecting one change can strand another that relied on it
  // (A→B was fine only because B→C was going ahead), so repeat until settled.
  for (let settled = false; !settled;) {
    settled = true
    const movingOff = new Set(candidates.map(c => c.item.id))
    candidates = candidates.filter(c => {
      const holder = byCode.get(c.to)
      if (!holder || movingOff.has(holder.id)) return true
      problems.push({
        line: c.line, current: c.from, next: c.to,
        reason: `${c.to} is already the code for ${holder.name?.trim() || 'another item'}.`,
      })
      settled = false
      return false
    })
  }

  problems.sort((a, b) => a.line - b.line)
  return {
    changes: candidates.map(c => ({ id: c.item.id, name: c.item.name?.trim() || '', from: c.from, to: c.to, line: c.line })),
    unchanged,
    problems,
  }
}

/** Header names people actually use for each column, compared loosely. */
const CURRENT_HEADERS = ['current code', 'current sku', 'old code', 'old sku', 'code', 'sku', 'item code']
const NEXT_HEADERS    = ['new code', 'new sku', 'new item code', 'replacement code']

const normHeader = (v: unknown) => normaliseItemCode(v).toLowerCase().replace(/[\s_\-]+/g, ' ')

/**
 * Find the code columns in a sheet read as rows of cells.
 *
 * The header isn't assumed to be the first row — a sheet we exported may have
 * notes above it, and people add their own titles. Rows above the header are
 * ignored; line numbers are the spreadsheet's own (1-based).
 */
export function readRecodeSheet(grid: unknown[][]): { rows: RecodeRow[] } | { error: string } {
  for (let h = 0; h < Math.min(grid.length, 15); h++) {
    const header = (grid[h] ?? []).map(normHeader)
    const nextCol = header.findIndex(c => NEXT_HEADERS.includes(c))
    if (nextCol === -1) continue
    const currentCol = header.findIndex((c, i) => i !== nextCol && CURRENT_HEADERS.includes(c))
    if (currentCol === -1) continue

    const rows: RecodeRow[] = []
    for (let r = h + 1; r < grid.length; r++) {
      const cells = grid[r] ?? []
      rows.push({ current: cells[currentCol], next: cells[nextCol], line: r + 1 })
    }
    return { rows }
  }
  return { error: 'We couldn’t find a "Current code" column and a "New code" column. Start from the sheet you downloaded here, and fill in the New code column.' }
}
