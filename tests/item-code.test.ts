import { describe, it, expect } from 'vitest'
import {
  generateItemCode, validateItemCode, planRecode, readRecodeSheet,
  ITEM_CODE_MAX, RECODE_PARKING_PREFIX, type CatalogItem,
} from '@/lib/item-code'

const catalog: CatalogItem[] = [
  { id: 'a', sku: 'ITM-20261101-AAAA', name: 'PVC elbow 20mm' },
  { id: 'b', sku: 'ITM-20261101-BBBB', name: 'Cable tie 200mm' },
  { id: 'c', sku: 'PLB-0001',          name: 'Teflon tape' },
  { id: 'd', sku: 'PLB-0002',          name: 'Pipe clamp' },
]

const row = (current: string, next: string, line = 2) => ({ current, next, line })

describe('generated codes', () => {
  it('reads as a dated item code', () => {
    const code = generateItemCode(new Date('2026-11-10T08:00:00Z'), () => 0.123456)
    expect(code).toMatch(/^ITM-20261110-[0-9A-Z]{4}$/)
  })

  // Math.random can return a short base-36 string; the suffix must not shrink.
  it('always has a four-character suffix', () => {
    expect(generateItemCode(new Date('2026-11-10'), () => 0.5)).toMatch(/-[0-9A-Z]{4}$/)
  })
})

describe('what counts as a valid code', () => {
  it('accepts an ordinary code', () => {
    expect(validateItemCode('ELC-0117')).toBe(null)
  })

  it.each([
    ['', /blank/],
    ['x'.repeat(ITEM_CODE_MAX + 1), /at most/],
    [`${RECODE_PARKING_PREFIX}abc`, /can’t start with/],
  ])('rejects %j', (code, reason) => {
    expect(validateItemCode(code)).toMatch(reason)
  })
})

describe('planning a bulk code change', () => {
  it('renames an item to the company’s own code', () => {
    const plan = planRecode(catalog, [row('ITM-20261101-AAAA', 'PLB-0100')])
    expect(plan.changes).toEqual([
      { id: 'a', name: 'PVC elbow 20mm', from: 'ITM-20261101-AAAA', to: 'PLB-0100', line: 2 },
    ])
    expect(plan.problems).toEqual([])
  })

  it('ignores rows left blank or unchanged — most of a sheet will be', () => {
    const plan = planRecode(catalog, [
      row('PLB-0001', ''),
      row('PLB-0002', 'PLB-0002'),
      row('', ''),
    ])
    expect(plan.changes).toEqual([])
    expect(plan.unchanged).toBe(2)
    expect(plan.problems).toEqual([])
  })

  it('trims stray spaces a spreadsheet leaves around codes', () => {
    const plan = planRecode(catalog, [row('  PLB-0001 ', ' PLB-0100  ')])
    expect(plan.changes[0]).toMatchObject({ from: 'PLB-0001', to: 'PLB-0100' })
  })

  it('says so when the current code is not one of theirs', () => {
    const plan = planRecode(catalog, [row('NOPE-1', 'PLB-0100', 7)])
    expect(plan.changes).toEqual([])
    expect(plan.problems[0]).toMatchObject({ line: 7, reason: expect.stringMatching(/don’t have an item with the code NOPE-1/) })
  })

  it('needs a current code to know which item a row means', () => {
    expect(planRecode(catalog, [row('', 'PLB-0100')]).problems[0].reason).toMatch(/no current code/)
  })

  it('rejects an invalid new code', () => {
    expect(planRecode(catalog, [row('PLB-0001', 'x'.repeat(60))]).problems[0].reason).toMatch(/at most/)
  })

  it('refuses a code another item already has, and names that item', () => {
    const plan = planRecode(catalog, [row('ITM-20261101-AAAA', 'PLB-0001', 4)])
    expect(plan.changes).toEqual([])
    expect(plan.problems[0]).toMatchObject({ line: 4, reason: 'PLB-0001 is already the code for Teflon tape.' })
  })

  it('refuses two rows claiming the same new code, pointing at both lines', () => {
    const plan = planRecode(catalog, [
      row('ITM-20261101-AAAA', 'PLB-0100', 2),
      row('ITM-20261101-BBBB', 'PLB-0100', 3),
    ])
    expect(plan.changes).toEqual([])
    expect(plan.problems).toHaveLength(2)
    expect(plan.problems[0].reason).toBe('Lines 2 and 3 both want the new code PLB-0100.')
  })

  it('takes the first row when an item is listed twice, and flags the second', () => {
    const plan = planRecode(catalog, [
      row('PLB-0001', 'PLB-0101', 2),
      row('PLB-0001', 'PLB-0102', 3),
    ])
    expect(plan.changes.map(c => c.to)).toEqual(['PLB-0101'])
    expect(plan.problems[0]).toMatchObject({ line: 3, reason: expect.stringMatching(/listed more than once/) })
  })

  // Applied as one batch, so these only have to be consistent at the end.
  it('allows a chain where each code is vacated in the same batch', () => {
    const plan = planRecode(catalog, [
      row('PLB-0001', 'PLB-0002', 2),   // takes Pipe clamp's code…
      row('PLB-0002', 'PLB-0003', 3),   // …which Pipe clamp gives up
    ])
    expect(plan.problems).toEqual([])
    expect(plan.changes).toHaveLength(2)
  })

  it('allows two items to swap codes', () => {
    const plan = planRecode(catalog, [
      row('PLB-0001', 'PLB-0002', 2),
      row('PLB-0002', 'PLB-0001', 3),
    ])
    expect(plan.problems).toEqual([])
    expect(plan.changes.map(c => [c.from, c.to])).toEqual([['PLB-0001', 'PLB-0002'], ['PLB-0002', 'PLB-0001']])
  })

  // The subtle one: A→B is only fine because B was leaving. If B's own row is
  // rejected, B keeps its code and A's change must be rejected too.
  it('rejects a change whose code would only have been freed by a rejected row', () => {
    const plan = planRecode(catalog, [
      row('PLB-0001', 'PLB-0002', 2),            // relies on Pipe clamp moving
      row('PLB-0002', 'x'.repeat(60), 3),        // …but Pipe clamp's new code is invalid
    ])
    expect(plan.changes).toEqual([])
    expect(plan.problems.map(p => p.line)).toEqual([2, 3])
    expect(plan.problems[0].reason).toBe('PLB-0002 is already the code for Pipe clamp.')
  })

  it('unwinds a longer chain when its last link fails', () => {
    const plan = planRecode(catalog, [
      row('ITM-20261101-AAAA', 'PLB-0001', 2),   // needs Teflon tape to move
      row('PLB-0001', 'PLB-0002', 3),            // needs Pipe clamp to move
      row('PLB-0002', 'NOPE-1-TOO-LONG'.repeat(5), 4),
    ])
    expect(plan.changes).toEqual([])
    expect(plan.problems).toHaveLength(3)
  })

  it('applies the good rows and reports the bad ones in the same sheet', () => {
    const plan = planRecode(catalog, [
      row('ITM-20261101-AAAA', 'PLB-0100', 2),
      row('NOPE-1', 'PLB-0101', 3),
      row('ITM-20261101-BBBB', 'ELC-0001', 4),
    ])
    expect(plan.changes.map(c => c.to)).toEqual(['PLB-0100', 'ELC-0001'])
    expect(plan.problems.map(p => p.line)).toEqual([3])
  })

  it('lists problems in sheet order, whatever stage caught them', () => {
    const plan = planRecode(catalog, [
      row('PLB-0001', 'PLB-0002', 9),     // caught last (code held)
      row('NOPE-1', 'X-1', 3),            // caught first (unknown item)
    ])
    expect(plan.problems.map(p => p.line)).toEqual([3, 9])
  })
})

describe('reading the uploaded sheet', () => {
  it('finds the columns by their headings', () => {
    const r = readRecodeSheet([
      ['Current code', 'Item name', 'Barcode', 'New code'],
      ['PLB-0001', 'Teflon tape', '', 'PLB-0100'],
    ])
    expect(r).toEqual({ rows: [{ current: 'PLB-0001', next: 'PLB-0100', line: 2 }] })
  })

  it('finds the header below notes or a title someone added', () => {
    const r = readRecodeSheet([
      ['Our item codes — November'],
      [],
      ['SKU', 'Name', 'New SKU'],
      ['PLB-0001', 'Teflon tape', 'PLB-0100'],
    ])
    expect(r).toEqual({ rows: [{ current: 'PLB-0001', next: 'PLB-0100', line: 4 }] })
  })

  it('is loose about how the headings are written', () => {
    const r = readRecodeSheet([['current_code', 'NEW-CODE'], ['A', 'B']])
    expect('rows' in r && r.rows[0]).toMatchObject({ current: 'A', next: 'B' })
  })

  it('explains itself when there is no new-code column', () => {
    const r = readRecodeSheet([['SKU', 'Name'], ['PLB-0001', 'Teflon tape']])
    expect(r).toMatchObject({ error: expect.stringMatching(/New code/) })
  })
})
