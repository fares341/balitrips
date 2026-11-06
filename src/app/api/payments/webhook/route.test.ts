import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  process: vi.fn(),
  notifyPaid: vi.fn(),
  notifyAuthorized: vi.fn(),
  notifyFailed: vi.fn(),
  recordError: vi.fn(),
}))

vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>()
  return { ...actual, after: vi.fn() }
})
vi.mock('@/db', () => ({
  // releaseCartFor: no order row, nothing to release.
  db: { select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }) },
}))
vi.mock('@/db/schema', () => ({ cartItems: {}, orders: {} }))
vi.mock('@/lib/cart', () => ({ clearCartForUser: vi.fn() }))
vi.mock('@/lib/orders/payment-method', () => ({ recordPaymentMethod: vi.fn() }))
vi.mock('@/lib/orders/webhook', () => ({ processWebhookEvent: mocks.process }))
vi.mock('@/lib/monitoring/errors', () => ({ recordError: mocks.recordError }))
vi.mock('@/lib/payments', () => ({
  getPaymentProvider: () => ({
    name: 'test',
    parseWebhook: async () => ({
      providerEventId: 'evt_1',
      type: 'payment.succeeded',
      providerPaymentId: 'pay_1',
    }),
  }),
}))
vi.mock('@/lib/notify/orders', () => ({
  notifyOrderPaid: mocks.notifyPaid,
  notifyOrderAuthorized: mocks.notifyAuthorized,
  notifyPaymentFailed: mocks.notifyFailed,
}))

import { POST } from './route'

function request(): Request {
  return new Request('http://localhost/api/payments/webhook', { method: 'POST', body: '{}' })
}

describe('payment webhook follow-ups', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('answers 200 when the paid notifications throw after the commit', async () => {
    mocks.process.mockResolvedValue({ handled: true, orderId: 'o1', from: 'pending', to: 'paid' })
    mocks.notifyPaid.mockRejectedValue(new Error('whatsapp down'))

    const response = await POST(request())

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ received: true, status: 'paid' })
    expect(mocks.notifyPaid).toHaveBeenCalledWith('o1')
    expect(mocks.recordError).not.toHaveBeenCalled()
  })

  it('answers 200 when the authorized notifications throw', async () => {
    mocks.process.mockResolvedValue({
      handled: true,
      orderId: 'o2',
      from: 'pending',
      to: 'authorized',
    })
    mocks.notifyAuthorized.mockRejectedValue(new Error('boom'))
    expect((await POST(request())).status).toBe(200)
  })

  it('answers 200 when the payment-failed notifications throw', async () => {
    mocks.process.mockResolvedValue({
      handled: true,
      orderId: 'o3',
      from: 'pending',
      to: 'pending',
      paymentFailed: true,
    })
    mocks.notifyFailed.mockRejectedValue(new Error('boom'))
    expect((await POST(request())).status).toBe(200)
  })

  it('still asks for a retry when the state transaction itself fails', async () => {
    mocks.process.mockRejectedValue(new Error('db down'))
    expect((await POST(request())).status).toBe(500)
    expect(mocks.notifyPaid).not.toHaveBeenCalled()
  })
})
