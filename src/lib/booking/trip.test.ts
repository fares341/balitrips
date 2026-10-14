import { describe, expect, it } from 'vitest'

import { validateContact, splitPhone } from '@/lib/orders/contact'

import { driverSuggestions, scheduleConflicts, tripDays, type TripLineFacts } from './trip'

const line = (over: Partial<TripLineFacts> & { id: string }): TripLineFacts => ({
  kind: 'activity_tier',
  travelDate: '2026-10-24',
  endDate: null,
  travelTime: '09:00:00',
  guests: 2,
  quantity: 2,
  parentItemId: null,
  ...over,
})

const RATES = [
  { vehicleClass: 'sedan' as const, dayRateMinor: 5500, currency: 'USD' },
  { vehicleClass: 'suv' as const, dayRateMinor: 7000, currency: 'USD' },
  { vehicleClass: 'van' as const, dayRateMinor: 9500, currency: 'USD' },
]

describe('scheduleConflicts', () => {
  it('flags two activities on the same day at the same time', () => {
    const a = line({ id: 'a' })
    const b = line({ id: 'b', kind: 'activity', travelTime: '09:00' })
    expect(scheduleConflicts([a, b])).toHaveLength(1)
  })
  it('ignores a different time, a different day and non-activities', () => {
    const a = line({ id: 'a' })
    expect(scheduleConflicts([a, line({ id: 'b', travelTime: '14:00' })])).toHaveLength(0)
    expect(scheduleConflicts([a, line({ id: 'c', travelDate: '2026-10-25' })])).toHaveLength(0)
    expect(scheduleConflicts([a, line({ id: 'd', kind: 'driver' })])).toHaveLength(0)
  })
})

describe('tripDays', () => {
  it('groups dated lines by day in date/time order and skips undated ones', () => {
    const days = tripDays([
      line({ id: 'late', travelDate: '2026-10-25' }),
      line({ id: 'pm', travelTime: '15:00' }),
      line({ id: 'am', travelTime: '08:00' }),
      line({ id: 'pdf', kind: 'itinerary', travelDate: null, travelTime: null }),
    ])
    expect(days.map((d) => d.date)).toEqual(['2026-10-24', '2026-10-25'])
    expect(days[0]?.lines.map((l) => l.id)).toEqual(['am', 'pm'])
  })
})

describe('driverSuggestions', () => {
  it('suggests a car per activity, sized by the party (vehicleFor)', () => {
    const out = driverSuggestions(
      [line({ id: 'a', guests: 2 }), line({ id: 'b', guests: 6, travelDate: '2026-10-26' })],
      RATES,
    )
    expect(out.map((s) => [s.itemId, s.vehicleClass, s.totalMinor])).toEqual([
      ['a', 'sedan', 5500],
      ['b', 'suv', 7000],
    ])
  })
  it('a multi-day activity hires the car for the whole range', () => {
    const [s] = driverSuggestions([line({ id: 'a', endDate: '2026-10-26' })], RATES)
    expect(s?.days).toBe(3)
    expect(s?.totalMinor).toBe(16500)
  })
  it('says nothing when the trip already has a driver', () => {
    const out = driverSuggestions(
      [line({ id: 'a' }), line({ id: 'd', kind: 'driver', parentItemId: 'a' })],
      RATES,
    )
    expect(out).toHaveLength(0)
  })
  it('says nothing for a trip without activities, or without a rate', () => {
    expect(
      driverSuggestions([line({ id: 'p', kind: 'itinerary', travelDate: null })], RATES),
    ).toHaveLength(0)
    expect(driverSuggestions([line({ id: 'a', guests: 9 })], RATES.slice(0, 2))).toHaveLength(0)
  })
})

describe('validateContact', () => {
  const base = {
    name: 'Sara Ahmed',
    email: 'Sara@Mail.com ',
    dialCode: '+966',
    phone: '051 234 5678',
    notes: '',
  }
  it('accepts and normalises a valid contact', () => {
    const r = validateContact(base)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.email).toBe('sara@mail.com')
      expect(r.value.phone).toBe('+966512345678')
      expect(r.value.notes).toBeNull()
    }
  })
  it('reports every bad field, keyed for the message', () => {
    const r = validateContact({
      name: 'S',
      email: 'sara@mail',
      dialCode: '+999',
      phone: '12',
      notes: '',
    })
    expect(r.ok).toBe(false)
    if (!r.ok)
      expect(r.errors).toEqual({ name: 'co_e_name', email: 'co_e_email', phone: 'co_e_phone' })
  })
  it('rejects letters in the phone number', () => {
    expect(validateContact({ ...base, phone: '5x1234567' }).ok).toBe(false)
  })
  it('splits a stored number back for the selector', () => {
    expect(splitPhone('+971501234567')).toEqual({ dialCode: '+971', phone: '501234567' })
    expect(splitPhone(null)).toEqual({ dialCode: '+966', phone: '' })
  })
})
