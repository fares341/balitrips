import { describe, expect, it } from 'vitest'

import { scheduleDue, schedulePeriod } from './schedule-time'

describe('monthly (accountant) schedule', () => {
  it('is due on the 1st after 07:00 Bali, once', () => {
    const first = new Date('2026-12-01T00:30:00Z') // 08:30 in Bali
    expect(scheduleDue('monthly', null, first)).toBe(true)
    expect(scheduleDue('monthly', first, new Date('2026-12-01T05:00:00Z'))).toBe(false)
    expect(scheduleDue('monthly', null, new Date('2026-12-02T03:00:00Z'))).toBe(false)
  })

  it('covers the whole previous month', () => {
    expect(schedulePeriod('monthly', new Date('2026-12-01T00:30:00Z'))).toEqual({
      period: 'custom',
      from: '2026-11-01',
      to: '2026-11-30',
    })
    expect(schedulePeriod('monthly', new Date('2027-03-01T02:00:00Z')).to).toBe('2027-02-28')
  })
})
