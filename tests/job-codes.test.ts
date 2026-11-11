import { describe, it, expect } from 'vitest'
import { matchJobCode, jobLabels } from '@/lib/job-codes'

const list = [
  { code: 'J-1001', name: 'Smith residence repipe', is_active: true },
  { code: 'J-0900', name: 'Old job', is_active: false },
]

describe('checking a job code against the list', () => {
  it('treats blank as no job code', () => {
    expect(matchJobCode('', list)).toEqual({ ok: true, code: null })
    expect(matchJobCode('   ', list)).toEqual({ ok: true, code: null })
    expect(matchJobCode(undefined, list)).toEqual({ ok: true, code: null })
  })

  it('stores the spelling on the list, whatever case or spacing was typed', () => {
    expect(matchJobCode(' j-1001 ', list)).toEqual({ ok: true, code: 'J-1001' })
  })

  it('refuses a code that is not on the list', () => {
    const r = matchJobCode('J-1010', list)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/not one of your job codes/)
  })

  it('refuses a closed job', () => {
    const r = matchJobCode('J-0900', list)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/closed/)
  })

  it('lets a company with no list type freely', () => {
    expect(matchJobCode(' JOB-2026-0042 ', [])).toEqual({ ok: true, code: 'JOB-2026-0042' })
  })
})

describe('labelling job codes in reports', () => {
  const label = jobLabels(list)
  it('adds the job name when the code is on the list', () => {
    expect(label('J-1001')).toBe('J-1001 — Smith residence repipe')
  })
  it('leaves an unlisted code as it is', () => {
    expect(label('LEGACY-7')).toBe('LEGACY-7')
  })
})
