import { describe, expect, it } from 'vitest'

import { addDays, packageChildItems, type OrderLineRef, type PackageSpec } from './children'

const name = (en: string) => ({ en, ar: en, id: en })

const spec: PackageSpec = {
  packageId: 'pkg-1',
  activities: [
    { activityId: 'act-a', name: name('Batur sunrise'), dayOffset: 0 },
    { activityId: 'act-b', name: name('Ubud swing'), dayOffset: 2 },
    { activityId: 'act-c', name: name('Spa'), dayOffset: null },
  ],
  itinerary: { id: 'it-7', name: name('7 days'), version: 4 },
  vipPlan: { id: 'vip-30', name: name('VIP 30 days') },
}

const packageLine = {
  id: 'line-pkg',
  orderId: 'order-1',
  refId: 'pkg-1',
  travelDate: '2026-09-28',
  guests: 3,
  quantity: 1,
}

const self: OrderLineRef = { id: 'line-pkg', kind: 'package', refId: 'pkg-1', parentItemId: null }

describe('package child items', () => {
  it('creates one free booking per activity, under the package, on its day', () => {
    const rows = packageChildItems(packageLine, spec, [self])
    const acts = rows.filter((row) => row.kind === 'activity')
    expect(acts.map((row) => row.refId)).toEqual(['act-a', 'act-b', 'act-c'])
    for (const row of acts) {
      expect(row).toMatchObject({
        parentItemId: 'line-pkg',
        unitPriceMinor: 0,
        lineTotalMinor: 0,
        guests: 3,
        quantity: 3,
        options: { includedInPackage: 'pkg-1' },
      })
      // Booking status is left to its default (created) so the phase 2
      // after-payment step assigns a supplier and holds places.
      expect(row.bookingStatus).toBeUndefined()
    }
    expect(acts[0]?.travelDate).toBe('2026-09-28')
    // Day offset crosses a month end.
    expect(acts[1]?.travelDate).toBe('2026-09-30')
    // No day set: no date, the team arranges it.
    expect(acts[2]?.travelDate).toBeNull()
  })

  it('adds the included itinerary (pinned version) and the VIP plan, both free', () => {
    const rows = packageChildItems(packageLine, spec, [self])
    expect(rows.find((row) => row.kind === 'itinerary')).toMatchObject({
      refId: 'it-7',
      refVersion: 4,
      lineTotalMinor: 0,
      parentItemId: 'line-pkg',
    })
    expect(rows.find((row) => row.kind === 'plan')).toMatchObject({
      refId: 'vip-30',
      lineTotalMinor: 0,
      parentItemId: 'line-pkg',
    })
  })

  it('is idempotent: a second run (duplicate webhook) adds nothing', () => {
    const first = packageChildItems(packageLine, spec, [self])
    const known: OrderLineRef[] = [
      self,
      ...first.map((row, index) => ({
        id: `child-${index}`,
        kind: row.kind,
        refId: row.refId ?? null,
        parentItemId: row.parentItemId ?? null,
      })),
    ]
    expect(packageChildItems(packageLine, spec, known)).toEqual([])
  })

  it('completes a partial run without doubling what exists', () => {
    const known: OrderLineRef[] = [
      self,
      { id: 'c1', kind: 'activity', refId: 'act-a', parentItemId: 'line-pkg' },
    ]
    const rows = packageChildItems(packageLine, spec, known)
    expect(rows.filter((row) => row.refId === 'act-a')).toHaveLength(0)
    expect(rows.filter((row) => row.kind === 'activity')).toHaveLength(2)
  })

  it('never adds an itinerary or VIP plan the order already holds', () => {
    const known: OrderLineRef[] = [
      self,
      // Bought on its own in the same order, or covered in the cart.
      { id: 'it', kind: 'itinerary', refId: 'it-7', parentItemId: null },
      { id: 'vip', kind: 'plan', refId: 'vip-30', parentItemId: 'line-pkg' },
    ]
    const rows = packageChildItems(packageLine, spec, known)
    expect(rows.some((row) => row.kind === 'itinerary')).toBe(false)
    expect(rows.some((row) => row.kind === 'plan')).toBe(false)
  })

  it('a package without itinerary or VIP creates bookings only', () => {
    const rows = packageChildItems(packageLine, { ...spec, itinerary: null, vipPlan: null }, [self])
    expect(rows.every((row) => row.kind === 'activity')).toBe(true)
  })
})

describe('addDays', () => {
  it('adds calendar days without a time zone shift', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30')
    expect(addDays(null, 1)).toBeNull()
    expect(addDays('not a date', 1)).toBeNull()
  })
})
