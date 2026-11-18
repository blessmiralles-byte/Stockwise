// The /api/admin routes are for the people running Stocked, not for customers.
//
//   node scripts/test-admin-gate.js [baseUrl]            ordinary owner is refused
//   node scripts/test-admin-gate.js [baseUrl] --admin    also: a listed admin gets the
//        report and no secret values. Needs the server started with
//        PLATFORM_ADMIN_EMAILS=platform-admin-test@example.com (local only).
//
// Throwaway companies, removed at the end.
const fs = require('fs'), path = require('path'), crypto = require('crypto')
const { createClient } = require(path.join(process.cwd(), 'node_modules', '@supabase', 'supabase-js'))
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => /^[A-Z_]+=/.test(l))
  .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, '')] }))
const o = { auth: { persistSession: false }, realtime: { transport: class NoSocket {} } }
const svc = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, o)
const args = process.argv.slice(2)
const BASE = (args.find(a => !a.startsWith('--')) || 'http://localhost:3005').replace(/\/$/, '')
const WITH_ADMIN = args.includes('--admin')
const ADMIN_EMAIL = 'platform-admin-test@example.com'

let fails = 0
const ok = (c, m) => { console.log(c ? '  PASS ' : '  FAIL ', m); if (!c) fails++ }
const made = []

async function owner(email) {
  const password = crypto.randomBytes(12).toString('base64url')
  const { data, error } = await svc.auth.admin.createUser({ email, password, email_confirm: true,
    user_metadata: { full_name: 'Admin gate (delete me)', company_name: 'Admin gate (delete me)', onboarding_complete: true } })
  if (error) throw error
  const { data: p } = await svc.from('user_profiles').select('org_id, role').eq('id', data.user.id).single()
  made.push({ userId: data.user.id, orgId: p.org_id })
  const a = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, o)
  const { data: s } = await a.auth.signInWithPassword({ email, password })
  const get = async p2 => {
    const r = await fetch(`${BASE}${p2}`, { headers: { Authorization: `Bearer ${s.session.access_token}` } })
    const text = await r.text()
    return { status: r.status, text, json: (() => { try { return JSON.parse(text) } catch { return null } })() }
  }
  return { role: p.role, get }
}

;(async () => {
  try {
    console.log(`Admin routes against ${BASE}\n`)

    console.log('No sign-in')
    for (const p of ['/api/admin/metrics', '/api/admin/config-check']) {
      const r = await fetch(`${BASE}${p}`)
      ok(r.status === 401 || r.status === 404, `${p} refused (got ${r.status})`)
    }

    console.log('\nAn ordinary customer (owner of their own company)')
    const A = await owner(`admin-gate-${Date.now()}@example.com`)
    ok(A.role === 'owner', `is the owner of their company (${A.role})`)
    for (const p of ['/api/admin/metrics', '/api/admin/config-check']) {
      const r = await A.get(p)
      ok(r.status === 404, `${p} → 404 (got ${r.status})`)
      ok(!/ownerEmail|orgName|SUPABASE/.test(r.text), `${p} body reveals nothing`)
    }

    if (WITH_ADMIN) {
      console.log(`\nA listed platform admin (${ADMIN_EMAIL})`)
      const { data: list } = await svc.auth.admin.listUsers({ perPage: 1000 })
      const stale = list?.users?.find(u => u.email === ADMIN_EMAIL)
      if (stale) {
        const { data: sp } = await svc.from('user_profiles').select('org_id').eq('id', stale.id).maybeSingle()
        if (sp?.org_id) await svc.rpc('purge_organization', { p_org_id: sp.org_id })
        await svc.auth.admin.deleteUser(stale.id).catch(() => {})
      }
      const B = await owner(ADMIN_EMAIL)
      const cfg = await B.get('/api/admin/config-check')
      ok(cfg.status === 200 && Array.isArray(cfg.json?.vars), `config-check opens (got ${cfg.status})`)
      const secrets = [env.SUPABASE_SERVICE_ROLE_KEY, env.CRON_SECRET, env.RESEND_API_KEY, env.NEXT_PUBLIC_SUPABASE_ANON_KEY].filter(Boolean)
      ok(secrets.every(s => !cfg.text.includes(s)), 'no secret value appears in the report')
      const svcRow = cfg.json?.vars?.find(v => v.name === 'SUPABASE_SERVICE_ROLE_KEY')
      ok(svcRow?.set === true && svcRow.value === undefined, 'secrets reported as set, without the value')
      const met = await B.get('/api/admin/metrics')
      ok(met.status === 200 && typeof met.json?.summary?.totalOrgs === 'number', `metrics opens (got ${met.status})`)
    }
  } catch (e) {
    console.log('ERROR', e.message); fails++
  } finally {
    for (const m of made) { await svc.rpc('purge_organization', { p_org_id: m.orgId }); await svc.auth.admin.deleteUser(m.userId).catch(() => {}) }
    console.log(`\n${fails ? `${fails} FAILED` : 'ALL PASSED'} (${made.length} test companies removed)`)
    process.exit(fails ? 1 : 0)
  }
})()
