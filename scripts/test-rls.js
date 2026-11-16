// Row-level security check (HANDOFF.md, Launch audit A1). Rerun after ANY database change.
//
//   node scripts/test-rls.js
//
// Creates two throwaway companies (A and B, "(delete me)"), signs in as A's owner with the
// public anon key — exactly what a browser or the mobile app holds — and tries to reach
// data it must not. Both companies are purged at the end, even on failure.
// Touches no real company's rows: cross-company writes are attempted only against B.
//
// Exit code 0 = every check passed.
const fs = require('fs'), path = require('path'), crypto = require('crypto')
const { createClient } = require(path.join(process.cwd(), 'node_modules', '@supabase', 'supabase-js'))
const env = Object.fromEntries(fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8').split(/\r?\n/)
  .filter(l => /^[A-Z_]+=/.test(l)).map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, '')] }))
const opts = { auth: { persistSession: false }, realtime: { transport: class NoSocket {} } }
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL
const svc  = createClient(URL_, env.SUPABASE_SERVICE_ROLE_KEY, opts)
const anon = createClient(URL_, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, opts)
const asA  = createClient(URL_, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, opts)

// Functions a signed-in user is meant to be able to call (used inside policies).
const USER_CALLABLE = new Set(['current_user_org_id', 'current_user_role', 'is_period_open', 'is_period_open_for'])
// Server-only tables with no read policy at all.
const SERVER_ONLY = new Set(['trial_claims', 'schema_migrations', 'barcode_cache', 'job_orders', 'support_kb_articles'])

let failures = 0
const pass = m => console.log('  PASS ', m)
const fail = m => { failures++; console.log('  FAIL ', m) }
const check = (ok, m) => (ok ? pass(m) : fail(m))
const denied = e => !!e && /permission denied|row-level security|violates/i.test(e.message)

async function makeCompany(tag) {
  const email = `rls-test-${tag}-${Date.now()}@example.com`
  const password = crypto.randomBytes(12).toString('base64url')
  const { data, error } = await svc.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { full_name: `RLS Test ${tag} (delete me)`, company_name: `RLS Test ${tag} (delete me)`, onboarding_complete: true },
  })
  if (error) throw error
  const { data: p } = await svc.from('user_profiles').select('org_id').eq('id', data.user.id).single()
  if (!p?.org_id) throw new Error(`no organization was created for ${tag}`)
  const { data: loc, error: le } = await svc.from('locations')
    .insert({ org_id: p.org_id, name: `Yard ${tag}`, code: `RLS${tag}`, type: 'other', level: 0, is_active: true }).select('id').single()
  if (le) throw le
  const { data: prod, error: pe } = await svc.from('products')
    .insert({ org_id: p.org_id, name: `RLS product ${tag} (delete me)`, sku: `RLS-${tag}-${Date.now()}` }).select('id, name').single()
  if (pe) throw pe
  return { email, password, userId: data.user.id, orgId: p.org_id, locationId: loc.id, product: prod }
}

async function removeCompany(c) {
  if (!c) return
  const { error } = await svc.rpc('purge_organization', { p_org_id: c.orgId })
  if (error) console.log('  cleanup: purge failed for', c.orgId, error.message)
  await svc.auth.admin.deleteUser(c.userId).catch(() => {})
}

;(async () => {
  let A, B
  try {
    A = await makeCompany('A'); B = await makeCompany('B')
    const { error: se } = await asA.auth.signInWithPassword({ email: A.email, password: A.password })
    if (se) throw se

    const spec = await fetch(URL_ + '/rest/v1/', {
      headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY },
    }).then(r => r.json())
    const tables = Object.keys(spec.definitions || {})

    console.log(`\n1. Reads — ${tables.length} tables, as logged-out (anon) and as company A`)
    for (const t of tables) {
      const a = await anon.from(t).select('*', { count: 'exact', head: true })
      if (!a.error && a.count > 0) fail(`${t}: anon can read ${a.count} rows`)
      const u = await asA.from(t).select('*').limit(1000)
      if (u.error) continue
      const foreign = u.data.filter(r => 'org_id' in r && r.org_id && r.org_id !== A.orgId).length
      if (foreign) fail(`${t}: company A sees ${foreign} rows of other companies`)
      if (t === 'organizations' && u.data.some(r => r.id !== A.orgId)) fail('organizations: company A sees other companies')
      if (SERVER_ONLY.has(t) && u.data.length) fail(`${t}: server-only table readable by a user (${u.data.length} rows)`)
    }
    if (!failures) pass('no table readable by anon; no other company\'s rows visible to A')

    console.log('\n2. A can still read its own company (the mobile app needs this)')
    const own = await asA.from('products').select('id').eq('id', A.product.id)
    check(own.data?.length === 1, 'A reads its own product')
    const ownLoc = await asA.from('locations').select('id').eq('id', A.locationId)
    check(ownLoc.data?.length === 1, 'A reads its own location')
    const me = await asA.from('user_profiles').select('id').eq('id', A.userId)
    check(me.data?.length === 1, 'A reads its own profile')
    const org = await asA.from('organizations').select('id').eq('id', A.orgId)
    check(org.data?.length === 1, 'A reads its own organization')

    console.log('\n3. Writes — A may not change anything directly (writes go through the API)')
    const upB = await asA.from('products').update({ name: 'hacked' }).eq('id', B.product.id).select('id')
    const delB = await asA.from('products').delete().eq('id', B.product.id).select('id')
    const { data: bAfter } = await svc.from('products').select('name').eq('id', B.product.id).single()
    check(bAfter?.name === B.product.name && !(upB.data?.length) && !(delB.data?.length), "A cannot update or delete company B's product")
    const insB = await asA.from('products').insert({ org_id: B.orgId, name: 'planted', sku: 'RLS-PLANT-' + Date.now() }).select('id')
    check(!!insB.error, "A cannot insert into company B")
    const upA = await asA.from('products').update({ name: 'direct edit' }).eq('id', A.product.id).select('id')
    const { data: aAfter } = await svc.from('products').select('name').eq('id', A.product.id).single()
    check(aAfter?.name === A.product.name && !(upA.data?.length), 'A cannot write even its own rows directly')
    const roleUp = await asA.from('user_profiles').update({ role: 'owner', org_id: B.orgId }).eq('id', A.userId).select('id')
    const { data: meAfter } = await svc.from('user_profiles').select('org_id').eq('id', A.userId).single()
    check(meAfter?.org_id === A.orgId && !(roleUp.data?.length), 'A cannot move itself into company B')
    const anonIns = await anon.from('organizations').insert({ name: 'rls probe (delete me)' }).select('id')
    check(!!anonIns.error, 'anon cannot create an organization')

    console.log('\n4. Functions — only the policy helpers may be called with the public key')
    const R = () => crypto.randomUUID()
    for (const p of Object.keys(spec.paths).filter(p => p.startsWith('/rpc/'))) {
      const fn = p.slice(5)
      const body = (spec.paths[p].post?.parameters || []).find(x => x.in === 'body')
      const args = {}
      for (const [k, v] of Object.entries(body?.schema?.properties || {})) {
        const f = v.format || ''
        // Random ids match nothing, so even an allowed call changes no real row.
        args[k] = /uuid/.test(f) ? R() : /int|numeric|double|real/.test(f) ? 0 : /bool/.test(f) ? false
          : /json/.test(f) ? [] : /date|time/.test(f) ? '2000-01-01' : 'rls-probe'
      }
      for (const [who, client] of [['anon', anon], ['company A', asA]]) {
        const r = await client.rpc(fn, args)
        const allowed = !/permission denied/i.test(r.error?.message ?? '')
        const expectAllowed = who !== 'anon' && USER_CALLABLE.has(fn)
        if (allowed && !expectAllowed) fail(`${fn}: callable by ${who}`)
      }
    }
    // If record_migration was callable, it wrote a row; remove it.
    await svc.from('schema_migrations').delete().eq('name', 'rls-probe')
    pass('function check finished (any FAIL lines above name the function)')
  } catch (e) {
    fail('test could not run: ' + (e.message ?? e))
  } finally {
    await removeCompany(A); await removeCompany(B)
    console.log(`\n${failures ? `FAILED: ${failures} problem(s)` : 'ALL PASSED'} — throwaway companies removed`)
    process.exit(failures ? 1 : 0)
  }
})()
