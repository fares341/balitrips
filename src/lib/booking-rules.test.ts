import { describe, expect, it } from 'vitest'

import {
  daysBetweenInclusive,
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
