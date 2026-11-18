// End-to-end check of the paywall's "Use Stocked Tools free" switch.
//
//   node scripts/test-tools-free.js [baseUrl]      (default http://localhost:3005)
//
// A company whose trial has ended switches to Tools Free; a second click is
// harmless; the account then reaches the tool tracker but not inventory, and
// its scan lookup finds tools and places only. A company on an active paid
// plan is refused. Throwaway companies, removed at the end.
const fs = require('fs'), path = require('path'), crypto = require('crypto')
const { createClient } = require(path.join(process.cwd(), 'node_modules', '@supabase', 'supabase-js'))
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => /^[A-Z_]+=/.test(l))
  .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, '')] }))
const o = { auth: { persistSession: false }, realtime: { transport: class NoSocket {} } }
const svc = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, o)
const BASE = (process.argv[2] || 'http://localhost:3005').replace(/\/$/, '')

let fails = 0
const ok = (c, m) => { console.log(c ? '  PASS ' : '  FAIL ', m); if (!c) fails++ }
const made = []

async function company(tag, orgFields) {
  const email = `toolsfree-${tag}-${Date.now()}@example.com`, password = crypto.randomBytes(12).toString('base64url')
  const { data, error } = await svc.auth.admin.createUser({ email, password, email_confirm: true,
    user_metadata: { full_name: `Tools free ${tag} (delete me)`, company_name: `Tools free ${tag} (delete me)`, onboarding_complete: true } })
  if (error) throw error
  const { data: p } = await svc.from('user_profiles').select('org_id').eq('id', data.user.id).single()
  made.push({ userId: data.user.id, orgId: p.org_id })
  await svc.from('organizations').update(orgFields).eq('id', p.org_id)
  const a = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, o)
  const { data: s } = await a.auth.signInWithPassword({ email, password })
  const H = { Authorization: `Bearer ${s.session.access_token}`, 'Content-Type': 'application/json' }
  const call = async (method, p, body) => {
    const r = await fetch(`${BASE}${p}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined })
    return { status: r.status, json: await r.json().catch(() => ({})) }
  }
  return { orgId: p.org_id, call }
}

;(async () => {
  try {
    console.log(`Tools Free switch against ${BASE}\n`)
    const past = new Date(Date.now() - 3 * 864e5).toISOString()

    console.log('Trial ended → switch')
    const A = await company('ended', { plan: 'trial', plan_status: 'active', trial_ends_at: past })
    const first = await A.call('POST', '/api/billing/tools-free')
    ok(first.status === 200 && first.json.ok === true, `switch accepted (got ${first.status})`)
    const { data: org } = await svc.from('organizations').select('plan, plan_status, max_users').eq('id', A.orgId).single()
    ok(org.plan === 'tools_free' && org.plan_status === 'active', `now on Tools Free (${org.plan}, ${org.plan_status}, ${org.max_users} users)`)
    const again = await A.call('POST', '/api/billing/tools-free')
    ok(again.status === 200 && again.json.already === true, `second click is harmless (got ${again.status})`)

    console.log('\nWhat the account can reach')
    ok((await A.call('GET', '/api/assets')).status === 200, 'tools list opens')
    const po = await A.call('GET', '/api/purchase-orders')
    ok(po.status === 403, `purchase orders are closed (got ${po.status})`)

    // A location (reachable) and a product left over from the trial (not reachable).
    const code = `TFREE-${crypto.randomBytes(2).toString('hex').toUpperCase()}`
    const loc = await A.call('POST', '/api/locations', { name: 'Van 9', code, type: 'other' })
    ok(loc.status === 201 || loc.status === 200, `can add a location (got ${loc.status})`)
    const sku = `TFREE-SKU-${crypto.randomBytes(2).toString('hex').toUpperCase()}`
    await svc.from('products').insert({ org_id: A.orgId, name: 'Leftover product', sku, unit_of_measure: 'pcs', is_active: true })
    const byLoc = await A.call('GET', `/api/scan/resolve?q=${code}`)
    ok(byLoc.status === 200 && byLoc.json?.data?.type === 'location', 'scan finds the location')
    const byProduct = await A.call('GET', `/api/scan/resolve?q=${sku}`)
    ok(byProduct.status === 404, `scan does not return the hidden product (got ${byProduct.status})`)

    console.log('\nActive paid plan → refused')
    const B = await company('paid', { plan: 'pro', plan_status: 'active', trial_ends_at: new Date(Date.now() + 30 * 864e5).toISOString() })
    const refused = await B.call('POST', '/api/billing/tools-free')
    ok(refused.status === 409, `refused while the plan is active (got ${refused.status})`)
    const { data: orgB } = await svc.from('organizations').select('plan').eq('id', B.orgId).single()
    ok(orgB.plan === 'pro', 'plan unchanged')
  } catch (e) {
    console.log('ERROR', e.message); fails++
  } finally {
    for (const m of made) { await svc.rpc('purge_organization', { p_org_id: m.orgId }); await svc.auth.admin.deleteUser(m.userId).catch(() => {}) }
    console.log(`\n${fails ? `${fails} FAILED` : 'ALL PASSED'} (${made.length} test companies removed)`)
    process.exit(fails ? 1 : 0)
  }
})()
