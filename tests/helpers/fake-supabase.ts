/**
 * A tiny in-memory stand-in for the Supabase service client.
 *
 * It covers the query shapes our server code actually uses — select/eq/neq/in/
 * or/order/limit/maybeSingle/single, insert, update, and head+count — so the
 * routing and claim logic can be tested without a database. It is deliberately
 * simple: if a test needs a shape this doesn't support, extend it here rather
 * than reaching for a real connection.
 */
export type Tables = Record<string, any[]>

export function fakeSupabase(tables: Tables) {
  const db: Tables = tables
  let autoId = 0

  function from(table: string) {
    db[table] ??= []
    const filters: ((r: any) => boolean)[] = []
    let op: 'select' | 'update' = 'select'
    let patch: any = null
    let orderBy: { col: string; asc: boolean } | null = null
    let lim: number | null = null
    let wantCount = false

    const api: any = {
      select(_cols?: string, opts?: { count?: string; head?: boolean }) {
        if (opts?.count) wantCount = true
        return api
      },
      eq(col: string, val: any)  { filters.push(r => r[col] === val); return api },
      neq(col: string, val: any) { filters.push(r => r[col] !== val); return api },
      gt(col: string, val: any)  { filters.push(r => Number(r[col]) > Number(val)); return api },
      in(col: string, vals: any[]) { filters.push(r => vals.includes(r[col])); return api },
      is(col: string, val: any)  { filters.push(r => (val === null ? r[col] == null : r[col] === val)); return api },
      /** Supports the "a.eq.X,b.eq.Y" form we use for "mine or routed to me". */
      or(expr: string) {
        const clauses = expr.split(',').map(c => {
          const [col, opName, ...rest] = c.split('.')
          const val = rest.join('.')
          return (r: any) => {
            if (opName === 'eq')  return String(r[col]) === val
            if (opName === 'neq') return String(r[col]) !== val
            if (opName === 'not') return r[col] != null
            return true
          }
        })
        filters.push(r => clauses.some(c => c(r)))
        return api
      },
      order(col: string, opts?: { ascending?: boolean }) { orderBy = { col, asc: opts?.ascending !== false }; return api },
      limit(n: number) { lim = n; return api },
      insert(rows: any | any[]) {
        const list = Array.isArray(rows) ? rows : [rows]
        for (const r of list) db[table].push({ id: r.id ?? `row-${++autoId}`, ...r })
        return { select: () => ({
          single:      async () => ({ data: db[table].at(-1), error: null }),
          maybeSingle: async () => ({ data: db[table].at(-1), error: null }),
        }), then: (res: any) => Promise.resolve({ data: null, error: null }).then(res) }
      },
      update(p: any) { op = 'update'; patch = p; return api },
      delete() { op = 'update'; patch = null; return api },
      run() {
        let rows = db[table].filter(r => filters.every(f => f(r)))
        if (op === 'update') {
          if (patch === null) { db[table] = db[table].filter(r => !rows.includes(r)) }
          else rows.forEach(r => Object.assign(r, patch))
          return { data: rows, error: null, count: rows.length }
        }
        if (orderBy) {
          const { col, asc } = orderBy
          rows = [...rows].sort((a, b) => (a[col] > b[col] ? 1 : a[col] < b[col] ? -1 : 0) * (asc ? 1 : -1))
        }
        if (lim != null) rows = rows.slice(0, lim)
        return { data: wantCount ? null : rows, error: null, count: rows.length }
      },
      async maybeSingle() { const r = api.run(); return { data: r.data?.[0] ?? null, error: null } },
      async single()      { const r = api.run(); return { data: r.data?.[0] ?? null, error: null } },
      then(res: any, rej: any) { return Promise.resolve(api.run()).then(res, rej) },
    }
    return api
  }

  return { from, _db: db } as any
}
