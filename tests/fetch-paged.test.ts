import { describe, it, expect } from 'vitest'
import { fetchAllPaged, DEFAULT_PAGE_SIZE } from '@/lib/fetch-paged'

/** A table of n rows that answers .range(from, to) the way PostgREST does. */
function table(n: number) {
  const all = Array.from({ length: n }, (_, i) => ({ id: i }))
  const calls: [number, number][] = []
  return {
    calls,
    page: async (from: number, to: number) => {
      calls.push([from, to])
      return { data: all.slice(from, to + 1), error: null }
    },
  }
}

describe('reading every row a query matches', () => {
  it('returns a single short page as-is', async () => {
    const t = table(12)
    const r = await fetchAllPaged(t.page, { pageSize: 50 })
    expect(r.rows).toHaveLength(12)
    expect(r.truncated).toBe(false)
    expect(t.calls).toEqual([[0, 49]])
  })

  it('walks several pages and keeps every row, in order', async () => {
    const t = table(25)
    const r = await fetchAllPaged<{ id: number }>(t.page, { pageSize: 10 })
    expect(r.rows.map(x => x.id)).toEqual(Array.from({ length: 25 }, (_, i) => i))
    expect(t.calls).toEqual([[0, 9], [10, 19], [20, 29]])
  })

  // The off-by-one that would silently drop the last row of every query.
  it('asks for an inclusive range, not an exclusive one', async () => {
    const t = table(3)
    await fetchAllPaged(t.page, { pageSize: 3 })
    expect(t.calls[0]).toEqual([0, 2])
  })

  // An exact multiple needs one more request to learn it has finished.
  it('stops after an empty page when the count divides evenly', async () => {
    const t = table(20)
    const r = await fetchAllPaged(t.page, { pageSize: 10 })
    expect(r.rows).toHaveLength(20)
    expect(r.truncated).toBe(false)
    expect(t.calls).toEqual([[0, 9], [10, 19], [20, 29]])
  })

  it('reads nothing without failing when the query matches nothing', async () => {
    const t = table(0)
    const r = await fetchAllPaged(t.page, { pageSize: 10 })
    expect(r.rows).toEqual([])
    expect(r.truncated).toBe(false)
    expect(r.error).toBe(null)
  })

  it('treats a null data payload as an empty page', async () => {
    const r = await fetchAllPaged(async () => ({ data: null, error: null }), { pageSize: 10 })
    expect(r.rows).toEqual([])
    expect(r.truncated).toBe(false)
  })
})

describe('the ceiling', () => {
  it('stops at maxRows and says the result is incomplete', async () => {
    const t = table(10_000)
    const r = await fetchAllPaged(t.page, { pageSize: 100, maxRows: 300 })
    expect(r.rows).toHaveLength(300)
    expect(r.truncated).toBe(true)
  })

  it('does not claim truncation when the data simply ran out first', async () => {
    const t = table(120)
    const r = await fetchAllPaged(t.page, { pageSize: 100, maxRows: 1000 })
    expect(r.rows).toHaveLength(120)
    expect(r.truncated).toBe(false)
  })

  it('never lets the ceiling fall below one page, which would loop forever', async () => {
    const t = table(500)
    const r = await fetchAllPaged(t.page, { pageSize: 100, maxRows: 1 })
    expect(r.rows).toHaveLength(100)
    expect(r.truncated).toBe(true)
  })
})

describe('when a page fails', () => {
  it('gives back the error instead of a half-read answer presented as whole', async () => {
    let n = 0
    const r = await fetchAllPaged(async (from, to) => {
      n++
      if (n === 2) return { data: null, error: { message: 'connection reset' } }
      return { data: Array.from({ length: to - from + 1 }, (_, i) => ({ id: from + i })), error: null }
    }, { pageSize: 10 })

    expect(r.error).toEqual({ message: 'connection reset' })
    expect(r.truncated).toBe(false)   // not "truncated" — failed
    expect(r.rows).toHaveLength(10)   // whatever arrived, for the caller to discard
  })
})

describe('defaults', () => {
  it('pages at a size PostgREST serves comfortably', async () => {
    const t = table(5)
    await fetchAllPaged(t.page)
    expect(t.calls[0]).toEqual([0, DEFAULT_PAGE_SIZE - 1])
  })
})
