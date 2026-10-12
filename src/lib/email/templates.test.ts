import { describe, expect, it } from 'vitest'

import { formatMoney } from '@/lib/money'

import { escapeHtml } from './render'
import {
  renderOrderConfirmationEmail,
  renderPasswordResetEmail,
  renderRefundNoticeEmail,
  renderWelcomeEmail,
} from './templates'

const ORDER = {
  name: 'Layla',
  orderNumber: 'BT-2026-0184',
  placedAt: new Date('2026-03-04T09:00:00Z'),
  currency: 'USD',
  subtotalMinor: 24_000,
  totalMinor: 24_000,
  orderUrl: 'https://balitrips.example/account/orders/1',
  lines: [
    {
      name: 'Mount Batur sunrise trek',
      quantity: 2,
      lineTotalMinor: 24_000,
      travelDate: '2026-08-12',
      guests: 2,
    },
  ],
}

describe('RTL safety', () => {
  it('marks Arabic mail rtl on the document AND the container', () => {
    const { html } = renderWelcomeEmail({
      locale: 'ar',
      name: 'ليلى',
      siteUrl: 'https://balitrips.example',
    })

    expect(html).toContain('<html lang="ar" dir="rtl">')
    // Gmail's web view rehosts the body and drops <html dir>, so the tables
    // have to carry it too.
    expect(html.match(/dir="rtl"/g)?.length).toBeGreaterThan(2)
    expect(html).not.toContain('dir="ltr"')
  })

  it('emits a physical fallback before the logical keyword', () => {
    const arabic = renderWelcomeEmail({
      locale: 'ar',
      name: null,
      siteUrl: 'https://balitrips.example',
    }).html
    const english = renderWelcomeEmail({
      locale: 'en',
      name: null,
      siteUrl: 'https://balitrips.example',
    }).html

    // Outlook ignores `start` and would left-align the whole Arabic email if
    // the physical value were not there — and computed from the same dir.
    expect(arabic).toContain('text-align:right;text-align:start')
    expect(arabic).not.toContain('text-align:left;text-align:start')
    expect(english).toContain('text-align:left;text-align:start')
  })

  it('keeps Indonesian and English ltr', () => {
    for (const locale of ['en', 'id'] as const) {
      const { html } = renderWelcomeEmail({ locale, name: null, siteUrl: 'https://x.example' })
      expect(html).toContain(`<html lang="${locale}" dir="ltr">`)
      expect(html).not.toContain('dir="rtl"')
    }
  })
})

describe('escaping', () => {
  it('escapes names and URLs at the point of interpolation', () => {
    const { html } = renderPasswordResetEmail({
      locale: 'en',
      name: '<script>alert(1)</script>',
      url: 'https://balitrips.example/reset?token=a&b="c"',
    })

    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('token=a&amp;b=&quot;c&quot;')
  })
})

describe('order confirmation', () => {
  it('lists every line with its money and travel date', () => {
    const { subject, html, text } = renderOrderConfirmationEmail({ locale: 'en', ...ORDER })

    expect(subject).toContain('BT-2026-0184')
    expect(html).toContain('Mount Batur sunrise trek')
    expect(html).toContain('$240.00')
    // Plain date formatted in UTC: the vitest TZ is America/New_York, and a
    // naive parse there renders 11 August for a 12 August booking.
    expect(html).toContain('August 12, 2026')
    // The text part is built from the same blocks, so it cannot drift.
    expect(text).toContain('Mount Batur sunrise trek')
    expect(text).toContain('$240.00')
    expect(text).toContain(ORDER.orderUrl)
  })

  it('shows one total when subtotal and total agree', () => {
    const { html } = renderOrderConfirmationEmail({ locale: 'en', ...ORDER })
    expect(html.match(/\$240\.00/g)?.length).toBe(2) // line + grand total
  })

  it('formats Arabic money exactly as the rest of the app does', () => {
    const { html } = renderOrderConfirmationEmail({ locale: 'ar', ...ORDER })
    expect(html).toContain('dir="rtl"')
    // Not a hard-coded string: the point is that mail and UI agree, whichever
    // numbering system and symbol placement the runtime's CLDR data picks.
    expect(html).toContain(escapeHtml(formatMoney(24_000, 'USD', 'ar')))
  })

  it('handles a zero-decimal currency without inventing cents', () => {
    const { html } = renderOrderConfirmationEmail({
      locale: 'en',
      ...ORDER,
      currency: 'JPY',
      subtotalMinor: 24_000,
      totalMinor: 24_000,
      lines: [{ ...ORDER.lines[0]!, lineTotalMinor: 24_000 }],
    })
    expect(html).toContain('¥24,000')
    expect(html).not.toContain('¥240.00')
  })
})

describe('refund notice', () => {
  it('says the booking is gone on a full refund and not on a partial one', () => {
    const base = {
      locale: 'en' as const,
      name: 'Layla',
      orderNumber: 'BT-2026-0184',
      currency: 'USD',
      refundedMinor: 12_000,
      issuedAt: new Date('2026-03-06T09:00:00Z'),
      orderUrl: 'https://balitrips.example/account/orders/1',
    }

    expect(renderRefundNoticeEmail({ ...base, isFull: true }).html).toContain('has been cancelled')
    expect(renderRefundNoticeEmail({ ...base, isFull: false }).html).toContain('partial refund')
  })
})

describe('welcome', () => {
  it('drops the confirm button when there is nothing to confirm', () => {
    const withVerify = renderWelcomeEmail({
      locale: 'en',
      name: null,
      siteUrl: 'https://x.example',
      verifyUrl: 'https://x.example/verify?token=1',
    })
    const without = renderWelcomeEmail({
      locale: 'en',
      name: null,
      siteUrl: 'https://x.example',
    })

    expect(withVerify.html).toContain('verify?token=1')
    expect(without.html).not.toContain('verify?token=1')
    expect(without.html).toContain('https://x.example')
  })
})
