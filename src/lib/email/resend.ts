/**
 * Resend transport.
 *
 * Called over its REST API rather than through the SDK: one `fetch` against a
 * documented endpoint costs nothing in the bundle and keeps the dependency
 * list honest. The SDK's only real value here would be typed errors, and the
 * error shape is two fields.
 *
 * DELIVERABILITY, which is not a code problem but will look like one:
 * `EMAIL_FROM` must live on a dedicated sending subdomain with SPF, DKIM and
 * DMARC published and a valid PTR record. Since the 2025 tightening at the
 * large mailbox providers, mail without all of them is rejected outright at
 * any volume — not filed to spam, rejected. If confirmations stop arriving,
 * check DNS before checking this file.
 */

import type { EmailMessage, EmailTransport, SendResult } from './types'

const RESEND_ENDPOINT = 'https://api.resend.com/emails'

/** Matches the `EMAIL_FROM` shape documented in .env.example. */
const DEFAULT_FROM = 'Bali Trips <no-reply@localhost>'

interface ResendResponse {
  id?: string
  message?: string
  name?: string
}

export class ResendTransport implements EmailTransport {
  readonly name = 'resend'

  constructor(
    private readonly apiKey: string,
    private readonly from: string = process.env.EMAIL_FROM ?? DEFAULT_FROM,
    private readonly timeoutMs = 15_000,
  ) {}

  async send(message: EmailMessage): Promise<SendResult> {
    const body: Record<string, unknown> = {
      from: this.from,
      to: [message.to],
      subject: message.subject,
      html: message.html,
      text: message.text,
    }

    if (message.replyTo !== undefined) body.reply_to = message.replyTo

    if (message.attachments !== undefined && message.attachments.length > 0) {
      body.attachments = message.attachments.map((attachment) => ({
        filename: attachment.filename,
        content: Buffer.from(attachment.content).toString('base64'),
        ...(attachment.contentType === undefined ? {} : { content_type: attachment.contentType }),
      }))
    }

    let response: Response
    try {
      response = await fetch(RESEND_ENDPOINT, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      })
    } catch (error) {
      return { id: null, delivered: false, error: `transport: ${String(error)}` }
    }

    const payload = (await response.json().catch(() => ({}))) as ResendResponse

    if (!response.ok) {
      return {
        id: null,
        delivered: false,
        error: `${response.status} ${payload.name ?? ''} ${payload.message ?? ''}`.trim(),
      }
    }

    return { id: payload.id ?? null, delivered: true }
  }
}
