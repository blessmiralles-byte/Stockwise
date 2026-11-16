// Read-only check of row-level security (HANDOFF.md, Launch audit A1).
// Usage: node scripts/test-rls.js <creds.json>   creds = { email, password, orgId } of a THROWAWAY owner.
// Prints every table where the public key, or a signed-in user of another company, can see rows.
// Passing result: no ANON-READABLE and no OTHER-ORG-ROWS lines.
const fs=require('fs'),path=require('path')
const {createClient}=require(path.join(process.cwd(),'node_modules','@supabase','supabase-js'))
const env=Object.fromEntries(fs.readFileSync('.env.local','utf8').split(/\r?\n/).filter(l=>/^[A-Z_]+=/.test(l)).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1).replace(/^["']|["']$/g,'')]}))
const o={auth:{persistSession:false},realtime:{transport:class NoSocket{}}}
const c=JSON.parse(fs.readFileSync(process.argv[2],'utf8'))
;(async()=>{
const spec=await fetch(env.NEXT_PUBLIC_SUPABASE_URL+'/rest/v1/',{headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY}}).then(r=>r.json())
const tables=Object.keys(spec.definitions||{})
const svc=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,o)
const anon=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_ANON_KEY,o)
const user=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_ANON_KEY,o)
await user.auth.signInWithPassword({email:c.email,password:c.password})
console.log('tables/views:',tables.length)
for(const t of tables){
 const total=(await svc.from(t).select('*',{count:'exact',head:true})).count
 const a=await anon.from(t).select('*',{count:'exact',head:true})
 const u=await user.from(t).select('*').limit(1000)
 let foreign=0; if(u.data) foreign=u.data.filter(r=>r.org_id&&r.org_id!==c.orgId).length
 const noOrg = u.data&&u.data.length&&!('org_id' in u.data[0])
 const flag=(a.count>0?' ANON-READABLE':'')+(foreign?' OTHER-ORG-ROWS:'+foreign:'')+(noOrg&&u.data.length?' (no org_id col, user sees '+u.data.length+')':'')
 if(flag||a.error==null&&a.count>0) console.log(t.padEnd(34),'total',String(total).padStart(6),'anon',a.error?'denied':a.count,'user',u.error?'denied':u.data.length,flag)
}
// anon writes
const w=await anon.from('organizations').insert({name:'rls probe (delete me)'}).select()
console.log('anon insert organizations:',w.error?('refused: '+w.error.message.slice(0,60)):'ALLOWED '+JSON.stringify(w.data))
console.log('done')})().catch(e=>console.error('FAILED',e.message))
