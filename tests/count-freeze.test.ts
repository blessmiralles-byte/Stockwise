import { describe, it, expect } from 'vitest'
import { frozenBy, freezeMessage, OPEN_COUNT_STATUSES } from '@/lib/count-freeze'

const open = [
  { location_id: 'yard', count_number: 'CC-20261112-0001', location_name: 'Main yard' },
  { location_id: 'van', count_number: 'CC-20261112-0002', location_name: null },
]

describe('freezing a location while it is counted', () => {
  it('finds the count holding a location', () => {
    expect(frozenBy(open, ['yard'])?.count_number).toBe('CC-20261112-0001')
  })

  it('checks every location a movement touches', () => {
    // A transfer from a free location into one being counted is held.
    expect(frozenBy(open, ['shop', 'van'])?.count_number).toBe('CC-20261112-0002')
  })

  it('lets everything else move', () => {
    expect(frozenBy(open, ['shop'])).toBe(null)
    expect(frozenBy(open, [null, undefined])).toBe(null)
    expect(frozenBy([], ['yard'])).toBe(null)
  })

  it('treats open, counting and reviewing as open, and nothing else', () => {
    expect([...OPEN_COUNT_STATUSES]).toEqual(['open', 'counting', 'reviewing'])
  })

  it('says which count and how to release it', () => {
    expect(freezeMessage(open[0])).toBe('Main yard is being counted (CC-20261112-0001). Stock there can\'t move until the count is approved or cancelled.')
    expect(freezeMessage(open[1])).toMatch(/^This location is being counted/)
  })
})
