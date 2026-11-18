// End-to-end check that "today" and report days follow the company's time zone.
//
//   node scripts/test-timezone.js [baseUrl]      (default http://localhost:3005)
//
// Needs scripts/migrate-org-timezone.sql. Creates a throwaway company, signs
// in, moves it between time zones far from UTC and checks that the server's
// "today" (as echoed by the purchase-spend report's default range) follows,
// then removes the company.
const fs = require('fs'), path = require('path'), crypto = require('crypto')
const { createClient } = require(path.join(process.cwd(), 'node_modules', '@supabase', 'supabase-js'))
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => /^[A-Z_]+=/.test(l))
  .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, '')] }))
const o = { auth: { persistSession: false }, realtime: { transport: class NoSocket {} } }
const svc = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, o)
const BASE = (process.argv[2] || 'http://localhost:3005').replace(/\/$/, '')

let fails = 0
const ok = (c, m) => { console.log(c ? '  PASS ' : '  FAIL ', m); if (!c) fails++ }
const dayIn = tz => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())

;(async () => {
  let c
  try {
    const email = `tz-test-${Date.now()}@example.com`, password = crypto.randomBytes(12).toString('base64url')
    const { data, error } = await svc.auth.admin.createUser({ email, password, email_confirm: true,
      user_metadata: { full_name: 'TZ test (delete me)', company_name: 'TZ test (delete me)', onboarding_complete: true } })
    if (error) throw error
    const { data: p } = await svc.from('user_profiles').select('org_id').eq('id', data.user.id).single()
    c = { userId: data.user.id, orgId: p.org_id }
    await svc.from('organizations').update({ plan: 'pro', plan_status: 'active' }).eq('id', c.orgId)
    const a = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, o)
    const { data: s } = await a.auth.signInWithPassword({ email, password })
    const H = { Authorization: `Bearer ${s.session.access_token}`, 'Content-Type': 'application/json' }
    const call = async (method, p, body) => {
      const r = await fetch(`${BASE}${p}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined })
      return { status: r.status, json: await r.json().catch(() => ({})) }
    }
    const serverToday = async () => (await call('GET', '/api/reports/purchase-spend')).json?.meta?.to

    console.log(`Time zones against ${BASE}\n`)
    ok((await serverToday()) === dayIn('UTC'), `no zone set: today is the UTC date (${dayIn('UTC')})`)

    // Kiritimati is UTC+14 and Pago Pago UTC-11: at most times of day one or
    // both are on a different date from UTC, so a wrong "today" shows.
    const first = await call('POST', '/api/org/timezone', { timezone: 'Pacific/Kiritimati' })
    ok(first.status === 200 && first.json.set === true, 'first browser fills in the zone')
    ok((await serverToday()) === dayIn('Pacific/Kiritimati'), `today follows Kiritimati (${dayIn('Pacific/Kiritimati')})`)

    const second = await call('POST', '/api/org/timezone', { timezone: 'Europe/London' })
    ok(second.status === 200 && second.json.set === false && second.json.timezone === 'Pacific/Kiritimati',
      'a later browser cannot overwrite it')

    const bad = await call('PATCH', '/api/org', { timezone: 'Mars/Olympus_Mons' })
    ok(bad.status === 422, `an unknown zone is refused (got ${bad.status})`)

    const owner = await call('PATCH', '/api/org', { timezone: 'Pacific/Pago_Pago' })
    ok(owner.status === 200, 'the owner can change it in Settings')
    ok((await serverToday()) === dayIn('Pacific/Pago_Pago'), `today follows Pago Pago (${dayIn('Pacific/Pago_Pago')})`)
    const org = await call('GET', '/api/org')
    ok(org.json?.data?.timezone === 'Pacific/Pago_Pago', 'Settings reads the saved zone back')

    // A one-day range covers exactly that day on the company's clock.
    const day = dayIn('Pacific/Pago_Pago')
    const r = await call('GET', `/api/reports/purchase-spend?from=${day}&to=${day}`)
    ok(r.status === 200 && r.json?.meta?.from === day && r.json?.meta?.to === day, 'an explicit one-day range is accepted')
  } catch (e) {
    console.log('ERROR', e.message); fails++
  } finally {
    if (c) { await svc.rpc('purge_organization', { p_org_id: c.orgId }); await svc.auth.admin.deleteUser(c.userId).catch(() => {}) }
    console.log(`\n${fails ? `${fails} FAILED` : 'ALL PASSED'}${c ? ' (test company removed)' : ''}`)
    process.exit(fails ? 1 : 0)
  }
})()
