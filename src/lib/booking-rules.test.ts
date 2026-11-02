import { describe, expect, it } from 'vitest'

import {
  addDays,
  advanceDaysFor,
  advanceModeOf,
  daysBetweenInclusive,
  earliestBookableDate,
  isBookableAt,
  isValidCutoff,
  timeInBali,
  isPastInBali,
  isValidDateRange,
  isWithinLeadTime,
  todayInBali,
  vehicleForPassengers,
} from './booking-rules'

describe('vehicleForPassengers', () => {
  it('assigns by the design rule: 1-4 sedan, 5-7 SUV, 8+ van', () => {
    expect([1, 2, 3, 4].map(vehicleForPassengers)).toEqual(Array(4).fill('sedan'))
    expect([5, 6, 7].map(vehicleForPassengers)).toEqual(Array(3).fill('suv'))
    expect([8, 12, 20].map(vehicleForPassengers)).toEqual(Array(3).fill('van'))
  })

  it('rejects nonsense rather than silently defaulting', () => {
    expect(() => vehicleForPassengers(0)).toThrow()
    expect(() => vehicleForPassengers(-1)).toThrow()
    expect(() => vehicleForPassengers(2.5)).toThrow()
  })
})

describe('daysBetweenInclusive', () => {
  it('counts both endpoints', () => {
    expect(daysBetweenInclusive('2026-08-12', '2026-08-12')).toBe(1)
    expect(daysBetweenInclusive('2026-08-12', '2026-08-14')).toBe(3)
    expect(daysBetweenInclusive('2026-08-01', '2026-08-31')).toBe(31)
  })

  it('spans month and year boundaries', () => {
    expect(daysBetweenInclusive('2026-01-30', '2026-02-02')).toBe(4)
    expect(daysBetweenInclusive('2026-12-30', '2027-01-02')).toBe(4)
  })

  it('handles a leap day', () => {
    expect(daysBetweenInclusive('2028-02-28', '2028-03-01')).toBe(3)
  })

  it('clamps a reversed range to 1 rather than returning a negative', () => {
    expect(daysBetweenInclusive('2026-08-14', '2026-08-12')).toBe(1)
  })

  it('is immune to the host timezone', () => {
    // The prototype used new Date(str) arithmetic, which shifts by locale.
    // A DST boundary in a Northern-hemisphere zone must not change the count.
    expect(daysBetweenInclusive('2026-03-28', '2026-03-30')).toBe(3)
    expect(daysBetweenInclusive('2026-10-24', '2026-10-26')).toBe(3)
  })
})

describe('isValidDateRange', () => {
  it('accepts equal and forward ranges, rejects reversed', () => {
    expect(isValidDateRange('2026-08-12', '2026-08-12')).toBe(true)
    expect(isValidDateRange('2026-08-12', '2026-08-13')).toBe(true)
    expect(isValidDateRange('2026-08-13', '2026-08-12')).toBe(false)
  })
})

describe('Bali timezone handling', () => {
  it('resolves the Bali date even when UTC is still on the previous day', () => {
    // 23:30 UTC on the 11th is 07:30 on the 12th in Bali (UTC+8).
    const instant = new Date('2026-08-11T23:30:00Z')
    expect(todayInBali(instant)).toBe('2026-08-12')
  })

  it('treats a date as past only once Bali has moved on', () => {
    const instant = new Date('2026-08-11T23:30:00Z') // 12 Aug in Bali
    expect(isPastInBali('2026-08-11', instant)).toBe(true)
    expect(isPastInBali('2026-08-12', instant)).toBe(false)
    expect(isPastInBali('2026-08-13', instant)).toBe(false)
  })
})

describe('isWithinLeadTime', () => {
  it('blocks a booking inside the cutoff', () => {
    // Slot is 09:00 Bali on 12 Aug = 01:00 UTC. Now is 22:00 UTC on the
    // 11th, i.e. 3h before the slot — inside a 24h lead time.
    const now = new Date('2026-08-11T22:00:00Z')
    expect(isWithinLeadTime('2026-08-12', '09:00', 24, now)).toBe(false)
  })

  it('allows a booking outside the cutoff', () => {
    const now = new Date('2026-08-10T01:00:00Z')
    expect(isWithinLeadTime('2026-08-12', '09:00', 24, now)).toBe(true)
  })

  it('treats the exact boundary as bookable', () => {
    // Slot 09:00 Bali on 12 Aug = 2026-08-12T01:00Z; exactly 24h earlier.
    const now = new Date('2026-08-11T01:00:00Z')
    expect(isWithinLeadTime('2026-08-12', '09:00', 24, now)).toBe(true)
  })
})

describe('earliestBookableDate («أقرب موعد للحجز», Bali calendar)', () => {
  // Bali is UTC+8: 15:59Z is 23:59 in Bali, 16:00Z is midnight the next day.
  const at = (iso: string) => new Date(iso)

  it('keeps the legacy behaviour when no day rule is set', () => {
    const now = at('2026-10-30T03:00:00Z')
    expect(earliestBookableDate({ leadTimeHours: 24 }, now)).toBe('2026-10-30')
    // A cutoff alone (no day rule) changes nothing.
    expect(
      earliestBookableDate(
        { leadTimeHours: 24, minAdvanceDays: null, bookingCutoff: '06:00' },
        now,
      ),
    ).toBe('2026-10-30')
  })

  it('counts days on the Bali calendar across Bali midnight', () => {
    const w = { leadTimeHours: 0, minAdvanceDays: 2 }
    expect(earliestBookableDate(w, at('2026-10-30T15:59:00Z'))).toBe('2026-11-01')
    expect(earliestBookableDate(w, at('2026-10-30T16:00:00Z'))).toBe('2026-11-02')
  })

  it('moves one day later once the daily cutoff (Bali time) has passed', () => {
    const w = { leadTimeHours: 0, minAdvanceDays: 1, bookingCutoff: '18:00' }
    expect(earliestBookableDate(w, at('2026-10-30T09:59:00Z'))).toBe('2026-10-31')
    expect(earliestBookableDate(w, at('2026-10-30T10:00:00Z'))).toBe('2026-11-01')
    // Same day + cutoff: today's bookings close at the cutoff.
    const same = { leadTimeHours: 2, minAdvanceDays: 0, bookingCutoff: '12:00' }
    expect(earliestBookableDate(same, at('2026-10-30T03:00:00Z'))).toBe('2026-10-30')
    expect(earliestBookableDate(same, at('2026-10-30T04:00:00Z'))).toBe('2026-10-31')
  })

  it('rolls over month and year ends', () => {
    expect(
      earliestBookableDate({ leadTimeHours: 0, minAdvanceDays: 1 }, at('2026-10-31T05:00:00Z')),
    ).toBe('2026-11-01')
    expect(
      earliestBookableDate({ leadTimeHours: 0, minAdvanceDays: 2 }, at('2026-12-31T05:00:00Z')),
    ).toBe('2027-01-02')
    expect(
      earliestBookableDate(
        { leadTimeHours: 0, minAdvanceDays: 1, bookingCutoff: '18:00' },
        at('2027-02-27T11:00:00Z'),
      ),
    ).toBe('2027-03-01')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
  })
})

describe('isBookableAt', () => {
  const now = new Date('2026-10-30T02:00:00Z') // 10:00 in Bali

  it('refuses a date before the earliest day even if the hours would allow it', () => {
    const w = { leadTimeHours: 0, minAdvanceDays: 2 }
    expect(isBookableAt('2026-10-30', '18:00', w, now)).toBe(false)
    expect(isBookableAt('2026-10-31', '09:00', w, now)).toBe(false)
    expect(isBookableAt('2026-11-01', '09:00', w, now)).toBe(true)
  })

  it('applies the hours notice on top, and the stricter of activity and supplier', () => {
    const same = { leadTimeHours: 4, minAdvanceDays: 0 }
    expect(isBookableAt('2026-10-30', '14:00', same, now)).toBe(true)
    expect(isBookableAt('2026-10-30', '13:00', same, now)).toBe(false)
    expect(isBookableAt('2026-10-30', '14:00', { ...same, supplierLeadTimeHours: 6 }, now)).toBe(
      false,
    )
  })

  it('rejects malformed dates', () => {
    expect(isBookableAt('30/10/2026', null, { leadTimeHours: 0 }, now)).toBe(false)
  })
})

describe('advance modes (Studio)', () => {
  it('maps modes to days and back', () => {
    expect(advanceDaysFor('same_day', null)).toBe(0)
    expect(advanceDaysFor('tomorrow', null)).toBe(1)
    expect(advanceDaysFor('day_after', null)).toBe(2)
    expect(advanceDaysFor('days', 5)).toBe(5)
    expect(advanceDaysFor('days', 0)).toBeNull()
    expect(advanceDaysFor('days', 400)).toBeNull()
    expect(advanceDaysFor('nonsense', 3)).toBeNull()
    expect([null, 0, 1, 2, 7].map(advanceModeOf)).toEqual([
      'same_day',
      'same_day',
      'tomorrow',
      'day_after',
      'days',
    ])
    expect(isValidCutoff('18:00')).toBe(true)
    expect(isValidCutoff('24:00')).toBe(false)
    expect(timeInBali(new Date('2026-10-30T16:30:00Z'))).toBe('00:30')
  })
})
