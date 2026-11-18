// End-to-end check of every email link that goes through /auth/confirm.
//
//   node scripts/test-email-links.js [baseUrl]      (default http://localhost:3005)
//
// For each kind of email it creates the link exactly as the Supabase template
// (docs/email-templates/*.html) or the app's own invite email builds it, then
// opens it with NO existing session, the same as tapping it on another device,
// and checks where it lands and that it signs the person in. No email is sent:
// links come from auth.admin.generateLink. Every throwaway user and company it
// creates is removed at the end.
const fs = require('fs'), path = require('path'), crypto = require('crypto')
const { createClient } = require(path.join(process.cwd(), 'node_modules', '@supabase', 'supabase-js'))
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => /^[A-Z_]+=/.test(l))
  .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, '')] }))
const svc = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false }, realtime: { transport: class NoSocket {} } })
const BASE = (process.argv[2] || 'http://localhost:3005').replace(/\/$/, '')

let fails = 0
const ok = (c, m) => { console.log(c ? '  PASS ' : '  FAIL ', m); if (!c) fails++ }
const users = []
const stamp = Date.now()
const addr = tag => `email-links-${tag}-${stamp}@example.com`

// Open a link the way a fresh browser would: no cookies, don't follow redirects.
async function open(url, cookie) {
  const res = await fetch(url, { redirect: 'manual', headers: cookie ? { Cookie: cookie } : {} })
  const loc = res.headers.get('location') || ''
  const set = (res.headers.getSetCookie?.() ?? []).map(c => c.split(';')[0])
  return { status: res.status, path: loc ? new URL(loc, BASE).pathname + new URL(loc, BASE).search : '', cookie: set.join('; ') }
}
const confirmUrl = (hash, type, next) =>
  `${BASE}/auth/confirm?token_hash=${encodeURIComponent(hash)}&type=${type}&next=${encodeURIComponent(next)}`
const hasSession = cookie => /sb-[^=]+-auth-token/.test(cookie)

async function link(params) {
  const { data, error } = await svc.auth.admin.generateLink(params)
  if (error) throw new Error(`generateLink ${params.type}: ${error.message}`)
  if (data.user) users.push(data.user.id)
  return { hash: data.properties.hashed_token, user: data.user }
}

;(async () => {
  try {
    console.log(`Email links against ${BASE}\n`)

    console.log('Confirm sign-up (template: confirm-signup.html, type=email)')
    const su = await link({ type: 'signup', email: addr('signup'), password: crypto.randomBytes(12).toString('base64url') })
    ok(!su.user.email_confirmed_at, 'new sign-up starts unconfirmed')
    const s1 = await open(confirmUrl(su.hash, 'email', '/dashboard'))
    ok(s1.status >= 300 && s1.status < 400 && s1.path === '/dashboard', `link lands on /dashboard (got ${s1.status} ${s1.path})`)
    ok(hasSession(s1.cookie), 'link signs them in (session cookie set)')
    const { data: after } = await svc.auth.admin.getUserById(su.user.id)
    ok(!!after.user.email_confirmed_at, 'email is now confirmed')
    const d = await open(`${BASE}/dashboard`, s1.cookie)
    ok(d.path.startsWith('/onboarding'), `new account is sent to onboarding (got ${d.status} ${d.path})`)
    const s2 = await open(confirmUrl(su.hash, 'email', '/dashboard'))
    ok(s2.path === '/login?error=confirm_link_invalid', `second click explains the link was used (got ${s2.path})`)

    console.log('\nInvite (app email and invite.html, type=invite)')
    const inv = await link({ type: 'invite', email: addr('invite') })
    const i1 = await open(confirmUrl(inv.hash, 'invite', '/reset-password'))
    ok(i1.path === '/reset-password' && hasSession(i1.cookie), `lands signed in on /reset-password (got ${i1.status} ${i1.path})`)
    const i2 = await open(confirmUrl(inv.hash, 'invite', '/reset-password'))
    ok(i2.path === '/login?error=invite_link_invalid', `second click says invite expired/used (got ${i2.path})`)

    console.log('\nResent invite (app email, type=magiclink)')
    const rs = await link({ type: 'magiclink', email: addr('invite') })
    const r1 = await open(confirmUrl(rs.hash, 'magiclink', '/reset-password'))
    ok(r1.path === '/reset-password' && hasSession(r1.cookie), `lands signed in on /reset-password (got ${r1.status} ${r1.path})`)

    console.log('\nMagic link (template: magic-link.html, type=email)')
    const ml = await link({ type: 'magiclink', email: addr('signup') })
    const m1 = await open(confirmUrl(ml.hash, 'email', '/dashboard'))
    ok(m1.path === '/dashboard' && hasSession(m1.cookie), `lands signed in on /dashboard (got ${m1.status} ${m1.path})`)

    console.log('\nPassword reset (template: reset-password.html, type=recovery)')
    const rc = await link({ type: 'recovery', email: addr('signup') })
    const p1 = await open(confirmUrl(rc.hash, 'recovery', '/reset-password'))
    ok(p1.path === '/reset-password' && hasSession(p1.cookie), `lands signed in on /reset-password (got ${p1.status} ${p1.path})`)
    const p2 = await open(confirmUrl(rc.hash, 'recovery', '/reset-password'))
    ok(p2.path === '/login?error=reset_link_invalid', `second click says reset link expired/used (got ${p2.path})`)

    console.log('\nChange email (template: change-email.html, type=email_change)')
    // Only the link to the CURRENT address can be checked this way: a link
    // generateLink makes for the new address is always refused as expired
    // (seen 2026-11-18), so that half needs a real email. The app has no
    // change-email screen today, so customers never receive this email.
    const ec = await link({ type: 'email_change_current', email: addr('signup'), newEmail: addr('changed') })
    const e1 = await open(confirmUrl(ec.hash, 'email_change', '/dashboard'))
    ok(e1.path === '/dashboard', `link to the current address is accepted (got ${e1.status} ${e1.path})`)

    console.log('\nBad links')
    const b1 = await open(confirmUrl('not-a-real-token', 'email', '/dashboard'))
    ok(b1.path === '/login?error=confirm_link_invalid', `bad sign-up link explained (got ${b1.path})`)
    const fresh = await link({ type: 'magiclink', email: addr('signup') })
    const b2 = await open(confirmUrl(fresh.hash, 'email', '//evil.example'))
    ok(b2.path === '/dashboard', `a valid link with an off-site "next" goes to /dashboard instead (got ${b2.path})`)
  } catch (e) {
    console.log('ERROR', e.message); fails++
  } finally {
    for (const id of [...new Set(users)]) {
      const { data: p } = await svc.from('user_profiles').select('org_id').eq('id', id).maybeSingle()
      if (p?.org_id) {
        const { count } = await svc.from('user_profiles').select('id', { count: 'exact', head: true }).eq('org_id', p.org_id)
        if (count === 1) await svc.rpc('purge_organization', { p_org_id: p.org_id })
      }
      await svc.auth.admin.deleteUser(id).catch(() => {})
    }
    console.log(`\n${fails ? `${fails} FAILED` : 'ALL PASSED'} (cleaned up ${new Set(users).size} test users)`)
    process.exit(fails ? 1 : 0)
  }
})()
