import { createHash } from 'crypto'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * One free trial per person, enforced across account deletion.
 *
 * Deleting an account frees the email, so without this the same person could
 * sign up again every two weeks. A hash of their normalized email is kept in
 * `trial_claims`, which is never deleted with the account. A signup whose email
 * already holds a trial for a DIFFERENT organization starts with the trial
 * already expired (paywall), and `trial_reused` marks it so the wall can say so.
 *
 * Only hashes are stored — the table holds no readable addresses.
 */

/** Providers that ignore dots in the local part (so n.ame == name). */
const DOT_INSENSITIVE = new Set(['gmail.com', 'googlemail.com'])

/**
 * Fold the aliases that all reach one inbox:
 *   Name+test@Gmail.com → name@gmail.com
 *   n.a.me@googlemail.com → name@gmail.com
 * Anything unrecognised is just lowercased, so other providers keep their
 * exact address (some do treat dots as distinct users).
 */
export function normalizeEmail(email: string): string {
  const clean = email.trim().toLowerCase()
  const at = clean.lastIndexOf('@')
  if (at < 1) return clean
  let local = clean.slice(0, at)
  let domain = clean.slice(at + 1)
  if (domain === 'googlemail.com') domain = 'gmail.com'
  const plus = local.indexOf('+')
  if (plus > 0) local = local.slice(0, plus)
  if (DOT_INSENSITIVE.has(domain)) local = local.replaceAll('.', '')
  return `${local}@${domain}`
}

export function emailHash(email: string): string {
  // The optional pepper means a leaked table can't be checked against a
  // guessed address; without it the hashes are still not readable addresses.
  const pepper = process.env.TRIAL_HASH_PEPPER ?? ''
  return createHash('sha256').update(normalizeEmail(email) + pepper).digest('hex')
}

type Svc = ReturnType<typeof createServiceClient>

export interface TrialOrg {
  id: string
  plan: string
  trial_ends_at: string | null
  trial_checked_at: string | null
  trial_reused: boolean | null
}

/**
 * Record that an email has used a trial, without changing anything else.
 * Called when an owner deletes their account, so a trial they never opened
 * still counts — otherwise deleting early would hand out a fresh one.
 */
export async function claimTrialEmail(sb: Svc, email: string, orgId: string): Promise<void> {
  try {
    const hash = emailHash(email)
    const now  = new Date().toISOString()
    const { data: claim } = await sb
      .from('trial_claims').select('email_hash, org_id, claim_count').eq('email_hash', hash).maybeSingle()
    if (claim) {
      await sb.from('trial_claims').update({
        org_id: (claim as any).org_id ?? orgId,
        last_claimed_at: now,
        claim_count: Number((claim as any).claim_count ?? 1) + 1,
      }).eq('email_hash', hash)
    } else {
      await sb.from('trial_claims').insert({ email_hash: hash, org_id: orgId })
    }
  } catch (err) {
    console.error('[trial] claim on delete failed:', (err as Error).message)
  }
}

/**
 * Run once per organization, the first time someone opens the dashboard on a
 * trial. Claims the owner's email; if that email already holds a trial for
 * another organization, this one's trial is ended immediately.
 *
 * Returns the org with any changes applied. Never throws — a failure here must
 * not lock anyone out of a legitimate trial.
 */
export async function enforceTrialClaim(sb: Svc, org: TrialOrg): Promise<TrialOrg> {
  if (org.plan !== 'trial' || org.trial_checked_at) return org

  try {
    const { data: owner } = await sb
      .from('user_profiles')
      .select('email')
      .eq('org_id', org.id)
      .eq('role', 'owner')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    const email = (owner as any)?.email
    if (!email) return org   // no owner yet — check again on the next visit

    const hash = emailHash(email)
    const now  = new Date().toISOString()

    const { data: claim } = await sb
      .from('trial_claims')
      .select('email_hash, org_id, claim_count')
      .eq('email_hash', hash)
      .maybeSingle()

    // Same org checking again (or first-ever claim) → keep the trial.
    const reused = !!claim && (claim as any).org_id != null && (claim as any).org_id !== org.id

    if (claim) {
      await sb.from('trial_claims').update({
        org_id:          (claim as any).org_id ?? org.id,
        last_claimed_at: now,
        claim_count:     Number((claim as any).claim_count ?? 1) + 1,
      }).eq('email_hash', hash)
    } else {
      await sb.from('trial_claims').insert({ email_hash: hash, org_id: org.id })
    }

    const patch: Record<string, unknown> = { trial_checked_at: now }
    if (reused) {
      patch.trial_reused  = true
      patch.trial_ends_at = now      // expired → paywall on this very request
      console.warn(`[trial] repeat trial blocked for org ${org.id}`)
    }
    await sb.from('organizations').update(patch).eq('id', org.id)

    return { ...org, ...patch } as TrialOrg
  } catch (err) {
    console.error('[trial] claim check failed:', (err as Error).message)
    return org
  }
}
