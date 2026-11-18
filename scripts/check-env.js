// Which environment variables an env file has, is missing, or still carries
// from old code. Prints names and public values only, never secrets.
//
//   node scripts/check-env.js                 (checks .env.local)
//   node scripts/check-env.js .env.vercel --production
//
// To check Vercel itself: `vercel env pull .env.vercel --environment=production`
// then run the second form and delete .env.vercel afterwards. Or, signed in as
// a PLATFORM_ADMIN_EMAILS user, open https://www.stocked.tech/api/admin/config-check
//
// The list lives in src/lib/env-vars.json (same rules as src/lib/env-check.ts).
const fs = require('fs'), path = require('path')

const args = process.argv.slice(2)
const production = args.includes('--production')
const file = args.find(a => !a.startsWith('--')) || '.env.local'
if (!fs.existsSync(file)) { console.error(`No such file: ${file}`); process.exit(2) }

const env = Object.fromEntries(fs.readFileSync(file, 'utf8').split(/\r?\n/)
  .filter(l => /^[A-Z_][A-Z0-9_]*=/.test(l))
  .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, '').replace(/\s+#.*$/, '')] }))
const { vars } = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'env-vars.json'), 'utf8'))

const problems = []
const groups = { required: [], recommended: [], optional: [], obsolete: [] }
for (const s of vars) {
  const raw = env[s.name]
  const set = typeof raw === 'string' && raw.trim() !== ''
  const v = set ? raw.trim() : ''
  let problem = ''
  if (s.level === 'obsolete') { if (set) problem = 'not used any more: delete it' }
  else if (!set) { if (s.level === 'required' || s.level === 'recommended') problem = 'MISSING' }
  else if (s.minLength && v.length < s.minLength) problem = `too short (needs ${s.minLength}+ characters)`
  else if (s.warnIfSet) problem = 'set: only that email domain can sign up'
  else if (production && s.expectInProduction && v.replace(/\/$/, '') !== s.expectInProduction) problem = `should be ${s.expectInProduction}`
  if (s.level === 'obsolete' && !set) continue
  const shown = set ? (s.public ? v : 'set') : '-'
  groups[s.level].push(`  ${problem ? '✗' : set ? '✓' : '·'} ${s.name.padEnd(46)} ${shown.padEnd(28)} ${problem || s.purpose}`)
  if (problem) problems.push(`${s.name}: ${problem}`)
}

console.log(`Environment check: ${file}${production ? ' (production rules)' : ''}\n`)
for (const [level, lines] of Object.entries(groups)) {
  if (!lines.length) continue
  console.log(level === 'obsolete' ? 'LEFT OVER (delete these)' : level.toUpperCase())
  console.log(lines.join('\n') + '\n')
}
const unknown = Object.keys(env).filter(n => !vars.some(s => s.name === n))
if (unknown.length) console.log(`Not known to the app (ignored): ${unknown.join(', ')}\n`)
console.log(problems.length ? `${problems.length} PROBLEM(S)` : 'ALL GOOD')
process.exit(problems.length ? 1 : 0)
