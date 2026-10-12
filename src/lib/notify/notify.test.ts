import { describe, expect, it } from 'vitest'

import ar from '../../../messages/ar.json'
import en from '../../../messages/en.json'
import id from '../../../messages/id.json'
import { renderNotificationEmail } from '@/lib/email'

import { STAFF_NOTIFICATION_TYPES, USER_NOTIFICATION_TYPES, WHATSAPP_PARAM_ORDER } from './types'
import { buildTemplatePayload, toWhatsappNumber } from './whatsapp'

const TYPES = [...Object.keys(USER_NOTIFICATION_TYPES), ...Object.keys(STAFF_NOTIFICATION_TYPES)]

describe('notification copy', () => {
  it.each([
    ['en', en],
    ['ar', ar],
    ['id', id],
  ])('every type has a title and a body in %s', (_locale, catalogue) => {
    const keys = catalogue as Record<string, string>
    for (const type of TYPES) {
      expect(keys[`notif_${type}_t`], `notif_${type}_t`).toBeTruthy()
      expect(keys[`notif_${type}_b`], `notif_${type}_b`).toBeTruthy()
    }
  })

  it('every WhatsApp parameter is used by the English body (template text matches)', () => {
    for (const [type, params] of Object.entries(WHATSAPP_PARAM_ORDER)) {
      const body = (en as Record<string, string>)[`notif_${type}_b`] ?? ''
      for (const param of params ?? []) expect(body, `${type}.${param}`).toContain(`{${param}}`)
    }
  })

  it('renders an email in Arabic with the parameters filled in', () => {
    const mail = renderNotificationEmail({
      locale: 'ar',
      name: 'سارة',
      type: 'order_paid',
      params: { orderNumber: 'BT-2026-0007' },
      url: 'https://bali.example/ar/account',
    })
    expect(mail.subject).toBe('تم استلام الدفع')
    expect(mail.text).toContain('BT-2026-0007')
    expect(mail.html).toContain('dir="rtl"')
  })

  it('falls back to generic copy for an unknown type instead of throwing', () => {
    const mail = renderNotificationEmail({
      locale: 'en',
      name: null,
      type: 'nope',
      params: {},
      url: null,
    })
    expect(mail.subject).toBe('You have a new notification')
  })
})

describe('WhatsApp', () => {
  it('only accepts international numbers', () => {
    expect(toWhatsappNumber('+966 50 123 4567')).toBe('966501234567')
    expect(toWhatsappNumber('00971501234567')).toBe('971501234567')
    expect(toWhatsappNumber('050 123 4567')).toBeNull() // no country code: refuse to guess
    expect(toWhatsappNumber('+12')).toBeNull()
    expect(toWhatsappNumber(null)).toBeNull()
  })

  it('builds a template message with ordered body parameters and the user language', () => {
    const payload = buildTemplatePayload(
      '966501234567',
      'plan_expiring',
      { plan: 'VIP', date: '2026-11-01' },
      'ar',
      'bali_',
    )
    expect(payload.template.name).toBe('bali_plan_expiring')
    expect(payload.template.language.code).toBe('ar')
    expect(payload.template.components[0]?.parameters.map((p) => p.text)).toEqual([
      'VIP',
      '2026-11-01',
    ])
  })
})
