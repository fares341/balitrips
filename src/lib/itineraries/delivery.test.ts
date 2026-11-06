import { describe, expect, it, vi } from 'vitest'

import { renderItineraryDeliveryEmail } from '@/lib/email/templates'

// Pure rules only: no database in the fast suite.
vi.mock('@/db', () => ({ db: {} }))

import { hashDownloadToken, newDownloadToken, TOKEN_PATTERN, tokenRefusal } from './download-tokens'

const now = new Date('2026-11-06T10:00:00Z')
const live = { expiresAt: new Date('2026-11-10T00:00:00Z'), revokedAt: null, uses: 0, maxUses: 5 }

describe('download token rules', () => {
  it('accepts a live token and names each refusal', () => {
    expect(tokenRefusal(live, now)).toBeNull()
    expect(tokenRefusal(null, now)).toBe('unknown')
    expect(tokenRefusal({ ...live, revokedAt: now }, now)).toBe('revoked')
    expect(tokenRefusal({ ...live, expiresAt: now }, now)).toBe('expired')
    expect(tokenRefusal({ ...live, uses: 5 }, now)).toBe('used_up')
  })

  it('tokens are 256-bit base64url and hashed under the server secret', () => {
    const token = newDownloadToken()
    expect(token).toMatch(TOKEN_PATTERN)
    expect(newDownloadToken()).not.toBe(token)
    const a = hashDownloadToken(token, 'secret-a')
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    // A hash made without the secret does not match: a forged row is useless.
    expect(hashDownloadToken(token, 'secret-b')).not.toBe(a)
  })
})

describe('delivery e-mail', () => {
  const base = {
    name: 'Sara',
    orderNumber: 'BT-1042',
    itineraryName: 'Ubud & Nusa Penida',
    days: 5,
    openUrl: 'https://balitrips.co/ar/account/schedules/x/view',
    pdfUrl: 'https://balitrips.co/ar/dl/abc',
    linkValidDays: 7,
    linkMaxUses: 5,
  }

  it.each(['ar', 'en', 'id'] as const)('renders in %s with both buttons', (locale) => {
    const mail = renderItineraryDeliveryEmail({ ...base, locale })
    expect(mail.subject).toContain('BT-1042')
    expect(mail.html).toContain(base.openUrl)
    expect(mail.html).toContain(base.pdfUrl)
    expect(mail.text).toContain(base.pdfUrl)
    expect(mail.html).toContain(locale === 'ar' ? 'dir="rtl"' : 'dir="ltr"')
  })

  it('without a link it still sends the account button', () => {
    const mail = renderItineraryDeliveryEmail({ ...base, locale: 'en', pdfUrl: null })
    expect(mail.html).toContain(base.openUrl)
    expect(mail.html).not.toContain('/dl/')
  })
})
