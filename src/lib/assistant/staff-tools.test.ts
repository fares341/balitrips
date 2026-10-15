import { describe, expect, it } from 'vitest'

import type { Role } from '@/lib/auth/roles'

import { runTool } from './engine'
import {
  ACTION_CAPABILITY,
  STAFF_TOOLS,
  maskEmail,
  maskPhone,
  toolsFor,
  type StaffCtx,
  type StaffDeps,
} from './staff-tools'

/** A dependency object that records calls and fails loudly on anything unexpected. */
function deps(over: Partial<StaffDeps> = {}): StaffDeps & { calls: string[] } {
  const calls: string[] = []
  return new Proxy(over, {
    get(target, prop) {
      if (prop === 'calls') return calls
      if (typeof prop !== 'string' || prop === 'then') return undefined
      const value = target[prop as keyof StaffDeps]
      return (...args: unknown[]) => {
        calls.push(prop)
        if (value === undefined) throw new Error(`unexpected dependency call: ${prop}`)
        return (value as (...a: unknown[]) => unknown)(...args)
      }
    },
  }) as StaffDeps & { calls: string[] }
}

function ctx(role: Role, d: StaffDeps): StaffCtx {
  return {
    role,
    userId: 'staff-1',
    locale: 'en',
    conversationId: 'c-1',
    href: (p) => `/studio-x${p}`,
    deps: d,
  }
}

const run = (name: string, args: unknown, context: StaffCtx) =>
  runTool([...STAFF_TOOLS], { name, arguments: JSON.stringify(args) }, context)

const ORDER_ID = '33333333-3333-4333-8333-333333333333'
const ITEM_ID = '44444444-4444-4444-8444-444444444444'

describe('Studio tools enforce capabilities themselves', () => {
  it('a customer session gets "forbidden" from every tool, and no data is read', async () => {
    const d = deps()
    for (const tool of STAFF_TOOLS) {
      const result = await run(tool.name, {}, ctx('customer', d))
      // Either the capability gate or argument validation stops it; neither reads data.
      expect(JSON.stringify(result.data)).toMatch(/forbidden|invalid_arguments/)
    }
    expect(d.calls).toEqual([])
  })

  it('staff (no config.write) cannot read settings', async () => {
    const d = deps({ settings: async () => ({ secret: 'nope' }) })
    const result = await run('get_settings', {}, ctx('staff', d))
    expect(result.data).toEqual({ error: 'forbidden', needs: 'config.write' })
    expect(d.calls).toEqual([])
  })

  it('an admin can read settings', async () => {
    const d = deps({ settings: async () => ({ fees: {} }) })
    const result = await run('get_settings', {}, ctx('admin', d))
    expect(result.data).toMatchObject({ fees: {}, studio: '/studio-x/config' })
  })

  it('staff can read orders, but payment details only with payments.read', async () => {
    const d = deps({
      getOrder: async () => ({
        id: ORDER_ID,
        orderNumber: 'BT-1001',
        status: 'paid',
        totalMinor: 5000,
        currency: 'USD',
        customerName: 'Sara',
        customerEmail: 'sara@example.com',
        placedAt: '2026-10-15T01:00:00.000Z',
        items: [],
      }),
      orderPayments: async () => [],
    })
    const result = await run('get_order', { orderNumber: 'BT-1001' }, ctx('staff', d))
    expect(result.data).toMatchObject({
      found: true,
      orderNumber: 'BT-1001',
      email: 's***@example.com',
    })
    // staff hold payments.read, so payments were fetched
    expect(d.calls).toContain('orderPayments')
    expect(JSON.stringify(result.data)).not.toContain('sara@example.com')
  })

  it('only offers the model the tools this role may use', () => {
    const staff = toolsFor('staff').map((tool) => tool.name)
    expect(staff).toContain('list_orders')
    expect(staff).toContain('propose_booking_status')
    expect(staff).not.toContain('get_settings')
    expect(toolsFor('customer')).toEqual([])
    expect(toolsFor('admin').length).toBe(STAFF_TOOLS.length)
  })

  it('every write kind declares the capability it is re-checked against on Confirm', () => {
    for (const kind of [
      'booking_status',
      'content_status',
      'place_draft',
      'lead_status',
      'lead_note',
      'contact_status',
    ]) {
      expect(ACTION_CAPABILITY[kind]).toBeDefined()
    }
  })
})

describe('Studio write tools only propose', () => {
  it('propose_booking_status stores a proposal with the before → after change, and changes nothing', async () => {
    const stored: unknown[] = []
    const d = deps({
      orderItemState: async () => ({
        orderId: ORDER_ID,
        name: 'Ubud swing',
        bookingStatus: 'created',
        orderStatus: 'paid',
      }),
      createAction: async (input) => {
        stored.push(input)
        return '55555555-5555-4555-8555-555555555555'
      },
    })
    const result = await run(
      'propose_booking_status',
      { orderNumber: 'BT-1001', orderItemId: ITEM_ID, status: 'confirmed' },
      ctx('staff', d),
    )
    expect(result.action).toMatchObject({
      id: '55555555-5555-4555-8555-555555555555',
      kind: 'booking_status',
      summary: { order: 'BT-1001', item: 'Ubud swing', change: 'created → confirmed' },
    })
    expect(stored).toHaveLength(1)
    expect(d.calls).toEqual(['orderItemState', 'createAction'])
  })

  it('refuses an unknown status before reading anything', async () => {
    const d = deps()
    const result = await run(
      'propose_booking_status',
      { orderNumber: 'BT-1001', orderItemId: ITEM_ID, status: 'teleported' },
      ctx('admin', d),
    )
    expect(result.data).toMatchObject({ error: 'invalid_arguments' })
    expect(d.calls).toEqual([])
  })

  it('a place draft must be on Bali', async () => {
    const d = deps()
    const result = await run(
      'propose_place_draft',
      { slug: 'eiffel-tower', nameEn: 'Eiffel Tower', lat: 48.85, lon: 2.29 },
      ctx('admin', d),
    )
    expect(result.data).toMatchObject({ error: 'invalid_arguments' })
  })
})

describe('PII masking', () => {
  it('masks emails and phones', () => {
    expect(maskEmail('sara.k@example.com')).toBe('s***@example.com')
    expect(maskEmail(null)).toBeNull()
    expect(maskPhone('+62 812-3456-7890')).toBe('•••• 7890')
    expect(maskPhone('12')).toBe('••••')
  })
})
