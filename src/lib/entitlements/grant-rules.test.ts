import { describe, expect, it } from 'vitest'

import { extendedExpiry } from './extend'
import { grantablePlanLines, isLineLive } from './grant-rules'

/**
 * VIP as an extra line (phase 3): granted once, only from a paid order (the
 * only caller is the after-payment hook), and taken back with a refund.
 */

describe('plan lines granted on payment', () => {
  it('grants a VIP add-on line, once per plan', () => {
    const lines = [
      { plan: { id: 'vip-30' }, parentItemId: null },
      { plan: { id: 'vip-30' }, parentItemId: 'pkg-line' },
    ]
    expect(grantablePlanLines(lines, new Set())).toHaveLength(1)
  })

  it('does not grant a VIP plan the cart found already covered by a VIP itinerary', () => {
    const lines = [{ plan: { id: 'vip-30' }, parentItemId: 'itin-line' }]
    expect(grantablePlanLines(lines, new Set(['itin-line']))).toEqual([])
  })

  it('grants the VIP plan that comes with a package', () => {
    const lines = [{ plan: { id: 'vip-30' }, parentItemId: 'pkg-line' }]
    expect(grantablePlanLines(lines, new Set(['itin-line']))).toHaveLength(1)
  })
})

interface Row {
  id: string
  lineTotalMinor: number
  refundedMinor: number
  fulfilmentStatus: string
  parentItemId: string | null
}

describe('is a line still paid for (refunds)', () => {
  const pkg: Row = {
    id: 'pkg',
    lineTotalMinor: 69000,
    refundedMinor: 0,
    fulfilmentStatus: 'confirmed',
    parentItemId: null,
  }
  const vipChild: Row = {
    id: 'vip',
    lineTotalMinor: 0,
    refundedMinor: 0,
    fulfilmentStatus: 'pending',
    parentItemId: 'pkg',
  }
  const addon: Row = {
    id: 'addon',
    lineTotalMinor: 3900,
    refundedMinor: 0,
    fulfilmentStatus: 'pending',
    parentItemId: null,
  }

  it('a priced line is live until fully refunded', () => {
    expect(isLineLive(addon, [addon])).toBe(true)
    const refunded = { ...addon, refundedMinor: 3900 }
    expect(isLineLive(refunded, [refunded])).toBe(false)
    const partly = { ...addon, refundedMinor: 1000 }
    expect(isLineLive(partly, [partly])).toBe(true)
  })

  it("a package's free VIP child lives and dies with the package", () => {
    expect(isLineLive(vipChild, [pkg, vipChild])).toBe(true)
    const refundedPkg = { ...pkg, refundedMinor: 69000 }
    expect(isLineLive(vipChild, [refundedPkg, vipChild])).toBe(false)
    expect(isLineLive({ ...vipChild, fulfilmentStatus: 'refunded' }, [pkg])).toBe(false)
  })

  it('a free line under nothing (a saved place) never counts as paid access', () => {
    const place = { ...addon, id: 'place', lineTotalMinor: 0 }
    expect(isLineLive(place, [place])).toBe(false)
  })
})

describe('extend by N days', () => {
  const now = new Date('2026-10-20T12:00:00Z')

  it('adds to a running grant from its end', () => {
    const end = new Date('2026-10-25T00:00:00Z')
    expect(extendedExpiry(end, 7, now).toISOString()).toBe('2026-11-01T00:00:00.000Z')
  })

  it('restarts an ended grant from now', () => {
    const ended = new Date('2026-10-01T00:00:00Z')
    expect(extendedExpiry(ended, 7, now).toISOString()).toBe('2026-10-27T12:00:00.000Z')
  })
})
