import { describe, expect, it } from 'vitest'

import {
  checkAvailability,
  effectiveCapacity,
  isDayUnavailable,
  isUnrestricted,
  openRules,
  slotKey,
  weekdayList,
  weekdayOf,
  type AvailabilityRules,
} from './rules'

const withSlots = (over: Partial<AvailabilityRules> = {}): AvailabilityRules => ({
  capacityPerSlot: 10,
  closedWeekdays: [],
  hasSlots: true,
  rows: [],
  ...over,
})

describe('weekdays and slots', () => {
  it('reads the weekday of a plain date whatever the host time zone', () => {
    // 2026-08-10 is a Monday; the suite runs in America/New_York.
    expect(weekdayOf('2026-08-10')).toBe(1)
    expect(weekdayOf('2026-08-09')).toBe(0)
  })
  it('normalises stored times to HH:mm', () => {
    expect(slotKey('09:00:00')).toBe('09:00')
    expect(slotKey('9:5')).toBe('09:05')
    expect(slotKey(null)).toBe('')
  })
  it('cleans stored weekday lists', () => {
    expect(weekdayList([3, 1, 1, 9, -1, 'x', 2.5])).toEqual([1, 3])
    expect(weekdayList(null)).toEqual([])
  })
})

describe('nothing configured', () => {
  it('is unlimited and open: exactly the behaviour before phase 2', () => {
    const rules = openRules(true)
    expect(isUnrestricted(rules)).toBe(true)
    expect(checkAvailability(rules, '2026-08-10', '09:00', 500)).toEqual({
      ok: true,
      remaining: null,
    })
  })
  it('booked counts alone do not restrict anything', () => {
    const rules = openRules(false)
    const counted = {
      ...rules,
      rows: [{ day: '2026-08-10', slot: '', capacity: null, booked: 40, isClosed: false }],
    }
    expect(isUnrestricted(counted)).toBe(true)
    expect(checkAvailability(counted, '2026-08-10', null, 5).ok).toBe(true)
  })
})

describe('capacity', () => {
  it('counts per departure when the activity has time slots', () => {
    const rules = withSlots({
      rows: [{ day: '2026-08-10', slot: '09:00', capacity: null, booked: 8, isClosed: false }],
    })
    expect(checkAvailability(rules, '2026-08-10', '09:00', 2)).toEqual({ ok: true, remaining: 2 })
    expect(checkAvailability(rules, '2026-08-10', '09:00', 3)).toEqual({
      ok: false,
      reason: 'full',
      remaining: 2,
    })
    // Another departure the same day is untouched.
    expect(checkAvailability(rules, '2026-08-10', '14:00', 10).ok).toBe(true)
  })
  it('counts per day when there are no time slots', () => {
    const rules = withSlots({
      hasSlots: false,
      rows: [{ day: '2026-08-10', slot: '', capacity: null, booked: 10, isClosed: false }],
    })
    expect(checkAvailability(rules, '2026-08-10', '09:00', 1)).toMatchObject({
      ok: false,
      reason: 'full',
    })
  })
  it('a slot override beats the day override, which beats the default', () => {
    const rules = withSlots({
      rows: [
        { day: '2026-08-10', slot: '', capacity: 4, booked: 0, isClosed: false },
        { day: '2026-08-10', slot: '14:00', capacity: 12, booked: 0, isClosed: false },
      ],
    })
    expect(effectiveCapacity(rules, '2026-08-10', '09:00')).toBe(4)
    expect(effectiveCapacity(rules, '2026-08-10', '14:00')).toBe(12)
    expect(effectiveCapacity(rules, '2026-08-11', '09:00')).toBe(10)
  })
  it('zero places is a closed-for-sale departure', () => {
    const rules = withSlots({ capacityPerSlot: 0 })
    expect(checkAvailability(rules, '2026-08-10', '09:00', 1)).toMatchObject({ reason: 'full' })
  })
})

describe('closed dates', () => {
  it('closes a weekday every week', () => {
    const rules = withSlots({ closedWeekdays: [1] })
    expect(checkAvailability(rules, '2026-08-10', '09:00', 1)).toMatchObject({ reason: 'closed' })
    expect(checkAvailability(rules, '2026-08-11', '09:00', 1).ok).toBe(true)
  })
  it('a closed day row closes every departure; a closed slot row only its own', () => {
    const rules = withSlots({
      rows: [
        { day: '2026-08-10', slot: '', capacity: null, booked: 0, isClosed: true },
        { day: '2026-08-11', slot: '09:00', capacity: null, booked: 0, isClosed: true },
      ],
    })
    expect(checkAvailability(rules, '2026-08-10', '14:00', 1)).toMatchObject({ reason: 'closed' })
    expect(checkAvailability(rules, '2026-08-11', '09:00', 1)).toMatchObject({ reason: 'closed' })
    expect(checkAvailability(rules, '2026-08-11', '14:00', 1).ok).toBe(true)
  })
  it('a day is unavailable only when every departure is closed or full', () => {
    const rules = withSlots({
      rows: [
        { day: '2026-08-12', slot: '09:00', capacity: null, booked: 10, isClosed: false },
        { day: '2026-08-12', slot: '14:00', capacity: null, booked: 3, isClosed: false },
      ],
    })
    expect(isDayUnavailable(rules, '2026-08-12', ['09:00', '14:00'])).toBe(false)
    const full = withSlots({
      rows: [
        { day: '2026-08-12', slot: '09:00', capacity: null, booked: 10, isClosed: false },
        { day: '2026-08-12', slot: '14:00', capacity: null, booked: 0, isClosed: true },
      ],
    })
    expect(isDayUnavailable(full, '2026-08-12', ['09:00', '14:00'])).toBe(true)
  })
})
