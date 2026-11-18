import spec from './env-vars.json'

/**
 * Which environment variables are set, missing or left over, without ever
 * returning a secret. Public values (NEXT_PUBLIC_*, sender address, flags)
 * are shown so a wrong one can be spotted. scripts/check-env.js applies the
 * same rules to a local env file.
 */

export type EnvLevel = 'required' | 'recommended' | 'optional' | 'obsolete'

export interface EnvVarSpec {
  name: string
  level: EnvLevel
  purpose: string
  public?: boolean
  expectInProduction?: string
  minLength?: number
  warnIfSet?: boolean
}

export interface EnvVarStatus {
  name: string
  level: EnvLevel
  purpose: string
  set: boolean
  /** Only for public values. */
  value?: string
  problem?: string
}

export const ENV_VARS: EnvVarSpec[] = spec.vars as EnvVarSpec[]

export function checkEnv(
  env: Record<string, string | undefined>,
  { production = false }: { production?: boolean } = {},
): { vars: EnvVarStatus[]; problems: string[] } {
  const vars = ENV_VARS.map((s): EnvVarStatus => {
    const raw = env[s.name]
    const set = typeof raw === 'string' && raw.trim() !== ''
    const st: EnvVarStatus = { name: s.name, level: s.level, purpose: s.purpose, set }
    if (set && s.public) st.value = raw!.trim()

    if (s.level === 'obsolete') {
      if (set) st.problem = 'Not used any more: delete it'
    } else if (!set) {
      if (s.level === 'required')    st.problem = 'Missing'
      if (s.level === 'recommended') st.problem = 'Missing (recommended)'
    } else {
      const v = raw!.trim()
      if (s.minLength && v.length < s.minLength) st.problem = `Too short (needs ${s.minLength}+ characters)`
      else if (s.warnIfSet) st.problem = 'Set: only that email domain can sign up'
      else if (production && s.expectInProduction && v.replace(/\/$/, '') !== s.expectInProduction) {
        st.problem = `Should be ${s.expectInProduction}`
      }
    }
    return st
  })
  const problems = vars.filter(v => v.problem).map(v => `${v.name}: ${v.problem}`)
  return { vars, problems }
}
