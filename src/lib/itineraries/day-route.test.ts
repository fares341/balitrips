import { describe, expect, it } from 'vitest'

import type { PlaceTeaser, VisiblePlaceTeaser } from '@/lib/content/extra-queries'

import {
  buildDayRoute,
  buildDayStops,
  openDayNumbers,
  orderStops,
  type DayStopRow,
} from './day-route'

const name = (en: string) => ({ en, ar: en, id: en })

function visible(id: string, lat: number, lon: number): VisiblePlaceTeaser {
  return {
    locked: false,
    id,
    slug: id,
    href: `/map?place=${id}`,
    name: name(`Place ${id}`),
    heroImageUrl: null,
    regionLabel: null,
    categoryLabel: null,
    lat,
    lon,
    isFree: true,
  }
}

const SECRET = 'Secret Waterfall'

const rows: DayStopRow[] = [
  { placeId: 'c', sortOrder: 2, note: name('Lunch here'), visitTime: '12:30' },
  { placeId: 'a', sortOrder: 0, note: null, visitTime: '08:00' },
  // The note names the hidden place: it must not leak for a locked stop.
  { placeId: 'secret', sortOrder: 1, note: name(`Swim at ${SECRET}`), visitTime: '10:00' },
  { placeId: 'gone', sortOrder: 3, note: null, visitTime: null },
]

const teasers = new Map<string, PlaceTeaser>([
  ['a', visible('a', -8.5, 115.26)],
  ['c', visible('c', -8.51, 115.28)],
  // What the redaction point returns for a place the viewer cannot see.
  ['secret', { locked: true, requiredEntitlement: 'vip' }],
])

describe('day places order', () => {
  it('orders by position, stable on ties', () => {
    const tie = [
      { id: 'first', sortOrder: 1 },
      { id: 'second', sortOrder: 1 },
      { id: 'zero', sortOrder: 0 },
    ]
    expect(orderStops(tie).map((row) => row.id)).toEqual(['zero', 'first', 'second'])
  })

  it('numbers every stop in visiting order and drops withdrawn places', () => {
    const stops = buildDayStops(rows, teasers)
    expect(stops.map((stop) => stop.number)).toEqual([1, 2, 3])
    expect(stops.map((stop) => (stop.locked ? 'locked' : stop.place.id))).toEqual([
      'a',
      'locked',
      'c',
    ])
  })
})

describe('itinerary map mode redaction', () => {
  it('sends no field of a locked place — not even the editor note or time', () => {
    const route = buildDayRoute(buildDayStops(rows, teasers))
    const sent = JSON.stringify(route)
    expect(sent).not.toContain(SECRET)
    expect(sent).not.toContain('secret')
    expect(sent).not.toContain('10:00')
    const locked = route.stops.find((stop) => stop.locked)
    expect(locked).toEqual({ locked: true, number: 2, requiredEntitlement: 'vip' })
  })

  it('pins and joins only the visible places, keeping their numbers', () => {
    const route = buildDayRoute(buildDayStops(rows, teasers))
    expect(route.pins.map((pin) => pin.number)).toEqual([1, 3])
    expect(route.line).toEqual([
      [115.26, -8.5],
      [115.28, -8.51],
    ])
    expect(route.lockedCount).toBe(1)
    expect(route.lockedNeeds).toBe('vip')
  })

  it('draws no line for a single visible place', () => {
    const route = buildDayRoute(buildDayStops([rows[1] as DayStopRow], teasers))
    expect(route.pins).toHaveLength(1)
    expect(route.line).toEqual([])
  })

  it('a viewer with access sees the place and its note', () => {
    const open = new Map(teasers)
    open.set('secret', { ...visible('secret', -8.4, 115.3), name: name(SECRET) })
    const route = buildDayRoute(buildDayStops(rows, open))
    expect(route.lockedCount).toBe(0)
    expect(JSON.stringify(route)).toContain(SECRET)
  })
})

describe('which days a viewer may open', () => {
  it('buyers and staff: all; everyone else: day 1 only', () => {
    expect([...openDayNumbers([3, 1, 2], true)]).toEqual([1, 2, 3])
    expect([...openDayNumbers([3, 1, 2], false)]).toEqual([1])
  })
})
