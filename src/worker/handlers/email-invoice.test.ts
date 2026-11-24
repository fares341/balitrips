/** The confirmation e-mail waits for the invoice PDF, then sends with or without it. */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ invoice: null as unknown, file: null as unknown }))

vi.mock('@/db', () => ({ db: {} }))
vi.mock('@/i18n/routing', () => ({ getPathname: ({ href }: { href: string }) => href }))
vi.mock('@/lib/pdf/invoice-delivery', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/pdf/invoice-delivery')>()
  return {
    ...actual,
    readInvoiceState: async () => state.invoice,
    loadInvoiceFile: async () => state.file,
  }
})

const { confirmationInvoice } = await import('./email')
const { INVOICE_POLL_SECONDS, INVOICE_WAIT_MS } = await import('@/lib/pdf/invoice-delivery')

function context(emailJob: string | null = 'job-2') {
  return {
    enqueueEmail: vi.fn(async () => emailJob),
    enqueuePdf: vi.fn(async () => 'pdf-1'),
    enqueueWaAuto: vi.fn(async () => null),
  }
}

const file = {
  bytes: new Uint8Array([37, 80, 68, 70]),
  filename: 'Bali-Trips-Invoice-BT-INV-2026-00042.pdf',
  invoiceNumber: 'BT-INV-2026-00042',
}

describe('confirmationInvoice', () => {
  beforeEach(() => {
    state.file = file
  })

  it('attaches the rendered PDF', async () => {
    state.invoice = {
      expected: true,
      invoiceNumber: 'N',
      rendered: true,
      bytes: 4,
      invoicedAt: new Date(),
    }
    const ctx = context()
    expect(await confirmationInvoice('o1', ctx)).toEqual({
      filename: file.filename,
      bytes: file.bytes,
    })
    expect(ctx.enqueueEmail).not.toHaveBeenCalled()
  })

  it('defers itself (and queues the render) while the PDF is being made', async () => {
    state.invoice = {
      expected: true,
      invoiceNumber: 'N',
      rendered: false,
      bytes: null,
      invoicedAt: new Date(),
    }
    const ctx = context()
    expect(await confirmationInvoice('o1', ctx)).toBe('deferred')
    expect(ctx.enqueuePdf).toHaveBeenCalledWith(
      { kind: 'invoice', orderId: 'o1' },
      { throttleKey: 'invoice:o1', throttleSeconds: 1800 },
    )
    expect(ctx.enqueueEmail).toHaveBeenCalledWith(
      { kind: 'order_confirmation', orderId: 'o1' },
      { startAfterSeconds: INVOICE_POLL_SECONDS },
    )
  })

  it('sends now (without the PDF) when it cannot defer, or the wait is over', async () => {
    state.invoice = {
      expected: true,
      invoiceNumber: 'N',
      rendered: false,
      bytes: null,
      invoicedAt: new Date(),
    }
    expect(await confirmationInvoice('o1', context(null))).toBeNull()
    expect(await confirmationInvoice('o1', undefined)).toBeNull()
    state.invoice = {
      expected: true,
      invoiceNumber: 'N',
      rendered: false,
      bytes: null,
      invoicedAt: new Date(Date.now() - INVOICE_WAIT_MS - 1000),
    }
    const ctx = context()
    expect(await confirmationInvoice('o1', ctx)).toBeNull()
    expect(ctx.enqueueEmail).not.toHaveBeenCalled()
  })

  it('no invoice (no number yet) → no attachment, no wait', async () => {
    state.invoice = {
      expected: false,
      invoiceNumber: null,
      rendered: false,
      bytes: null,
      invoicedAt: null,
    }
    const ctx = context()
    expect(await confirmationInvoice('o1', ctx)).toBeNull()
    expect(ctx.enqueueEmail).not.toHaveBeenCalled()
  })
})
