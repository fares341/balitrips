/**
 * The payment message with the invoice PDF: payload building (Mazbot
 * multipart, Meta media upload + header), the wait/fallback decision and the
 * one-message-per-payment rule. No network: every fetch is a fake.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  INVOICE_POLL_SECONDS,
  INVOICE_WAIT_MS,
  invoiceFilename,
  invoiceStep,
  WHATSAPP_DOCUMENT_MAX_BYTES,
  type InvoiceState,
} from '@/lib/pdf/invoice-delivery'

import { AUTOMATIONS, templateValues } from './automations'
import {
  createMazbotProvider,
  createMetaProvider,
  mazbotTemplateForm,
  metaMediaForm,
  metaTemplatePayload,
  resetMazbotToken,
} from './providers'
import type { ResolvedCredentials } from './settings'

/* ---------------- Mocks for the delivery job ---------------- */

const state = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
  updates: [] as Record<string, unknown>[],
  settings: null as unknown,
  invoice: null as unknown,
  file: null as unknown,
}))

vi.mock('@/db', () => {
  const select = () => ({
    from: () => ({ where: () => ({ limit: async () => (state.row ? [state.row] : []) }) }),
  })
  const update = () => ({
    set: (values: Record<string, unknown>) => ({
      where: async () => {
        state.updates.push(values)
        if (state.row) Object.assign(state.row, values)
      },
    }),
  })
  return { db: { select, update } }
})

vi.mock('@/i18n/routing', () => ({
  getPathname: ({ href, locale }: { href: string; locale: string }) => `/${locale}${href}`,
}))

vi.mock('./settings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./settings')>()
  return {
    ...actual,
    readWhatsappSettings: async () => state.settings,
    resolveCredentials: async () => mazbotCreds,
  }
})

vi.mock('@/lib/pdf/invoice-delivery', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/pdf/invoice-delivery')>()
  return {
    ...actual,
    readInvoiceState: async () => state.invoice,
    loadInvoiceFile: async () => state.file,
  }
})

const mazbotCreds: ResolvedCredentials = {
  provider: 'mazbot',
  apiUrl: 'https://mazbot.example/api',
  apiKey: 'test-key',
  loginEmail: 'staff@example.com',
  password: 'pw',
  senderNumber: null,
  fromEnv: { apiUrl: false, apiKey: false, loginEmail: false, password: false },
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const pdf = {
  bytes: new TextEncoder().encode('%PDF-1.7 test'),
  filename: 'Bali-Trips-Invoice-BT-INV-2026-00042.pdf',
}

/* ---------------- Payload building ---------------- */

describe('Mazbot template with a document header', () => {
  it('builds multipart fields in 1-based bracket notation with the named PDF', async () => {
    const form = mazbotTemplateForm({
      to: '6281234',
      text: '',
      locale: 'ar',
      template: '17',
      params: ['Ahmed', 'SAR 1,000', 'BT-1001', 'BT-INV-2026-00042'],
      document: pdf,
    })
    expect(form.get('template_id')).toBe('17')
    expect(form.get('mobile')).toBe('6281234')
    expect(form.get('body_matchs[1]')).toBe('input_value')
    expect(form.get('body_matchs[4]')).toBe('input_value')
    expect(form.get('body_values[1]')).toBe('Ahmed')
    expect(form.get('body_values[4]')).toBe('BT-INV-2026-00042')
    expect(form.has('body_values[0]')).toBe(false)
    const file = form.get('document') as File
    expect(file.name).toBe(pdf.filename)
    expect(file.type).toBe('application/pdf')
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(pdf.bytes)
  })

  it('posts multipart (no JSON content type) only when a document is sent', async () => {
    resetMazbotToken()
    const calls: { url: string; init: RequestInit }[] = []
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} })
      if (String(url).endsWith('/login')) return json({ data: { token: 'jwt-1' } })
      return json({ success: true, message_id: 77 })
    }) as unknown as typeof fetch
    const provider = createMazbotProvider(mazbotCreds, fetchImpl)
    const base = { to: '62812', text: 'x', locale: 'en' as const, template: '9', params: ['a'] }

    expect(await provider.send({ ...base, document: pdf })).toEqual({ ok: true, messageId: '77' })
    const withDoc = calls[1]!
    expect(withDoc.url).toBe('https://mazbot.example/api/whatsapp/send-template')
    expect(withDoc.init.body).toBeInstanceOf(FormData)
    const headers = withDoc.init.headers as Record<string, string>
    expect(headers['Content-Type']).toBeUndefined()
    expect(headers.apikey).toBe('test-key')
    expect(headers.Authorization).toBe('Bearer jwt-1')

    await provider.send(base)
    const plain = calls[2]!
    expect(typeof plain.init.body).toBe('string')
    expect((plain.init.headers as Record<string, string>)['Content-Type']).toBe('application/json')
    expect(JSON.parse(plain.init.body as string)).toEqual({
      template_id: 9,
      mobile: '62812',
      body_matchs: { '1': 'input_value' },
      body_values: { '1': 'a' },
    })
  })

  it('refuses a document without a template (cannot be a session message)', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch
    const provider = createMazbotProvider(mazbotCreds, fetchImpl)
    const result = await provider.send({
      to: '62812',
      text: 'x',
      locale: 'en',
      template: null,
      params: [],
      document: pdf,
    })
    expect(result.ok).toBe(false)
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('Meta template with a document header', () => {
  const metaCreds: ResolvedCredentials = {
    ...mazbotCreds,
    provider: 'meta',
    apiKey: 'meta-token',
    senderNumber: '1099',
  }

  it('uploads the PDF to /media, then sends the header document by id with its filename', async () => {
    vi.stubEnv('WHATSAPP_TOKEN', '')
    vi.stubEnv('WHATSAPP_PHONE_NUMBER_ID', '')
    const calls: { url: string; init: RequestInit }[] = []
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} })
      if (String(url).endsWith('/media')) return json({ id: 'media-123' })
      return json({ messages: [{ id: 'wamid.1' }] })
    }) as unknown as typeof fetch
    const provider = createMetaProvider(metaCreds, fetchImpl)
    const result = await provider.send({
      to: '62812',
      text: 'x',
      locale: 'id',
      template: 'bali_payment_invoice',
      params: ['A', 'B'],
      document: pdf,
    })
    expect(result).toEqual({ ok: true, messageId: 'wamid.1' })
    expect(calls[0]!.url).toBe('https://graph.facebook.com/v20.0/1099/media')
    const upload = calls[0]!.init.body as FormData
    expect(upload.get('messaging_product')).toBe('whatsapp')
    expect(upload.get('type')).toBe('application/pdf')
    expect((upload.get('file') as File).name).toBe(pdf.filename)
    expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBe(
      'Bearer meta-token',
    )
    expect(calls[1]!.url).toBe('https://graph.facebook.com/v20.0/1099/messages')
    const sent = JSON.parse(calls[1]!.init.body as string)
    expect(sent.template.components).toEqual([
      {
        type: 'header',
        parameters: [{ type: 'document', document: { id: 'media-123', filename: pdf.filename } }],
      },
      {
        type: 'body',
        parameters: [
          { type: 'text', text: 'A' },
          { type: 'text', text: 'B' },
        ],
      },
    ])
    vi.unstubAllEnvs()
  })

  it('a failed upload sends nothing', async () => {
    vi.stubEnv('WHATSAPP_TOKEN', '')
    vi.stubEnv('WHATSAPP_PHONE_NUMBER_ID', '')
    const fetchImpl = vi.fn(async () =>
      json({ error: { message: 'bad file' } }, 400),
    ) as unknown as typeof fetch
    const provider = createMetaProvider(metaCreds, fetchImpl)
    const result = await provider.send({
      to: '62812',
      text: 'x',
      locale: 'en',
      template: 't',
      params: [],
      document: pdf,
    })
    expect(result).toEqual({ ok: false, retryable: false, error: 'Meta media upload: bad file' })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    vi.unstubAllEnvs()
  })

  it('no header component without a document', () => {
    const payload = metaTemplatePayload({
      to: '1',
      text: '',
      locale: 'en',
      template: 't',
      params: ['a'],
    }) as { template: { components: { type: string }[] } }
    expect(payload.template.components.map((c) => c.type)).toEqual(['body'])
    expect(metaMediaForm(pdf).get('type')).toBe('application/pdf')
  })
})

describe('the payment_invoice automation', () => {
  it('sends name, amount, order, invoice as {{1}}…{{4}}', () => {
    expect(AUTOMATIONS.payment_invoice.vars).toEqual(['name', 'amount', 'order', 'invoice'])
    expect(
      templateValues('payment_invoice', {
        name: 'Ahmed',
        amount: 'SAR 1,000',
        order: 'BT-1001',
        invoice: 'BT-INV-2026-00042',
        link: 'ignored',
      }),
    ).toEqual(['Ahmed', 'SAR 1,000', 'BT-1001', 'BT-INV-2026-00042'])
  })

  it('names the file after the invoice number', () => {
    expect(invoiceFilename('BT-INV-2026-00042')).toBe('Bali-Trips-Invoice-BT-INV-2026-00042.pdf')
    expect(invoiceFilename('a/b c')).toBe('Bali-Trips-Invoice-a-b-c.pdf')
  })
})

/* ---------------- Timing ---------------- */

describe('invoiceStep (wait for the PDF, then give up)', () => {
  const since = new Date('2026-11-24T10:00:00Z')
  const at = (ms: number) => new Date(since.getTime() + ms)
  const ready: InvoiceState = { expected: true, invoiceNumber: 'N', rendered: true, bytes: 40_000 }
  const pending: InvoiceState = { ...ready, rendered: false, bytes: null }
  const max = WHATSAPP_DOCUMENT_MAX_BYTES

  it('attaches a rendered PDF, even late', () => {
    expect(invoiceStep(ready, since, at(1000), max)).toEqual({ action: 'attach' })
    expect(invoiceStep(ready, since, at(INVOICE_WAIT_MS * 3), max)).toEqual({ action: 'attach' })
  })

  it('waits while the PDF renders, up to the bound', () => {
    expect(invoiceStep(pending, since, at(0), max)).toEqual({
      action: 'wait',
      afterSeconds: INVOICE_POLL_SECONDS,
    })
    expect(invoiceStep(pending, since, at(INVOICE_WAIT_MS - 1), max).action).toBe('wait')
    expect(invoiceStep(pending, since, at(INVOICE_WAIT_MS), max)).toEqual({
      action: 'without',
      reason: 'timeout',
    })
  })

  it('sends without it when there is no invoice or it is too large', () => {
    expect(
      invoiceStep(
        { expected: false, invoiceNumber: null, rendered: false, bytes: null },
        since,
        since,
        max,
      ),
    ).toEqual({ action: 'without', reason: 'no_invoice' })
    expect(invoiceStep({ ...ready, bytes: max + 1 }, since, since, max)).toEqual({
      action: 'without',
      reason: 'too_large',
    })
  })
})

/* ---------------- The delivery job ---------------- */

const { deliverWhatsappMessage, planPaymentMessage } = await import('./dispatch')

describe('planPaymentMessage', () => {
  it('one of the two messages, never both', () => {
    expect(
      planPaymentMessage({ invoiceUsable: true, plainOn: true, step: { action: 'attach' } }),
    ).toEqual({ kind: 'invoice' })
    expect(
      planPaymentMessage({
        invoiceUsable: true,
        plainOn: true,
        step: { action: 'without', reason: 'timeout' },
      }),
    ).toEqual({ kind: 'plain', reason: 'timeout' })
    expect(planPaymentMessage({ invoiceUsable: false, plainOn: true, step: null }).kind).toBe(
      'plain',
    )
    expect(
      planPaymentMessage({
        invoiceUsable: true,
        plainOn: false,
        step: { action: 'without', reason: 'too_large' },
      }),
    ).toEqual({ kind: 'skip', reason: 'payment_success_off:too_large' })
  })
})

describe('deliverWhatsappMessage — payment message', () => {
  const created = new Date('2026-11-24T10:00:00Z')

  function settings(withInvoiceTemplate = true) {
    return {
      enabled: true,
      provider: 'mazbot',
      apiUrl: '',
      loginEmail: '',
      senderNumber: '',
      staffAlertNumber: '',
      incompleteAfterMinutes: 60,
      automations: {
        payment_success: {
          enabled: true,
          texts: { en: '', ar: '', id: '' },
          templates: { en: '11', ar: '', id: '' },
        },
        payment_invoice: {
          enabled: true,
          texts: { en: '', ar: '', id: '' },
          templates: { en: withInvoiceTemplate ? '12' : '', ar: '', id: '' },
        },
      },
    }
  }

  let calls: { url: string; init: RequestInit }[]

  beforeEach(() => {
    resetMazbotToken()
    calls = []
    state.updates = []
    state.settings = settings()
    state.file = { ...pdf, invoiceNumber: 'BT-INV-2026-00042' }
    state.invoice = {
      expected: true,
      invoiceNumber: 'BT-INV-2026-00042',
      rendered: true,
      bytes: 13,
      invoicedAt: created,
    }
    state.row = {
      id: 'm1',
      automation: 'payment_success',
      dedupeKey: 'payment_success:o1',
      orderId: 'o1',
      userId: null,
      toPhone: '62812',
      locale: 'en',
      vars: { name: 'Ahmed', amount: 'SAR 1,000', order: 'BT-1001', invoice: 'BT-INV-2026-00042' },
      body: 'Hello Ahmed',
      status: 'queued',
      attempts: 0,
      createdAt: created,
      updatedAt: created,
    }
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({ url: String(url), init: init ?? {} })
        if (String(url).endsWith('/login')) return json({ data: { token: 'jwt' } })
        return json({ success: true, message_id: 5 })
      }),
    )
  })

  it('PDF ready: sends payment_invoice with the document, once', async () => {
    const requeue = vi.fn()
    await deliverWhatsappMessage('m1', { requeue, now: () => new Date(created.getTime() + 20_000) })
    const send = calls.filter((c) => c.url.endsWith('/send-template'))
    expect(send).toHaveLength(1)
    const form = send[0]!.init.body as FormData
    expect(form.get('template_id')).toBe('12')
    expect(form.get('body_values[4]')).toBe('BT-INV-2026-00042')
    expect((form.get('document') as File).name).toBe(pdf.filename)
    expect(state.row?.status).toBe('sent')
    expect(state.row?.automation).toBe('payment_invoice')
    expect(requeue).not.toHaveBeenCalled()

    // A second job for the same row (sweep, Studio retry) sends nothing more.
    await deliverWhatsappMessage('m1', { requeue })
    expect(calls.filter((c) => c.url.endsWith('/send-template'))).toHaveLength(1)
  })

  it('PDF not rendered yet: queues the render, waits, sends nothing', async () => {
    state.invoice = {
      expected: true,
      invoiceNumber: 'N',
      rendered: false,
      bytes: null,
      invoicedAt: created,
    }
    const requeue = vi.fn(async () => 'job-2')
    const renderInvoice = vi.fn(async () => 'pdf-job')
    await deliverWhatsappMessage('m1', {
      requeue,
      renderInvoice,
      now: () => new Date(created.getTime() + 60_000),
    })
    expect(calls).toHaveLength(0)
    expect(requeue).toHaveBeenCalledWith('m1', INVOICE_POLL_SECONDS)
    expect(renderInvoice).toHaveBeenCalledWith('o1')
    expect(state.row?.status).toBe('queued')
  })

  it('a wait that cannot be re-queued throws (pg-boss retries) instead of losing the message', async () => {
    state.invoice = {
      expected: true,
      invoiceNumber: 'N',
      rendered: false,
      bytes: null,
      invoicedAt: created,
    }
    await expect(
      deliverWhatsappMessage('m1', {
        requeue: async () => null,
        renderInvoice: async () => null,
        now: () => created,
      }),
    ).rejects.toThrow(/re-queue/)
    expect(calls).toHaveLength(0)
  })

  it('still not ready after 10 minutes: sends payment_success without a document', async () => {
    state.invoice = {
      expected: true,
      invoiceNumber: 'N',
      rendered: false,
      bytes: null,
      invoicedAt: created,
    }
    const requeue = vi.fn()
    await deliverWhatsappMessage('m1', {
      requeue,
      now: () => new Date(created.getTime() + INVOICE_WAIT_MS + 1),
    })
    const send = calls.filter((c) => c.url.endsWith('/send-template'))
    expect(send).toHaveLength(1)
    expect(typeof send[0]!.init.body).toBe('string')
    expect(JSON.parse(send[0]!.init.body as string).template_id).toBe(11)
    expect(state.row?.automation).toBe('payment_success')
    expect(state.row?.status).toBe('sent')
    expect(requeue).not.toHaveBeenCalled()
  })

  it('no approved invoice template for the language: payment_success right away, no wait', async () => {
    state.settings = settings(false)
    state.invoice = {
      expected: true,
      invoiceNumber: 'N',
      rendered: false,
      bytes: null,
      invoicedAt: created,
    }
    const requeue = vi.fn()
    await deliverWhatsappMessage('m1', { requeue, now: () => created })
    expect(requeue).not.toHaveBeenCalled()
    const send = calls.filter((c) => c.url.endsWith('/send-template'))
    expect(JSON.parse(send[0]!.init.body as string).template_id).toBe(11)
  })

  it('a held card (no invoice yet) gets payment_success immediately', async () => {
    state.invoice = {
      expected: false,
      invoiceNumber: null,
      rendered: false,
      bytes: null,
      invoicedAt: null,
    }
    await deliverWhatsappMessage('m1', { requeue: vi.fn(), now: () => created })
    const send = calls.filter((c) => c.url.endsWith('/send-template'))
    expect(JSON.parse(send[0]!.init.body as string).template_id).toBe(11)
  })

  it('PDF over 5 MB: payment_success without it', async () => {
    state.invoice = {
      expected: true,
      invoiceNumber: 'N',
      rendered: true,
      bytes: WHATSAPP_DOCUMENT_MAX_BYTES + 1,
      invoicedAt: created,
    }
    await deliverWhatsappMessage('m1', { requeue: vi.fn(), now: () => created })
    const send = calls.filter((c) => c.url.endsWith('/send-template'))
    expect(JSON.parse(send[0]!.init.body as string).template_id).toBe(11)
  })

  it('an opted-out / skipped row is never sent', async () => {
    state.row = { ...state.row!, status: 'skipped', error: 'opted_out' }
    await deliverWhatsappMessage('m1', { requeue: vi.fn() })
    expect(calls).toHaveLength(0)
  })
})
