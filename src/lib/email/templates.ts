/**
 * The transactional templates.
 *
 * Pure functions: locale plus data in, `{ subject, html, text }` out. No
 * database, no environment, no transport. That is what makes them testable
 * and what lets the worker render an Arabic order confirmation while the
 * request that triggered it was in English.
 *
 * Copy comes from the shared catalogue in `messages/*.json`, never from a
 * string literal in this file — the same rule the UI follows. Money is
 * formatted with `formatMoney`, which derives the minor-unit exponent from
 * the currency instead of assuming 100.
 */

import { formatMoney } from '@/lib/money'
import type { Locale } from '@/i18n/config'

import { formatInstant, formatPlainDate, translator } from './catalogue'
import { renderDocument, type Block, type LineItemRow } from './render'
import type { RenderedEmail } from './types'

/* --------------------------------------------------------------------------
   Shared pieces
   -------------------------------------------------------------------------- */

function greeting(locale: Locale, name: string | null): Block {
  const t = translator(locale)
  const trimmed = name?.trim() ?? ''
  return {
    kind: 'text',
    text: trimmed === '' ? t('mail_hello_plain') : t('mail_hello', { name: trimmed }),
  }
}

function footer(locale: Locale): string[] {
  const t = translator(locale)
  return [t('mail_footer_reply'), t('mail_footer_why')]
}

/* --------------------------------------------------------------------------
   Welcome / verify
   -------------------------------------------------------------------------- */

export interface WelcomeEmailInput {
  locale: Locale
  name: string | null
  /**
   * Better Auth's verification callback. Absent when verification is not
   * required — the account is already usable, so the mail becomes a plain
   * welcome rather than a dead "confirm" button.
   */
  verifyUrl?: string
  /** Where "start planning" goes. */
  siteUrl: string
}

export function renderWelcomeEmail(input: WelcomeEmailInput): RenderedEmail {
  const { locale } = input
  const t = translator(locale)

  const blocks: Block[] = [
    { kind: 'heading', text: t('mail_welcome_t') },
    greeting(locale, input.name),
  ]

  if (input.verifyUrl === undefined) {
    blocks.push(
      { kind: 'text', text: t('mail_welcome_ready_b') },
      { kind: 'button', label: t('mail_welcome_ready_cta'), href: input.siteUrl },
    )
  } else {
    blocks.push(
      { kind: 'text', text: t('mail_welcome_verify_b') },
      { kind: 'button', label: t('mail_welcome_verify_cta'), href: input.verifyUrl },
      { kind: 'muted', text: t('mail_welcome_ignore') },
    )
  }

  const { html, text } = renderDocument({
    locale,
    preheader: t('mail_welcome_subject'),
    blocks,
    footer: footer(locale),
  })

  return { subject: t('mail_welcome_subject'), html, text }
}

/* --------------------------------------------------------------------------
   Password reset
   -------------------------------------------------------------------------- */

export interface PasswordResetEmailInput {
  locale: Locale
  name: string | null
  /** Better Auth's one-shot callback, which expires in an hour. */
  url: string
}

export function renderPasswordResetEmail(input: PasswordResetEmailInput): RenderedEmail {
  const { locale } = input
  const t = translator(locale)

  const { html, text } = renderDocument({
    locale,
    preheader: t('auth_forgot_t'),
    blocks: [
      { kind: 'heading', text: t('auth_forgot_t') },
      greeting(locale, input.name),
      { kind: 'text', text: t('auth_mail_reset_body') },
      { kind: 'button', label: t('auth_reset_btn'), href: input.url },
      { kind: 'muted', text: t('auth_mail_ignore') },
    ],
    footer: footer(locale),
  })

  return { subject: t('auth_forgot_t'), html, text }
}

/* --------------------------------------------------------------------------
   Order confirmation
   -------------------------------------------------------------------------- */

export interface OrderEmailLine {
  /** Already resolved from the immutable `name_snapshot`. */
  name: string
  quantity: number
  lineTotalMinor: number
  travelDate: string | null
  guests: number | null
}

export interface OrderConfirmationEmailInput {
  locale: Locale
  name: string | null
  orderNumber: string
  placedAt: Date
  currency: string
  subtotalMinor: number
  totalMinor: number
  lines: readonly OrderEmailLine[]
  /** Deep link to the booking in the customer's account. */
  orderUrl: string
}

export function renderOrderConfirmationEmail(input: OrderConfirmationEmailInput): RenderedEmail {
  const { locale, currency } = input
  const t = translator(locale)

  const rows: LineItemRow[] = input.lines.map((line) => {
    const details: string[] = []
    if (line.travelDate !== null) {
      details.push(`${t('mail_order_travel')}: ${formatPlainDate(line.travelDate, locale)}`)
    }
    if (line.guests !== null) {
      details.push(`${t('c_guests')}: ${new Intl.NumberFormat(locale).format(line.guests)}`)
    }

    return {
      name: line.name,
      ...(details.length > 0 ? { detail: details.join(' · ') } : {}),
      quantity: new Intl.NumberFormat(locale).format(line.quantity),
      amount: formatMoney(line.lineTotalMinor, currency, locale),
    }
  })

  // A subtotal identical to the total is noise, not information.
  const totals =
    input.subtotalMinor === input.totalMinor
      ? [{ label: t('c_total'), value: formatMoney(input.totalMinor, currency, locale) }]
      : [
          { label: t('cart_total'), value: formatMoney(input.subtotalMinor, currency, locale) },
          { label: t('c_total'), value: formatMoney(input.totalMinor, currency, locale) },
        ]

  const { html, text } = renderDocument({
    locale,
    preheader: t('mail_order_subject', { orderNumber: input.orderNumber }),
    blocks: [
      { kind: 'heading', text: t('cf_t_paid') },
      greeting(locale, input.name),
      { kind: 'text', text: t('mail_order_b') },
      {
        kind: 'facts',
        rows: [
          { label: t('cf_order'), value: input.orderNumber },
          { label: t('mail_order_placed'), value: formatInstant(input.placedAt, locale) },
        ],
      },
      { kind: 'heading', text: t('cf_items') },
      {
        kind: 'items',
        columns: {
          item: t('mail_col_item'),
          quantity: t('cart_qty'),
          amount: t('cart_total'),
        },
        rows,
        totals,
      },
      { kind: 'button', label: t('mail_order_cta'), href: input.orderUrl },
      { kind: 'muted', text: t('mail_order_next') },
    ],
    footer: footer(locale),
  })

  return {
    subject: t('mail_order_subject', { orderNumber: input.orderNumber }),
    html,
    text,
  }
}

/* --------------------------------------------------------------------------
   Refund notice
   -------------------------------------------------------------------------- */

export interface RefundNoticeEmailInput {
  locale: Locale
  name: string | null
  orderNumber: string
  currency: string
  refundedMinor: number
  /** Total refunded so far equals the order total. */
  isFull: boolean
  issuedAt: Date
  orderUrl: string
}

export function renderRefundNoticeEmail(input: RefundNoticeEmailInput): RenderedEmail {
  const { locale, currency } = input
  const t = translator(locale)
  const amount = formatMoney(input.refundedMinor, currency, locale)

  const { html, text } = renderDocument({
    locale,
    preheader: t('mail_refund_subject', { orderNumber: input.orderNumber }),
    blocks: [
      { kind: 'heading', text: t('mail_refund_t') },
      greeting(locale, input.name),
      { kind: 'text', text: t('mail_refund_b', { amount, orderNumber: input.orderNumber }) },
      {
        kind: 'facts',
        rows: [
          { label: t('cf_order'), value: input.orderNumber },
          { label: t('mail_refund_amount'), value: amount },
          { label: t('acct_inv_date'), value: formatInstant(input.issuedAt, locale) },
        ],
      },
      { kind: 'text', text: input.isFull ? t('mail_refund_full') : t('mail_refund_partial') },
      { kind: 'muted', text: t('mail_refund_timing') },
      { kind: 'button', label: t('mail_order_cta'), href: input.orderUrl },
    ],
    footer: footer(locale),
  })

  return {
    subject: t('mail_refund_subject', { orderNumber: input.orderNumber }),
    html,
    text,
  }
}

/* --------------------------------------------------------------------------
   Generic notification (src/lib/notify)
   -------------------------------------------------------------------------- */

export interface NotificationEmailInput {
  locale: Locale
  name: string | null
  /** A notification type; its copy is `notif_<type>_t` / `notif_<type>_b`. */
  type: string
  params: Record<string, string | number>
  /** Absolute URL for the button, or null for no button. */
  url: string | null
}

/**
 * One template for every notification type, so adding a type is two message
 * keys rather than a new renderer. Keys are dynamic, hence the loose lookup;
 * a missing key falls back to the generic copy instead of throwing.
 */
export function renderNotificationEmail(input: NotificationEmailInput): RenderedEmail {
  const { locale } = input
  const t = translator(locale) as unknown as {
    (key: string, params?: Record<string, string | number>): string
    has?: (key: string) => boolean
  }
  const safe = (key: string, fallback: string) => {
    try {
      const value = t(key, input.params)
      return value === key || value.endsWith(`.${key}`) ? t(fallback) : value
    } catch {
      return t(fallback)
    }
  }
  const title = safe(`notif_${input.type}_t`, 'notif_generic_t')
  const body = safe(`notif_${input.type}_b`, 'notif_generic_b')

  const blocks: Block[] = [
    { kind: 'heading', text: title },
    greeting(locale, input.name),
    { kind: 'text', text: body },
  ]
  if (input.url !== null) blocks.push({ kind: 'button', label: t('notif_open'), href: input.url })

  const { html, text } = renderDocument({
    locale,
    preheader: title,
    blocks,
    footer: footer(locale),
  })
  return { subject: title, html, text }
}
