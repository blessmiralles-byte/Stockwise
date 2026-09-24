import { describe, it, expect, beforeEach } from 'vitest'
import { fakeSupabase } from './helpers/fake-supabase'
import { normalizeEmail, emailHash, enforceTrialClaim, claimTrialEmail } from '@/lib/trial-claims'

const org = (id: string, extra: any = {}) => ({
  id, plan: 'trial', trial_ends_at: '2099-01-01', trial_checked_at: null, trial_reused: false, ...extra,
})
const owner = (orgId: string, email: string) => ({ org_id: orgId, role: 'owner', email, created_at: '1' })

let sb: any
beforeEach(() => { sb = fakeSupabase({ trial_claims: [], organizations: [], user_profiles: [] }) })

describe('email normalization', () => {
  it('lowercases and trims', () => {
    expect(normalizeEmail('  Bless@Example.COM ')).toBe('bless@example.com')
  })

  it.each([
    ['bless+stocked@gmail.com', 'bless@gmail.com'],
    ['b.l.e.s.s@gmail.com',     'bless@gmail.com'],
    ['bless@googlemail.com',    'bless@gmail.com'],
    ['B.less+trial2@GoogleMail.com', 'bless@gmail.com'],
  ])('folds the Gmail alias %s', (input, expected) => {
    expect(normalizeEmail(input)).toBe(expected)
  })

  it('strips plus-tags elsewhere but keeps dots (other providers treat them as distinct)', () => {
    expect(normalizeEmail('first+x@company.com')).toBe('first@company.com')
    expect(normalizeEmail('first.last@company.com')).toBe('first.last@company.com')
  })

  it('keeps genuinely different people apart', () => {
    expect(normalizeEmail('ann@company.com')).not.toBe(normalizeEmail('anna@company.com'))
    expect(emailHash('a@x.com')).not.toBe(emailHash('b@x.com'))
  })

  it('hashes aliases to the same value, and stores no readable address', () => {
    expect(emailHash('Bless+a@gmail.com')).toBe(emailHash('b.less@googlemail.com'))
    expect(emailHash('a@x.com')).not.toContain('@')
    expect(emailHash('a@x.com')).toHaveLength(64)
  })
})

describe('one trial per person', () => {
  it('lets a first-time signup keep its trial and records the claim', async () => {
    sb._db.organizations.push(org('o1'))
    sb._db.user_profiles.push(owner('o1', 'Bless@Gmail.com'))

    const r = await enforceTrialClaim(sb, sb._db.organizations[0])
    expect(r.trial_reused).not.toBe(true)
    expect(r.trial_ends_at).toBe('2099-01-01')
    expect(sb._db.trial_claims).toHaveLength(1)
    expect(sb._db.trial_claims[0].org_id).toBe('o1')
    expect(sb._db.organizations[0].trial_checked_at).toBeTruthy()
  })

  it('only checks once per organization', async () => {
    sb._db.organizations.push(org('o1'))
    sb._db.user_profiles.push(owner('o1', 'bless@gmail.com'))
    await enforceTrialClaim(sb, sb._db.organizations[0])
    const snapshot = JSON.stringify(sb._db.trial_claims)

    await enforceTrialClaim(sb, sb._db.organizations[0])
    expect(JSON.stringify(sb._db.trial_claims)).toBe(snapshot)
  })

  it('blocks a repeat signup, even through an alias', async () => {
    sb._db.organizations.push(org('o1'))
    sb._db.user_profiles.push(owner('o1', 'bless@gmail.com'))
    await enforceTrialClaim(sb, sb._db.organizations[0])

    // Account deleted; signs up again with a dotted, plus-tagged variant.
    sb._db.organizations.push(org('o2'))
    sb._db.user_profiles.length = 0
    sb._db.user_profiles.push(owner('o2', 'b.less+again@googlemail.com'))

    const r = await enforceTrialClaim(sb, sb._db.organizations[1])
    expect(r.trial_reused).toBe(true)
    expect(new Date(r.trial_ends_at!).getTime()).toBeLessThanOrEqual(Date.now())
    expect(sb._db.trial_claims).toHaveLength(1)
    expect(sb._db.trial_claims[0].claim_count).toBe(2)
    expect(sb._db.trial_claims[0].org_id).toBe('o1')   // still points at the original
  })

  it('leaves a different person alone', async () => {
    sb._db.trial_claims.push({ email_hash: emailHash('bless@gmail.com'), org_id: 'o1', claim_count: 1 })
    sb._db.organizations.push(org('o3'))
    sb._db.user_profiles.push(owner('o3', 'someone.else@gmail.com'))

    expect((await enforceTrialClaim(sb, sb._db.organizations[0])).trial_reused).not.toBe(true)
  })

  it('never touches a paying organization', async () => {
    sb._db.organizations.push(org('o4', { plan: 'pro' }))
    sb._db.user_profiles.push(owner('o4', 'bless@gmail.com'))

    const r = await enforceTrialClaim(sb, sb._db.organizations[0])
    expect(r.trial_checked_at).toBe(null)
    expect(sb._db.trial_claims).toHaveLength(0)
  })

  it('waits for the next visit when the owner row is not there yet', async () => {
    sb._db.organizations.push(org('o5'))
    const r = await enforceTrialClaim(sb, sb._db.organizations[0])
    expect(r.trial_checked_at).toBe(null)
    expect(r.trial_ends_at).toBe('2099-01-01')
  })

  it('counts a trial that was deleted before it was ever opened', async () => {
    await claimTrialEmail(sb, 'QuickDelete+trial@gmail.com', 'o9')
    sb._db.organizations.push(org('o10'))
    sb._db.user_profiles.push(owner('o10', 'quickdelete@gmail.com'))

    expect((await enforceTrialClaim(sb, sb._db.organizations[0])).trial_reused).toBe(true)
  })

  // A database hiccup must never cost a legitimate customer their trial.
  it('fails open when the database errors', async () => {
    const broken = { from: () => { throw new Error('db down') } } as any
    const r = await enforceTrialClaim(broken, org('o11'))
    expect(r.trial_reused).not.toBe(true)
    expect(r.trial_checked_at).toBe(null)
  })
})
