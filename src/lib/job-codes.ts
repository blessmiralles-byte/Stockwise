/**
 * Job codes on stock movements and requisitions.
 *
 * A job's material cost is the sum of everything tagged with its code, so a
 * code typed slightly differently ("J-1001" vs "j1001 ") quietly becomes a
 * second job and the first one looks cheaper than it was. Once a company keeps
 * a list of job codes, whatever is submitted has to be on it.
 *
 * A company with no list yet may still type codes freely — Starter plans
 * cannot keep a list, and requisitions have always asked for one.
 */

export interface JobCodeRow { code: string; name?: string | null; is_active?: boolean | null }

export type JobCodeMatch =
  | { ok: true; code: string | null }
  | { ok: false; error: string }

const norm = (s: string) => s.trim().toUpperCase()

/** Pure: check what was submitted against the company's list. */
export function matchJobCode(input: unknown, list: JobCodeRow[]): JobCodeMatch {
  const typed = typeof input === 'string' ? input.trim() : ''
  if (!typed) return { ok: true, code: null }
  if (list.length === 0) return { ok: true, code: typed }

  const hit = list.find(j => norm(j.code) === norm(typed))
  if (!hit) {
    return { ok: false, error: `"${typed}" is not one of your job codes. Pick one from the list, or add it under Setup → Job Codes.` }
  }
  if (hit.is_active === false) {
    return { ok: false, error: `Job code ${hit.code} is closed. Reopen it under Setup → Job Codes to post to it.` }
  }
  // Stored the way the list spells it, so reports group on one spelling.
  return { ok: true, code: hit.code }
}

/** Reads the company's list and checks the submitted code against it. */
export async function resolveJobCode(supabase: any, orgId: string, input: unknown): Promise<JobCodeMatch> {
  if (typeof input !== 'string' || !input.trim()) return { ok: true, code: null }
  const { data, error } = await supabase
    .from('job_codes')
    .select('code, is_active')
    .eq('org_id', orgId)
  // No table or a failed read must not stop stock moving; keep what was typed.
  if (error) return { ok: true, code: input.trim() }
  return matchJobCode(input, (data ?? []) as JobCodeRow[])
}

/** "J-1001 — Smith residence" for reports; just the code when it isn't on the list. */
export function jobLabels(list: JobCodeRow[]): (code: string) => string {
  const names = new Map(list.map(j => [norm(j.code), j.name?.trim() || '']))
  return code => {
    const name = names.get(norm(code))
    return name ? `${code} — ${name}` : code
  }
}
