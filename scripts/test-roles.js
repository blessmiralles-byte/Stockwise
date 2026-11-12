// Role-by-role permission test against the running dev server (localhost:3005). Creates a throwaway
// company with one user per role, runs ~50 actions as each, prints a role x action table.
//   node roles-test.js setup     create a company with one user per role
//   node roles-test.js run       run the matrix, write roles-result.json
//   node roles-test.js remove    purge the company and its logins
// Run from the project directory.
const fs = require('fs'), path = require('path'), crypto = require('crypto')
const { createClient } = require(path.join(process.cwd(), 'node_modules', '@supabase', 'supabase-js'))
const env = Object.fromEntries(fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8').split(/\r?\n/).filter(l => /^[A-Z_]+=/.test(l))
  .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, '')] }))
const opts = { auth: { persistSession: false }, realtime: { transport: class NoSocket {} } }
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, opts)
const STATE = path.join(require('os').tmpdir(), 'stocked-roles-state.json')
const BASE = 'http://localhost:3005'
const ROLES = ['owner', 'procurement', 'operations', 'receiver', 'finance', 'viewer']

async function setup() {
  const stamp = Date.now()
  const users = {}
  const mk = async (role, meta) => {
    const email = `role-${role}-${stamp}@example.com`
    const password = crypto.randomBytes(12).toString('base64url')
    const { data, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: `${role} (delete me)`, onboarding_complete: true, ...meta } })
    if (error) throw new Error(role + ': ' + error.message)
    users[role] = { email, password, id: data.user.id }
  }
  await mk('owner', { company_name: 'Roles Test Co (delete me)' })
  const { data: op } = await sb.from('user_profiles').select('org_id, role').eq('id', users.owner.id).single()
  const orgId = op.org_id
  // Room for six users.
  await sb.from('organizations').update({ max_users: 20 }).eq('id', orgId)
  for (const role of ROLES.slice(1)) await mk(role, { org_id: orgId, role })
  const { data: profs } = await sb.from('user_profiles').select('id, role, org_id').in('id', Object.values(users).map(u => u.id))
  const stray = profs.filter(p => p.org_id !== orgId)
  fs.writeFileSync(STATE, JSON.stringify({ orgId, users }, null, 1))
  console.log('org', orgId, profs.map(p => `${p.role}:${p.org_id === orgId ? 'ok' : 'WRONG ORG ' + p.org_id}`).join(' '))
  if (stray.length) console.log('WARNING: some users landed in another org')
}

async function remove() {
  const s = JSON.parse(fs.readFileSync(STATE, 'utf8'))
  const { error } = await sb.rpc('purge_organization', { p_org_id: s.orgId })
  let loginErrs = 0
  if (!error) for (const u of Object.values(s.users)) { const { error: e } = await sb.auth.admin.deleteUser(u.id); if (e && !/not found/i.test(e.message)) loginErrs++ }
  const { count } = await sb.from('organizations').select('id', { count: 'exact', head: true }).eq('id', s.orgId)
  if (!error && !loginErrs) fs.unlinkSync(STATE)
  console.log('removed', { purge: error?.message ?? 'ok', orgLeft: count, loginErrs })
}

// ── the matrix ───────────────────────────────────────────────────────────────

async function run() {
  const s = JSON.parse(fs.readFileSync(STATE, 'utf8'))
  const tok = {}
  for (const r of ROLES) {
    const c = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, opts)
    const { data, error } = await c.auth.signInWithPassword({ email: s.users[r].email, password: s.users[r].password })
    if (error) throw new Error('sign in ' + r + ': ' + error.message)
    tok[r] = data.session.access_token
  }
  const call = async (role, method, url, body) => {
    const res = await fetch(BASE + url, { method, headers: { Authorization: 'Bearer ' + tok[role], 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
    let b = null; try { b = await res.json() } catch {}
    return { s: res.status, b }
  }
  const must = async (role, method, url, body) => {
    const r = await call(role, method, url, body)
    if (r.s >= 300) throw new Error(`setup ${method} ${url} as ${role}: ${r.s} ${JSON.stringify(r.b)}`)
    return r.b
  }
  const today = new Date().toISOString().slice(0, 10)

  // ── Seed, as owner ──
  const L1 = (await must('owner', 'POST', '/api/locations', { name: 'Main yard', code: 'MAIN', type: 'warehouse' })).data.id
  const L2 = (await must('owner', 'POST', '/api/locations', { name: 'Van 1', code: 'VAN1', type: 'vehicle' })).data.id
  const V = (await must('owner', 'POST', '/api/suppliers', { name: 'Seed Vendor' })).data.id
  const A = (await must('owner', 'POST', '/api/products', { name: 'Seed pipe', unit_of_measure: 'pcs', cost_method: 'average' })).data.id
  await must('owner', 'POST', '/api/job-codes', { code: 'J-1', name: 'Seed job' })
  const CC = (await must('owner', 'POST', '/api/cost-centers', { code: 'GEN', name: 'General' })).data.id

  // A placed order, ready to receive against, per role that might try.
  const placedPO = async () => {
    const po = (await must('owner', 'POST', '/api/purchase-orders', { supplier_id: V, lines: [{ product_id: A, quantity_ordered: 50, unit_cost: 2 }] })).data
    await must('owner', 'PATCH', '/api/purchase-orders/' + po.id, { status: 'pending_approval' })
    let cur = (await must('owner', 'GET', '/api/purchase-orders/' + po.id)).data
    if (cur.status === 'pending_approval') await must('owner', 'PATCH', '/api/purchase-orders/' + po.id, { status: 'approved' })
    await must('owner', 'PATCH', '/api/purchase-orders/' + po.id, { status: 'sent' })
    cur = (await must('owner', 'GET', '/api/purchase-orders/' + po.id)).data
    return { id: po.id, line: cur.lines[0].id }
  }
  const draftPO = async () => (await must('owner', 'POST', '/api/purchase-orders', { supplier_id: V, lines: [{ product_id: A, quantity_ordered: 5, unit_cost: 2 }] })).data.id

  // Stock to work with: receive 50 a few times, issue to the job.
  for (let i = 0; i < 4; i++) { const p = await placedPO(); await must('owner', 'POST', `/api/purchase-orders/${p.id}/receive`, { lines: [{ line_id: p.line, quantity_received: 50, to_location_id: L1 }] }) }
  await must('owner', 'POST', '/api/inventory', { transaction_type: 'consumption', product_id: A, quantity: 40, from_location_id: L1, job_code: 'J-1', cost_center_id: CC })

  const results = []   // { area, action, role, status, error }
  const rec = (area, action, role, r) => results.push({ area, action, role, status: r.s, error: r.b?.error ?? null })

  // ── Reads behind each sidebar page ──
  const pageApis = [
    ['Dashboard', '/api/dashboard'], ['Inventory', '/api/inventory'], ['Transactions', '/api/transactions'],
    ['Forecasting', '/api/forecasting'], ['Vendors', '/api/suppliers'], ['Purchase Orders', '/api/purchase-orders'],
    ['Reorder', '/api/reorder'], ['Requisitions', '/api/requisitions'], ['Stock Counts', '/api/stock-counts'],
    ['Fixed Assets', '/api/assets'], ['Maintenance', '/api/maintenance'], ['Audit Log', '/api/audit-log'],
    ['Settings: organization', '/api/org'], ['Settings: users', '/api/users'], ['Setup: job codes', '/api/job-codes'],
    ['Report: valuation', `/api/reports/valuation?from=2026-11-01&to=${today}`],
    ['Report: journal', `/api/reports/journal?from=2026-11-01&to=${today}`],
    ['Report: expenses', `/api/reports/expenses?from=2026-11-01&to=${today}`],
    ['Report: open POs', `/api/reports/open-pos`], ['Report: received not invoiced', `/api/reports/received-not-invoiced`],
    ['Report: adjustments', `/api/reports/adjustments?from=2026-11-01&to=${today}`],
    ['Report: slow moving', `/api/reports/slow-moving`], ['Item ledger', '/api/inventory/ledger?product_id=' + A],
  ]
  for (const role of ROLES) for (const [label, url] of pageApis) rec('read', label, role, await call(role, 'GET', url))

  // ── Writes ──
  for (const role of ROLES) {
    rec('purchasing', 'Create purchase order', role, await call(role, 'POST', '/api/purchase-orders', { supplier_id: V, lines: [{ product_id: A, quantity_ordered: 1, unit_cost: 2 }] }))

    { const id = await draftPO(); rec('purchasing', 'Set a draft order straight to approved', role, await call(role, 'PATCH', '/api/purchase-orders/' + id, { status: 'approved' })) }
    { const id = await draftPO(); rec('purchasing', 'Set a draft order straight to sent', role, await call(role, 'PATCH', '/api/purchase-orders/' + id, { status: 'sent' })) }
    { const p = await placedPO(); rec('purchasing', 'Receive goods', role, await call(role, 'POST', `/api/purchase-orders/${p.id}/receive`, { lines: [{ line_id: p.line, quantity_received: 1, to_location_id: L1 }] })) }
    { const p = await placedPO(); rec('purchasing', 'Record vendor invoice on an order', role, await call(role, 'PATCH', '/api/purchase-orders/' + p.id, { supplier_invoice_no: 'INV-' + role, supplier_invoice_amount: 100 })) }
    { const p = await placedPO(); rec('purchasing', 'Cancel a placed order', role, await call(role, 'PATCH', '/api/purchase-orders/' + p.id, { status: 'cancelled' })) }
    rec('purchasing', 'Create vendor', role, await call(role, 'POST', '/api/suppliers', { name: 'Vendor by ' + role }))

    rec('stock', 'Issue to a job', role, await call(role, 'POST', '/api/inventory', { transaction_type: 'consumption', product_id: A, quantity: 1, from_location_id: L1, job_code: 'J-1', cost_center_id: CC }))
    rec('stock', 'Write stock down (adjustment)', role, await call(role, 'POST', '/api/inventory', { transaction_type: 'adjustment', product_id: A, quantity: -1, from_location_id: L1, notes: 'by ' + role }))
    rec('stock', 'Receive without a PO (blind receipt)', role, await call(role, 'POST', '/api/inventory', { transaction_type: 'purchase', product_id: A, quantity: 1, unit_cost: 2, to_location_id: L1 }))
    rec('stock', 'Transfer between locations', role, await call(role, 'POST', '/api/transfers', { product_id: A, quantity: 1, from_location_id: L1, to_location_id: L2 }))
    rec('stock', 'Return from a job', role, await call(role, 'POST', '/api/returns', { kind: 'job', product_id: A, quantity: 1, location_id: L1, job_code: 'J-1', cost_center_id: CC }))
    rec('stock', 'Return to vendor', role, await call(role, 'POST', '/api/returns', { kind: 'vendor', product_id: A, quantity: 1, location_id: L1 }))
    rec('stock', 'Create item', role, await call(role, 'POST', '/api/products', { name: 'Item by ' + role, unit_of_measure: 'pcs' }))
    rec('stock', 'Create location', role, await call(role, 'POST', '/api/locations', { name: 'Loc by ' + role, code: ('L' + role).slice(0, 8).toUpperCase(), type: 'other' }))

    rec('requests', 'Raise a requisition', role, await call(role, 'POST', '/api/requisitions', { type: 'inventory', cost_center_id: CC, job_code: 'J-1', location_id: L1, items: [{ item_type: 'product', product_id: A, quantity: 1 }] }))
    rec('assets', 'Add a fixed asset', role, await call(role, 'POST', '/api/assets', { name: 'Drill by ' + role, asset_tag: 'T-' + role }))

    rec('admin', 'Change organization settings', role, await call(role, 'PATCH', '/api/org', { require_cost_dimension: false }))
    rec('admin', 'Create accounting period', role, await call(role, 'POST', '/api/periods', { name: 'Test ' + role, period_start: '2020-01-01', period_end: '2020-01-31' }))
    if (role !== 'owner') {
      rec('admin', 'Invite a user', role, await call(role, 'POST', '/api/users/invite', { email: `nobody-${role}@example.com`, role: 'viewer' }))
      rec('admin', 'Make themselves owner', role, await call(role, 'PATCH', '/api/users/' + s.users[role].id, { role: 'owner' }))
      rec('admin', 'Change another user\'s role', role, await call(role, 'PATCH', '/api/users/' + s.users.viewer.id, { role: 'procurement' }))
      rec('admin', 'Start a subscription checkout', role, await call(role, 'POST', '/api/billing/checkout', { plan: 'pro' }))
    }
  }

  // Undo any role change that slipped through, so later checks are honest.
  for (const r of ROLES.slice(1)) await sb.from('user_profiles').update({ role: r }).eq('id', s.users[r].id)

  // ── Stock counts ──
  const newCount = async (by) => call(by, 'POST', '/api/stock-counts', { location_id: L1, notes: 'by ' + by, external_attendees: ['Counter'], counts: [{ product_id: A, counted_qty: 1 }] })
  for (const role of ROLES) {
    const r = await newCount(role)
    rec('counts', 'Start a stock count', role, r)
    // Someone else's count: owner starts one, this role enters a figure and moves it to review.
    const oc = await newCount('owner')
    const id = oc.b?.data?.id
    const full = (await call('owner', 'GET', '/api/stock-counts/' + id)).b?.data
    const line = full?.lines?.[0]
    rec('counts', 'Enter counted quantities', role, await call(role, 'PATCH', '/api/stock-counts/' + id, { lines: [{ line_id: line?.id, counted_qty: 1 }] }))
    rec('counts', 'Cancel a count', role, await call(role, 'PATCH', '/api/stock-counts/' + id, { status: 'cancelled' }))
    // A count in review, made by owner, approved by this role.
    const oc2 = await newCount('owner'); const id2 = oc2.b?.data?.id
    await call('owner', 'PATCH', '/api/stock-counts/' + id2, { status: 'reviewing' })
    rec('counts', 'Approve a count someone else made', role, await call(role, 'POST', `/api/stock-counts/${id2}/approve`, {}))
    await call('owner', 'PATCH', '/api/stock-counts/' + id2, { status: 'cancelled' })
  }
  // Operations approves their own count while the owner could approve it.
  { const c = await newCount('operations'); const id = c.b?.data?.id
    await call('operations', 'PATCH', '/api/stock-counts/' + id, { status: 'reviewing' })
    rec('counts', 'Approve own count (another approver exists)', 'operations', await call('operations', 'POST', `/api/stock-counts/${id}/approve`, {}))
    await call('owner', 'PATCH', '/api/stock-counts/' + id, { status: 'cancelled' }) }

  // ── Approval chain: procurement submits, then tries to approve its own order ──
  { const po = await call('procurement', 'POST', '/api/purchase-orders', { supplier_id: V, lines: [{ product_id: A, quantity_ordered: 3, unit_cost: 2 }] })
    const id = po.b?.data?.id
    const sub = await call('procurement', 'PATCH', '/api/purchase-orders/' + id, { status: 'pending_approval' })
    rec('approval', 'Submit own order', 'procurement', sub)
    const after = (await call('owner', 'GET', '/api/purchase-orders/' + id)).b?.data
    results.push({ area: 'approval', action: 'Status after submit', role: 'procurement', status: 0, error: after?.status })
    rec('approval', 'Approve own order', 'procurement', await call('procurement', 'PATCH', '/api/purchase-orders/' + id, { status: 'approved' }))
    const fin = (await call('owner', 'GET', '/api/purchase-orders/' + id)).b?.data
    results.push({ area: 'approval', action: 'Status after self-approve attempt', role: 'procurement', status: 0, error: fin?.status }) }

  fs.writeFileSync(path.join(require('os').tmpdir(), 'stocked-roles-result.json'), JSON.stringify(results, null, 1))

  // ── Print a table ──
  const actions = [...new Map(results.map(r => [r.area + '|' + r.action, r])).values()]
  const cell = (r) => !r ? '·' : r.status === 0 ? String(r.error) : r.status < 300 ? 'OK' : String(r.status)
  console.log(['area', 'action', ...ROLES].join('\t'))
  for (const a of actions) {
    console.log([a.area, a.action, ...ROLES.map(role => cell(results.find(r => r.area === a.area && r.action === a.action && r.role === role)))].join('\t'))
  }
  const odd = results.filter(r => r.status >= 500 || r.status === 404 || r.status === 400 || r.status === 422)
  if (odd.length) { console.log('\n-- non-permission failures --'); for (const r of odd) console.log(r.role, '|', r.action, '|', r.status, r.error) }
}

;({ setup, run, remove })[process.argv[2]]().catch(e => { console.error('FAILED', e.message ?? e); process.exit(1) })
