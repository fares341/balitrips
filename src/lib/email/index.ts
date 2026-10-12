/**
 * Outbound mail.
 *
 * One entry point, one transport interface, four localized templates. Anything
 * that sends mail — the auth callbacks, the worker's `email.send` queue, an
 * admin action — goes through `sendEmail` here and nothing reaches a provider
 * SDK directly.
 *
 * TRANSPORT SELECTION
 *
 *   EMAIL_TRANSPORT=resend|console   explicit, wins
 *   RESEND_API_KEY set               resend
 *   otherwise                        console
 *
 * The fallback is a refusal to guess. In production, a missing key means the
 * operator has misconfigured the deploy, and the console transport would
 * "succeed" forever while no customer ever receives a confirmation — so that
 * combination is logged as an error on every send rather than once at boot,
 * where it would scroll away.
 */

import { ConsoleTransport } from './console'
import { ResendTransport } from './resend'
import type { EmailMessage, EmailTransport, SendResult } from './types'

export * from './types'
export { CATALOGUE, toMailLocale, translator, type Catalogue } from './catalogue'
export { escapeHtml, renderDocument, type Block, type EmailDocument } from './render'
export {
  renderOrderConfirmationEmail,
  renderPasswordResetEmail,
  renderRefundNoticeEmail,
  renderWelcomeEmail,
  type OrderConfirmationEmailInput,
  type OrderEmailLine,
  type PasswordResetEmailInput,
  type RefundNoticeEmailInput,
  type WelcomeEmailInput,
  renderNotificationEmail,
  type NotificationEmailInput,
} from './templates'
export { ConsoleTransport } from './console'
export { ResendTransport } from './resend'

let override: EmailTransport | null = null
let cached: EmailTransport | null = null
let cacheKey: string | null = null

function selectTransport(): EmailTransport {
  const explicit = process.env.EMAIL_TRANSPORT?.trim().toLowerCase()
  const apiKey = process.env.RESEND_API_KEY?.trim()

  if (explicit === 'console') return new ConsoleTransport()

  if (explicit === 'resend' || (explicit === undefined && apiKey !== undefined && apiKey !== '')) {
    if (apiKey === undefined || apiKey === '') {
      throw new Error('EMAIL_TRANSPORT=resend but RESEND_API_KEY is not set')
    }
    return new ResendTransport(apiKey)
  }

  if (explicit !== undefined && explicit !== '') {
    throw new Error(`Unknown EMAIL_TRANSPORT "${explicit}". Use "resend" or "console".`)
  }

  return new ConsoleTransport()
}

/**
 * The configured transport.
 *
 * Environment is re-read rather than captured at module load, and the
 * instance is cached against the values it was built from — the worker and
 * the web app are long-lived processes, and a restart-free credential
 * rotation should not need a code change to take effect.
 */
export function getEmailTransport(): EmailTransport {
  if (override !== null) return override

  const key = `${process.env.EMAIL_TRANSPORT ?? ''}|${process.env.RESEND_API_KEY ?? ''}|${process.env.EMAIL_FROM ?? ''}`
  if (cached === null || cacheKey !== key) {
    cached = selectTransport()
    cacheKey = key
  }
  return cached
}

/** Test seam. Pass `null` to restore environment-based selection. */
export function __setEmailTransport(transport: EmailTransport | null): void {
  override = transport
  cached = null
  cacheKey = null
}

/**
 * Send one message.
 *
 * Resolves rather than throws, and reports what happened in the result.
 *
 * The auth endpoints need that: their response must not differ between "mail
 * sent" and "mail failed", because a difference tells an attacker whether an
 * address exists. The worker needs the opposite — it inspects `delivered` and
 * throws so pg-boss retries. Both are served by returning a value instead of
 * choosing for them.
 */
export async function sendEmail(message: EmailMessage): Promise<SendResult> {
  let transport: EmailTransport
  try {
    transport = getEmailTransport()
  } catch (error) {
    console.error('[email] transport is misconfigured', error)
    return { id: null, delivered: false, error: String(error) }
  }

  if (transport.name === 'console' && process.env.NODE_ENV === 'production') {
    // Loud, and on every send: this is silent data loss otherwise.
    console.error(
      '[email] no mail provider configured in production — message NOT sent. Set RESEND_API_KEY.',
      { to: message.to, subject: message.subject },
    )
  }

  const result = await transport.send(message)

  if (!result.delivered) {
    console.error('[email] send failed', {
      transport: transport.name,
      to: message.to,
      subject: message.subject,
      error: result.error,
    })
  }

  return result
}
