import { describe, expect, it } from 'vitest'

import {
  assertMayWritePrices,
  assertPriceChangeAllowed,
  changedPriceFields,
  mayStorePrices,
  PriceChangeError,
} from './price-guard'
import { can, ROLES } from './roles'

const KEYS = ['priceMinor', 'childPriceMinor', 'currency'] as const
const stored = { priceMinor: 12500, childPriceMinor: null, currency: 'USD', name: 'Old' }

describe('changedPriceFields', () => {
  it('finds nothing when only non-price fields change', () => {
    expect(changedPriceFields(stored, { ...stored, name: 'New' }, KEYS)).toEqual([])
  })

  it('treats null and undefined as the same, and currency case-insensitively', () => {
    expect(
      changedPriceFields(
        stored,
        { priceMinor: 12500, childPriceMinor: undefined, currency: 'usd' },
        KEYS,
      ),
    ).toEqual([])
  })

  it('names every changed price field', () => {
    expect(
      changedPriceFields(
        stored,
        { priceMinor: 12600, childPriceMinor: 5000, currency: 'USD' },
        KEYS,
      ),
    ).toEqual(['priceMinor', 'childPriceMinor'])
    expect(changedPriceFields(stored, { ...stored, currency: 'IDR' }, KEYS)).toEqual(['currency'])
  })

  it('compares structured values by content', () => {
    expect(changedPriceFields({ tiers: [1, 2] }, { tiers: [1, 2] }, ['tiers'])).toEqual([])
    expect(changedPriceFields({ tiers: [1, 2] }, { tiers: [1, 3] }, ['tiers'])).toEqual(['tiers'])
  })

  it('on a new row counts every price that carries a value', () => {
    expect(changedPriceFields(null, { priceMinor: 0, childPriceMinor: null }, KEYS)).toEqual([])
    expect(changedPriceFields(null, { priceMinor: 100 }, KEYS)).toEqual(['priceMinor'])
  })
})

describe('mayStorePrices / assertPriceChangeAllowed', () => {
  const changed = { ...stored, priceMinor: 99 }

  for (const role of ROLES) {
    const holds = can(role, 'prices.write')
    it(`${role}: ${holds ? 'may' : 'may not'} change a price, may always keep it`, () => {
      expect(mayStorePrices(role, stored, changed, KEYS)).toBe(holds)
      expect(mayStorePrices(role, stored, { ...stored, name: 'Renamed' }, KEYS)).toBe(true)
      const attempt = () => assertPriceChangeAllowed(role, stored, changed, KEYS, 'no prices')
      if (holds) expect(attempt).not.toThrow()
      else expect(attempt).toThrow(PriceChangeError)
    })
  }

  it('staff, operations manager and admin hold prices.write; content editor, marketing, accountant do not', () => {
    for (const role of ['staff', 'operations_manager', 'admin'] as const) {
      expect(can(role, 'prices.write')).toBe(true)
    }
    for (const role of [
      'content_editor',
      'marketing_manager',
      'accountant',
      'booking_agent',
    ] as const) {
      expect(can(role, 'prices.write')).toBe(false)
    }
  })

  it('carries the plain message and the changed fields', () => {
    try {
      assertPriceChangeAllowed(
        'content_editor',
        stored,
        changed,
        KEYS,
        'دورك لا يسمح بتغيير الأسعار',
      )
      throw new Error('expected a refusal')
    } catch (error) {
      expect(error).toBeInstanceOf(PriceChangeError)
      expect((error as PriceChangeError).message).toBe('دورك لا يسمح بتغيير الأسعار')
      expect((error as PriceChangeError).fields).toEqual(['priceMinor'])
    }
  })

  it('assertMayWritePrices refuses creating or removing a priced row without prices.write', () => {
    expect(() => assertMayWritePrices('content_editor', 'no')).toThrow(PriceChangeError)
    expect(() => assertMayWritePrices('staff', 'no')).not.toThrow()
  })
})
