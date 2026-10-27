/**
 * Read every row a query matches, a page at a time.
 *
 * The analytics endpoints aggregate a whole year of stock movements server
 * side — ABC classification, demand forecasting, supplier on-time rates. They
 * used to select the lot in one request with no row cap, which has two
 * problems that both get worse with the customer's size:
 *
 *   1. PostgREST applies its own ceiling to a capless select. We don't set
 *      that ceiling, so whatever it is, the answer quietly becomes "the first
 *      N rows" — a forecast built on part of the data, presented as if it
 *      were built on all of it. Wrong numbers are worse than slow ones.
 *   2. A big customer's year of movements arrives as one response and one
 *      array in function memory.
 *
 * Paging fixes both: the answer stays complete, and no single response has to
 * carry it. There is still a hard ceiling, because an unbounded loop against
 * an unexpectedly huge table is its own outage — but it is explicit, and the
 * caller is told when it bites instead of guessing.
 *
 * The query MUST have a deterministic sort. `.range()` is just OFFSET/LIMIT:
 * without a total order, Postgres may return a row on two pages or none, and
 * the aggregate drifts. Order by something unique, or by a timestamp with a
 * unique tiebreak.
 */

/** Rows per request. PostgREST handles a thousand-row page comfortably. */
export const DEFAULT_PAGE_SIZE = 1000

/**
 * Stop here. A year of movements for a big contractor is tens of thousands of
 * rows; 200k means something is wrong with the query, not with the customer.
 */
export const DEFAULT_MAX_ROWS = 200_000

export interface PagedResult<T> {
  rows: T[]
  /** True when we stopped at the ceiling and rows are therefore incomplete. */
  truncated: boolean
  error: unknown
}

/**
 * @param page  Runs one page of the query: `(from, to) => query.range(from, to)`.
 *              Build the query fresh or reuse it — PostgREST builders are
 *              single-shot, so build inside the callback.
 */
export async function fetchAllPaged<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  opts: { pageSize?: number; maxRows?: number } = {},
): Promise<PagedResult<T>> {
  const pageSize = Math.max(1, opts.pageSize ?? DEFAULT_PAGE_SIZE)
  const maxRows  = Math.max(pageSize, opts.maxRows ?? DEFAULT_MAX_ROWS)

  const rows: T[] = []
  let offset = 0

  for (;;) {
    const { data, error } = await page(offset, offset + pageSize - 1)
    if (error) return { rows, truncated: false, error }

    const batch = data ?? []
    rows.push(...batch)

    // A short page means we reached the end — the common exit.
    if (batch.length < pageSize) return { rows, truncated: false, error: null }

    offset += pageSize
    if (offset >= maxRows) return { rows, truncated: true, error: null }
  }
}
