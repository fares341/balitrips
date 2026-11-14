import { describe, expect, it } from 'vitest'

import { supersededLineIds, type MergeLine } from './merge-lines'

const line = (over: Partial<MergeLine> & Pick<MergeLine, 'id' | 'kind'>): MergeLine => ({
  refId: null,
  travelDate: null,
  travelTime: null,
  endDate: null,
  vehicleClass: null,
  parentItemId: null,
  options: null,
  ...over,
})

describe('supersededLineIds (guest trip merged into the account trip)', () => {
  it('an itinerary or plan in both carts is kept once — today’s copy', () => {
    const owned = [
      line({ id: 'o-itin', kind: 'itinerary', refId: 'itin-1' }),
      line({ id: 'o-plan', kind: 'plan', refId: 'plan-1', options: {} }),
      line({ id: 'o-other', kind: 'itinerary', refId: 'itin-2' }),
    ]
    const incoming = [
      // Different level / device count: still the same product, bought once.
      line({ id: 'n-itin', kind: 'itinerary', refId: 'itin-1', options: {} }),
      line({ id: 'n-plan', kind: 'plan', refId: 'plan-1', options: {} }),
    ]
    expect(supersededLineIds(owned, incoming).sort()).toEqual(['o-itin', 'o-plan'])
  })

  it('the same activity booking is replaced together with its driver', () => {
    const booking = {
      kind: 'activity_tier',
      refId: 'tier-1',
      travelDate: '2026-11-25',
      travelTime: '09:00:00',
      options: { addons: [{ id: 'boat', qty: 1 }] },
    }
    const owned = [
      line({ id: 'o-act', ...booking }),
      line({ id: 'o-drv', kind: 'driver', parentItemId: 'o-act', travelDate: '2026-11-25' }),
    ]
    const incoming = [line({ id: 'n-act', ...booking, travelTime: '09:00' })]
    expect(supersededLineIds(owned, incoming).sort()).toEqual(['o-act', 'o-drv'])
  })

  it('a different date, time or set of extras is a different booking', () => {
    const base = {
      kind: 'activity_tier',
      refId: 'tier-1',
      travelDate: '2026-11-25',
      travelTime: '09:00',
      options: { addons: [{ id: 'boat', qty: 1 }] },
    }
    const owned = [line({ id: 'o', ...base })]
    expect(
      supersededLineIds(owned, [line({ id: 'n', ...base, travelDate: '2026-11-26' })]),
    ).toEqual([])
    expect(supersededLineIds(owned, [line({ id: 'n', ...base, travelTime: '11:30' })])).toEqual([])
    expect(supersededLineIds(owned, [line({ id: 'n', ...base, options: { addons: [] } })])).toEqual(
      [],
    )
    expect(supersededLineIds(owned, [line({ id: 'n', ...base, refId: 'tier-2' })])).toEqual([])
  })

  it('a driver booked on its own is matched by its dates and vehicle', () => {
    const driver = { kind: 'driver', travelDate: '2026-11-25', endDate: '2026-11-26' }
    const owned = [line({ id: 'o', ...driver, vehicleClass: 'sedan' })]
    expect(supersededLineIds(owned, [line({ id: 'n', ...driver, vehicleClass: 'sedan' })])).toEqual(
      ['o'],
    )
    expect(supersededLineIds(owned, [line({ id: 'n', ...driver, vehicleClass: 'van' })])).toEqual(
      [],
    )
  })

  it('linked lines never match on their own, and nothing incoming means nothing dropped', () => {
    const owned = [
      line({ id: 'o-act', kind: 'activity', refId: 'a', travelDate: '2026-11-25' }),
      line({ id: 'o-drv', kind: 'driver', parentItemId: 'o-act', travelDate: '2026-11-25' }),
    ]
    const incomingChild = [
      line({ id: 'n-drv', kind: 'driver', parentItemId: 'x', travelDate: '2026-11-25' }),
    ]
    expect(supersededLineIds(owned, incomingChild)).toEqual([])
    expect(supersededLineIds(owned, [])).toEqual([])
  })
})
