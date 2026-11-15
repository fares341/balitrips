import { describe, expect, it } from 'vitest'

import { stepsKm, sweepOrder } from './carousel-order'
import { nearestChain } from './explore'

const at = (id: string, lat: number, lon: number) => ({ id, lat, lon })

// A small Bali: Canggu, Seminyak, Kuta (south-west), Ubud (centre), Nusa
// Penida (east, over the sea), Gilimanuk (far west), Lovina (north coast).
const BALI = [
  at('lovina', -8.159, 115.025),
  at('canggu', -8.648, 115.138),
  at('gilimanuk', -8.177, 114.441),
  at('seminyak', -8.691, 115.168),
  at('penida', -8.727, 115.544),
  at('kuta', -8.718, 115.169),
  at('ubud', -8.507, 115.263),
  at('ubud-2', -8.51, 115.27),
  at('canggu-2', -8.652, 115.13),
]

describe('sweepOrder', () => {
  it('starts at the place nearest the anchor', () => {
    const order = sweepOrder(BALI, { lat: -8.5, lon: 115.26 })
    expect(order[0]!.id).toBe('ubud')
    expect(order[1]!.id).toBe('ubud-2')
  })

  it('starts at the chosen place when given, then its nearest neighbours', () => {
    const order = sweepOrder(BALI, BALI[1]!, 'canggu')
    expect(order.map((one) => one.id).slice(0, 4)).toEqual([
      'canggu',
      'canggu-2',
      'seminyak',
      'kuta',
    ])
  })

  it('keeps every place exactly once', () => {
    const order = sweepOrder(BALI, { lat: -8.7, lon: 115.2 })
    expect(order).toHaveLength(BALI.length)
    expect(new Set(order.map((one) => one.id)).size).toBe(BALI.length)
  })

  it('the first swipes from Canggu stay in the south-west (no flight across the island)', () => {
    const order = sweepOrder(BALI, BALI[1]!, 'canggu')
    const first = stepsKm(order.slice(0, 4))
    for (const km of first) expect(km).toBeLessThan(7)
  })

  it('follows the visitor: anchored on Ubud the cards no longer start in Canggu', () => {
    // The old order started at the API's first place wherever the visitor looked.
    expect(nearestChain(BALI)[0]!.id).toBe('lovina')
    expect(sweepOrder(BALI, { lat: -8.506, lon: 115.262 })[0]!.id).toBe('ubud')
  })

  it('is deterministic and leaves its input alone', () => {
    const copy = [...BALI]
    expect(sweepOrder(BALI, { lat: -8.6, lon: 115.2 })).toEqual(
      sweepOrder(BALI, { lat: -8.6, lon: 115.2 }),
    )
    expect(BALI).toEqual(copy)
  })

  it('handles tiny lists and an unknown first id', () => {
    expect(sweepOrder([], { lat: 0, lon: 0 })).toEqual([])
    expect(sweepOrder([BALI[0]!], { lat: 0, lon: 0 })).toEqual([BALI[0]])
    expect(sweepOrder(BALI, { lat: -8.177, lon: 114.441 }, 'gone')[0]!.id).toBe('gilimanuk')
  })
})

describe('stepsKm', () => {
  it('measures Canggu → Seminyak as a few km', () => {
    const [km] = stepsKm([BALI[1]!, BALI[3]!])
    expect(km).toBeGreaterThan(4)
    expect(km).toBeLessThan(7)
  })
})
