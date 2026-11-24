/**
 * WhatsApp providers behind one interface: Mazbot (mazbot.net, the client's
 * provider) and Meta's Cloud API (the original integration in
 * `src/lib/notify/whatsapp.ts`, kept as is for account notifications).
 *
 * A message is either an approved template (business-initiated messages
 * outside WhatsApp's 24-hour window MUST be templates) with its parameters,
 * or plain text (only delivered inside the 24-hour window).
 */

import type { Locale } from '@/i18n/config'

import type { ResolvedCredentials } from './settings'

export interface OutgoingMessage {
  /** E.164 digits, no '+'. */
  to: string
  text: string
  locale: Locale
  /** Mazbot template id, or Meta template name. Null = plain text. */
  template: string | null
  params: string[]
  /**
   * A PDF for the template's DOCUMENT header (the invoice). Only with a
   * template that HAS such a header: WhatsApp rejects a header parameter the
   * template does not declare, and a declared one that is missing.
   */
  document?: OutgoingDocument | null
}

export interface OutgoingDocument {
  bytes: Uint8Array
  /** What the customer sees, e.g. `Bali-Trips-Invoice-BT-INV-2026-00042.pdf`. */
  filename: string
}

function pdfBlob(document: OutgoingDocument): Blob {
  return new Blob([new Uint8Array(document.bytes)], { type: 'application/pdf' })
}

export type SendResult =
  { ok: true; messageId: string | null } | { ok: false; retryable: boolean; error: string }

export interface WhatsappProvider {
  readonly name: string
  send(message: OutgoingMessage): Promise<SendResult>
}

type Fetch = typeof fetch

function retryableStatus(status: number): boolean {
  return status === 429 || status >= 500
}

/* ---------------- Mazbot ---------------- */

/**
 * Mazbot (https://api.mazbot.net): every request carries the `apikey`
 * header; the messaging routes also need `Authorization: Bearer <jwt>` from
 * `POST /login` (a client-staff account; tokens last ~60 min, no refresh).
 * Numbers are digits with the country code and no '+'. Business rules can
 * fail with HTTP 200 and `success: false`, so the body is always checked.
 */
let cachedToken: { key: string; token: string; until: number } | null = null

export function resetMazbotToken(): void {
  cachedToken = null
}

function pickToken(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null
  const b = body as Record<string, unknown>
  for (const source of [b, b.data as Record<string, unknown> | undefined]) {
    if (!source || typeof source !== 'object') continue
    for (const field of ['token', 'access_token', 'jwt']) {
      const value = (source as Record<string, unknown>)[field]
      if (typeof value === 'string' && value !== '') return value
    }
  }
  return null
}

function bodyError(body: unknown, fallback: string): string {
  if (body && typeof body === 'object') {
    const b = body as Record<string, unknown>
    const message = b.message ?? b.error
    if (typeof message === 'string' && message !== '') return message.slice(0, 300)
  }
  return fallback
}

export function mazbotTemplatePayload(message: OutgoingMessage) {
  const matchs: Record<string, string> = {}
  const values: Record<string, string> = {}
  message.params.forEach((value, index) => {
    matchs[String(index + 1)] = 'input_value'
    values[String(index + 1)] = value
  })
  return {
    template_id: Number(message.template),
    mobile: message.to,
    ...(message.params.length > 0 ? { body_matchs: matchs, body_values: values } : {}),
  }
}

/**
 * The same request as multipart/form-data, for a template with a header file
 * (Mazbot: `document` = header PDF, max 5 MB; arrays in bracket notation,
 * 1-based: `body_matchs[1]=input_value`, `body_values[1]=…`). Mazbot has no
 * filename field — the customer sees the uploaded file's own name.
 */
export function mazbotTemplateForm(message: OutgoingMessage & { document: OutgoingDocument }) {
  const form = new FormData()
  form.append('template_id', String(Number(message.template)))
  form.append('mobile', message.to)
  message.params.forEach((value, index) => {
    form.append(`body_matchs[${index + 1}]`, 'input_value')
    form.append(`body_values[${index + 1}]`, value)
  })
  form.append('document', pdfBlob(message.document), message.document.filename)
  return form
}

export function createMazbotProvider(
  creds: ResolvedCredentials,
  fetchImpl: Fetch = fetch,
): WhatsappProvider {
  const base = creds.apiUrl
  const apiKey = creds.apiKey ?? ''

  async function login(): Promise<string | null> {
    if (!creds.loginEmail || !creds.password) return null
    const cacheKey = `${base}|${creds.loginEmail}`
    if (cachedToken && cachedToken.key === cacheKey && cachedToken.until > Date.now()) {
      return cachedToken.token
    }
    const response = await fetchImpl(`${base}/login`, {
      method: 'POST',
      headers: { apikey: apiKey, Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: creds.loginEmail, password: creds.password }),
    })
    const body: unknown = await response.json().catch(() => null)
    const token = response.ok ? pickToken(body) : null
    if (!token) throw new LoginError(bodyError(body, `Mazbot login HTTP ${response.status}`))
    cachedToken = { key: cacheKey, token, until: Date.now() + 50 * 60 * 1000 }
    return token
  }

  /** JSON, or multipart when a header file is sent (fetch sets the boundary). */
  async function post(
    path: string,
    payload: object | FormData,
    retried = false,
  ): Promise<SendResult> {
    let token: string | null
    try {
      token = await login()
    } catch (error) {
      return { ok: false, retryable: false, error: (error as Error).message }
    }
    const multipart = payload instanceof FormData
    const headers: Record<string, string> = {
      apikey: apiKey,
      Accept: 'application/json',
      ...(multipart ? {} : { 'Content-Type': 'application/json' }),
    }
    if (token) headers.Authorization = `Bearer ${token}`
    let response: Response
    try {
      response = await fetchImpl(`${base}${path}`, {
        method: 'POST',
        headers,
        body: multipart ? payload : JSON.stringify(payload),
        // Mazbot may wait ~60 s for WhatsApp's answer.
        signal: AbortSignal.timeout(65_000),
      })
    } catch (error) {
      return { ok: false, retryable: true, error: `Mazbot unreachable: ${String(error)}` }
    }
    const body: unknown = await response.json().catch(() => null)
    if (response.status === 401 && token && !retried) {
      resetMazbotToken()
      return post(path, payload, true)
    }
    const success =
      response.ok &&
      !(body && typeof body === 'object' && (body as { success?: unknown }).success === false)
    if (!success) {
      return {
        ok: false,
        retryable: retryableStatus(response.status),
        error: bodyError(body, `Mazbot HTTP ${response.status}`),
      }
    }
    const b = (body ?? {}) as Record<string, unknown>
    const data = (b.data ?? {}) as Record<string, unknown>
    const id = b.message_id ?? data.message_id ?? data.conversation_id ?? null
    return { ok: true, messageId: id === null ? null : String(id) }
  }

  return {
    name: 'mazbot',
    async send(message) {
      if (!apiKey) return { ok: false, retryable: false, error: 'Mazbot API key is not set' }
      if (message.template !== null) {
        if (!/^\d+$/.test(message.template)) {
          return { ok: false, retryable: false, error: 'Mazbot template id must be a number' }
        }
        if (message.document) {
          return post(
            '/whatsapp/send-template',
            mazbotTemplateForm({ ...message, document: message.document }),
          )
        }
        return post('/whatsapp/send-template', mazbotTemplatePayload(message))
      }
      if (message.document) {
        return { ok: false, retryable: false, error: 'A document needs an approved template' }
      }
      return post('/send-message', { mobile: message.to, message: message.text })
    },
  }
}

class LoginError extends Error {
  override name = 'LoginError'
}

/* ---------------- Meta Cloud API ---------------- */

const GRAPH = 'https://graph.facebook.com/v20.0'

/** The template message; `mediaId` = an uploaded header document. */
export function metaTemplatePayload(
  message: OutgoingMessage,
  media: { id: string; filename: string } | null = null,
) {
  if (message.template === null) {
    return {
      messaging_product: 'whatsapp',
      to: message.to,
      type: 'text',
      text: { body: message.text },
    }
  }
  return {
    messaging_product: 'whatsapp',
    to: message.to,
    type: 'template',
    template: {
      name: message.template,
      language: { code: message.locale },
      components: [
        ...(media === null
          ? []
          : [
              {
                type: 'header',
                parameters: [
                  { type: 'document', document: { id: media.id, filename: media.filename } },
                ],
              },
            ]),
        {
          type: 'body',
          parameters: message.params.map((text) => ({ type: 'text', text })),
        },
      ],
    },
  }
}

/** `POST /{phone-number-id}/media` (multipart): the PDF, for a header document. */
export function metaMediaForm(document: OutgoingDocument): FormData {
  const form = new FormData()
  form.append('messaging_product', 'whatsapp')
  form.append('type', 'application/pdf')
  form.append('file', pdfBlob(document), document.filename)
  return form
}

export function createMetaProvider(
  creds: ResolvedCredentials,
  fetchImpl: Fetch = fetch,
): WhatsappProvider {
  const token = process.env.WHATSAPP_TOKEN?.trim() || creds.apiKey || ''
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() || creds.senderNumber || ''

  async function upload(
    document: OutgoingDocument,
  ): Promise<{ ok: true; id: string } | { ok: false; retryable: boolean; error: string }> {
    const response = await fetchImpl(`${GRAPH}/${encodeURIComponent(phoneNumberId)}/media`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: metaMediaForm(document),
    })
    const body = (await response.json().catch(() => ({}))) as {
      id?: string
      error?: { message?: string }
    }
    if (!response.ok || typeof body.id !== 'string' || body.id === '') {
      return {
        ok: false,
        retryable: retryableStatus(response.status),
        error: `Meta media upload: ${body.error?.message ?? `HTTP ${response.status}`}`,
      }
    }
    return { ok: true, id: body.id }
  }

  return {
    name: 'meta',
    async send(message) {
      if (!token || !phoneNumberId) {
        return { ok: false, retryable: false, error: 'Meta token / phone number id not set' }
      }
      let media: { id: string; filename: string } | null = null
      if (message.document) {
        if (message.template === null) {
          return { ok: false, retryable: false, error: 'A document needs an approved template' }
        }
        const uploaded = await upload(message.document)
        if (!uploaded.ok) return uploaded
        media = { id: uploaded.id, filename: message.document.filename }
      }
      const response = await fetchImpl(`${GRAPH}/${encodeURIComponent(phoneNumberId)}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(metaTemplatePayload(message, media)),
      })
      const body = (await response.json().catch(() => ({}))) as {
        messages?: { id?: string }[]
        error?: { message?: string }
      }
      if (!response.ok) {
        return {
          ok: false,
          retryable: retryableStatus(response.status),
          error: body.error?.message ?? `Meta HTTP ${response.status}`,
        }
      }
      return { ok: true, messageId: body.messages?.[0]?.id ?? null }
    },
  }
}

export function createProvider(creds: ResolvedCredentials, fetchImpl: Fetch = fetch) {
  return creds.provider === 'meta'
    ? createMetaProvider(creds, fetchImpl)
    : createMazbotProvider(creds, fetchImpl)
}
