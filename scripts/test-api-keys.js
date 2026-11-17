// End-to-end test of per-organization API keys (HANDOFF.md, Launch audit A3).
//
//   node scripts/test-api-keys.js [baseUrl]      default http://localhost:3005 (dev server)
//
// Creates two throwaway companies on Pro (A and B, "(delete me)") plus a finance user in A,
// and checks: creating, listing and revoking keys; POS, JobLedger and accounting calls;
// cross-company refusals; wrong-scope and made-up keys; plan limits; audit log.
// Both companies are purged at the end, even on failure. Exit code 0 = all passed.
const fs = require('fs'), path = require('path'), crypto = require('crypto')
const { createClient } = require(path.join(process.cwd(), 'node_modules', '@supabase', 'supabase-js'))
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => /^[A-Z_]+=/.test(l))
  .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, '')] }))
const o = { auth: { persistSession: false }, realtime: { transport: class NoSocket {} } }
const svc = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, o)
const BASE = process.argv[2] || 'http://localhost:3005'

let fails = 0
const ok = (c, m) => { console.log(c ? '  PASS ' : '  FAIL ', m); if (!c) fails++ }

async function company(tag, extra = {}) {
  const email = `keys-test-${tag}-${Date.now()}@example.com`
  const password = crypto.randomBytes(12).toString('base64url')
  const { data, error } = await svc.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { full_name: `Keys ${tag} (delete me)`, company_name: `Keys ${tag} (delete me)`, onboarding_complete: true, ...extra },
  })
  if (error) throw error
  const { data: p } = await svc.from('user_profiles').select('org_id').eq('id', data.user.id).single()
  const a = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, o)
  const { data: s } = await a.auth.signInWithPassword({ email, password })
  return { userId: data.user.id, orgId: p.org_id, token: s.session.access_token }
}

async function call(method, p, { token, key, body } = {}) {
  const h = { 'Content-Type': 'application/json' }
  if (token) h.Authorization = 'Bearer ' + token
  if (key) h.Authorization = 'Bearer ' + key
  const r = await fetch(BASE + p, { method, headers: h, body: body ? JSON.stringify(body) : undefined })
  let j; try { j = await r.json() } catch { j = {} }
  return { s: r.status, j }
}

async function seed(c, t) {
  const { data: l, error: le } = await svc.from('locations')
    .insert({ org_id: c.orgId, name: 'Shop ' + t, code: 'K' + t + (Date.now() % 100000), type: 'store', level: 0, is_active: true }).select('id').single()
  if (le) throw le
  const { data: pr, error: pe } = await svc.from('products')
    .insert({ org_id: c.orgId, name: 'Key item ' + t, sku: 'KEY-' + t + '-' + Date.now() }).select('id, sku').single()
  if (pe) throw pe
  const { error: be } = await svc.from('inventory_balances')
    .insert({ org_id: c.orgId, product_id: pr.id, location_id: l.id, quantity: 10, avg_cost: 2 })
  if (be) throw be
  return { loc: l.id, prod: pr.id, sku: pr.sku }
}

;(async () => {
  let A, B, F
  try {
    A = await company('A'); B = await company('B')
    // POS and JobLedger keys need Enterprise ('integrations'); the accounting feed needs Pro.
    await svc.from('organizations').update({ plan: 'enterprise', plan_status: 'active' }).eq('id', A.orgId)
    await svc.from('organizations').update({ plan: 'enterprise', plan_status: 'active' }).eq('id', B.orgId)
    const a = await seed(A, 'A'), b = await seed(B, 'B')
    const mk = (c, scope, name) => call('POST', '/api/api-keys', { token: c.token, body: { name, scope } })
    const sale = (key, loc, prod, q = 1) => call('POST', '/api/pos/sale', { key, body: { location_id: loc, items: [{ product_id: prod, quantity: q, unit_price: 5 }] } })

    console.log('\n1. Creating keys (owner, Settings -> API keys)')
    const pos = await mk(A, 'pos', 'Shop till'), acc = await mk(A, 'accounting', 'Books'), jl = await mk(A, 'jobledger', 'JobLedger')
    ok(pos.s === 201 && /^stk_pos_/.test(pos.j.key) && acc.s === 201 && jl.s === 201, 'owner creates pos, accounting and JobLedger keys; full key returned once')
    const { data: stored } = await svc.from('api_keys').select('key_hash, key_prefix').eq('id', pos.j.data.id).single()
    ok(stored.key_hash === crypto.createHash('sha256').update(pos.j.key).digest('hex') && !JSON.stringify(stored).includes(pos.j.key),
      'database holds only the hash, never the key')
    const list = await call('GET', '/api/api-keys', { token: A.token })
    ok(list.s === 200 && list.j.data.length === 3 && !JSON.stringify(list.j).includes(pos.j.key) && !JSON.stringify(list.j).includes('key_hash'),
      'list shows 3 keys without the key or its hash')
    ok((await call('GET', '/api/api-keys', { token: B.token })).j.data.length === 0, "company B can't see A's keys")
    ok((await mk(A, 'admin', 'x')).s === 400 && (await mk(A, 'pos', '')).s === 400, 'bad scope or empty name refused')
    F = await company('F', { org_id: A.orgId, role: 'finance' })
    ok((await mk(F, 'pos', 'sneaky')).s === 403 && (await call('GET', '/api/api-keys', { token: F.token })).s === 403,
      'a non-owner in A cannot list or create keys')

    console.log('\n2. Point of sale')
    const s1 = await sale(pos.j.key, a.loc, a.prod)
    const { data: bal } = await svc.from('inventory_balances').select('quantity').eq('product_id', a.prod).eq('location_id', a.loc).single()
    const { data: tx } = await svc.from('inventory_transactions').select('org_id').eq('product_id', a.prod).eq('transaction_type', 'sale')
    ok(s1.s === 200 && Number(bal.quantity) === 9 && tx.length === 1 && tx[0].org_id === A.orgId, "A's key sells A's stock: 10 -> 9, booked to A")
    ok((await sale(pos.j.key, b.loc, b.prod)).s === 422, "A's key refused at B's location")
    ok((await sale(pos.j.key, a.loc, b.prod)).s === 422, "A's key refused for B's product at A's location")
    const { data: bb } = await svc.from('inventory_balances').select('quantity').eq('product_id', b.prod).single()
    ok(Number(bb.quantity) === 10, "B's stock untouched (10)")
    ok((await sale(acc.j.key, a.loc, a.prod)).s === 403, 'an accounting key cannot sell')
    ok((await sale('stk_pos_' + crypto.randomBytes(32).toString('base64url'), a.loc, a.prod)).s === 401, 'a made-up key is refused')
    ok((await sale('some-old-shared-secret', a.loc, a.prod)).s === 401, 'an old-style shared key is refused')
    ok((await call('POST', '/api/pos/sale', { token: A.token, body: { location_id: a.loc, items: [{ product_id: a.prod, quantity: 1, unit_price: 1 }] } })).s === 401,
      'a login token is not accepted as a POS key')

    console.log('\n3. JobLedger')
    const jp = await call('GET', '/api/jobledger/products', { key: jl.j.key })
    ok(jp.s === 200 && jp.j.products.length === 1 && jp.j.products[0].sku === a.sku, "products: only A's item")
    ok((await call('GET', '/api/jobledger/products?org_id=' + A.orgId, { key: jl.j.key })).s === 200,
      "products with A's own org_id (as JobLedger sends today) still works")
    ok((await call('GET', '/api/jobledger/products?org_id=' + B.orgId, { key: jl.j.key })).s === 403, "products with B's org_id refused")
    ok((await call('GET', '/api/jobledger/materials?job_id=J-1&org_id=' + A.orgId, { key: jl.j.key })).s === 200, 'materials works')
    const rd = await call('POST', '/api/jobledger/readiness', { key: jl.j.key, body: { org_id: A.orgId, job_id: 'J-1', materials: [{ sku: a.sku, quantity_needed: 3 }, { sku: b.sku, quantity_needed: 1 }] } })
    const lineA = rd.j.materials?.find(m => m.sku === a.sku), lineB = rd.j.materials?.find(m => m.sku === b.sku)
    ok(rd.s === 200 && Number(lineA?.on_hand) === 9 && lineB?.status === 'product_not_found', "readiness: sees A's 9 on hand, not B's item")
    ok((await call('POST', '/api/jobledger/readiness', { key: jl.j.key, body: { org_id: B.orgId, job_id: 'J', materials: [{ sku: b.sku, quantity_needed: 1 }] } })).s === 403,
      "readiness with B's org_id refused")
    ok((await call('GET', '/api/jobledger/products', { key: pos.j.key })).s === 403, 'a POS key cannot read JobLedger feeds')

    console.log('\n4. Accounting feeds')
    const today = new Date().toISOString().slice(0, 10)
    const jr = await call('GET', `/api/accounting/journal?from=2026-01-01&to=${today}`, { key: acc.j.key })
    ok(jr.s === 200 && Array.isArray(jr.j.data), 'journal works with the accounting key')
    ok((await call('GET', `/api/accounting/journal?from=2026-01-01&to=${today}&org_id=${B.orgId}`, { key: acc.j.key })).s === 403, "journal with B's org_id refused")
    ok((await call('GET', '/api/accounting/payables', { key: acc.j.key })).s === 200, 'payables works with the accounting key')
    ok((await call('GET', `/api/accounting/journal?from=2026-01-01&to=${today}`, { token: A.token })).s === 200, 'journal still works for a signed-in owner (no key)')

    console.log('\n5. Plan limits')
    const bPos = await mk(B, 'pos', 'B till')            // B on Enterprise: allowed
    await svc.from('organizations').update({ plan: 'pro' }).eq('id', B.orgId)
    ok((await mk(B, 'pos', 'B till 2')).s === 403 && (await mk(B, 'jobledger', 'JL')).s === 403, 'a Pro company cannot create POS or JobLedger keys')
    ok(bPos.s === 201 && (await sale(bPos.j.key, b.loc, b.prod)).s === 403, 'a POS key stops working when the company drops to Pro')
    const bAcc = await mk(B, 'accounting', 'Books B')
    ok(bAcc.s === 201, 'a Pro company can create an accounting key')
    await svc.from('organizations').update({ plan: 'starter' }).eq('id', B.orgId)
    ok((await mk(B, 'accounting', 'Books B2')).s === 403, 'a Starter company cannot create an accounting key')
    ok((await call('GET', '/api/accounting/payables', { key: bAcc.j.key })).s === 403, 'an accounting key stops working on Starter')

    console.log('\n6. Revoking')
    const { data: used } = await svc.from('api_keys').select('last_used_at').eq('id', pos.j.data.id).single()
    ok(!!used.last_used_at, 'last used time recorded')
    ok((await call('DELETE', '/api/api-keys/' + pos.j.data.id, { token: B.token })).s === 404, "B cannot revoke A's key")
    ok((await call('DELETE', '/api/api-keys/' + pos.j.data.id, { token: A.token })).s === 200, 'owner revokes the POS key')
    ok((await sale(pos.j.key, a.loc, a.prod)).s === 401, 'revoked key stops working immediately')
    ok((await call('DELETE', '/api/api-keys/' + pos.j.data.id, { token: A.token })).s === 404, 'revoking twice says not found')
    const { data: au } = await svc.from('audit_log').select('action').eq('org_id', A.orgId).like('action', 'api_key.%')
    ok(au.filter(x => x.action === 'api_key.create').length === 3 && au.some(x => x.action === 'api_key.revoke'), 'create and revoke are in the audit log')
  } catch (e) {
    ok(false, 'test crashed: ' + e.message)
  } finally {
    for (const c of [A, B]) if (c) { const { error } = await svc.rpc('purge_organization', { p_org_id: c.orgId }); if (error) console.log('purge', error.message) }
    for (const c of [A, B, F]) if (c) await svc.auth.admin.deleteUser(c.userId).catch(() => {})
    const ids = [A?.orgId, B?.orgId].filter(Boolean)
    const left = ids.length ? (await svc.from('api_keys').select('id', { count: 'exact', head: true }).in('org_id', ids)).count : 0
    console.log(`\n${fails ? 'FAILED: ' + fails : 'ALL PASSED'} — test companies removed, api_keys left behind: ${left}`)
    process.exit(fails ? 1 : 0)
  }
})()
