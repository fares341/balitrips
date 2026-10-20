import { describe, expect, it } from 'vitest'

import { ADAPTER_OPERATIONS, canSync, CONNECTION_TYPES, supports } from './adapter'
import { SecretBag } from './crypto'
import { adapterFor, implementedTypes, isImplemented } from './registry'

const context = {
  integration: {
    id: '11111111-1111-4111-8111-111111111111',
    supplierId: '22222222-2222-4222-8222-222222222222',
    name: 'Test',
    connectionType: 'manual' as const,
    environment: 'sandbox' as const,
    services: ['bookings' as const],
  },
  secrets: new SecretBag({}),
}

describe('adapter registry', () => {
  it('ships exactly two real adapters: manual and csv', () => {
    expect(implementedTypes().sort()).toEqual(['csv', 'manual'])
    expect(isImplemented('manual')).toBe(true)
    expect(isImplemented('csv')).toBe(true)
  })

  it('gives every remote type a placeholder that does nothing (no fake API)', () => {
    for (const type of CONNECTION_TYPES.filter((type) => type !== 'manual' && type !== 'csv')) {
      const adapter = adapterFor(type)
      expect(adapter.type).toBe(type)
      expect(adapter.implemented).toBe(false)
      for (const operation of ADAPTER_OPERATIONS) expect(supports(adapter, operation)).toBe(false)
      expect(canSync(adapter)).toBe(false)
    }
  })

  it('manual: bookings by hand, nothing to pull, no remote calls', async () => {
    const adapter = adapterFor('manual')
    expect(canSync(adapter)).toBe(false)
    expect(supports(adapter, 'createBooking')).toBe(true)
    const result = await adapter.createBooking?.(context, {
      orderItemId: 'line',
      externalProductId: null,
      travelDate: '2026-11-03',
      travelTime: null,
      guests: 2,
      reference: 'BT-2026-0001',
    })
    expect(result).toMatchObject({ status: 'pending_supplier', supplierRef: null })
    expect(result?.note).toContain('BT-2026-0001')
  })

  it('csv: imports arrive as uploaded files, so there is nothing to sync', () => {
    const adapter = adapterFor('csv')
    expect(canSync(adapter)).toBe(false)
    expect(supports(adapter, 'importPrices')).toBe(false)
    expect(supports(adapter, 'createBooking')).toBe(true)
  })
})
