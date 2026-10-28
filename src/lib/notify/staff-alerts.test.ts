import { describe, expect, it } from 'vitest'

import { isTeamWhatsappType, teamWhatsappText } from './staff-alerts'
import { STAFF_NOTIFICATION_TYPES } from './types'

describe('team WhatsApp alerts', () => {
  it('covers only real staff types, all with WhatsApp on', () => {
    for (const type of ['staff_order_authorized', 'staff_authorization_reminder'] as const) {
      expect(isTeamWhatsappType(type)).toBe(true)
      expect(STAFF_NOTIFICATION_TYPES[type]).toEqual({ email: true, whatsapp: true })
    }
    expect(isTeamWhatsappType('staff_order_paid')).toBe(false)
  })

  it('writes the booking alert with the order and the link', () => {
    const text = teamWhatsappText(
      'staff_order_authorized',
      { orderNumber: 'BT-1001', total: '$120.00' },
      'https://example.test/studio/orders/1',
    )
    expect(text).toContain('BT-1001')
    expect(text).toContain('$120.00')
    expect(text).toContain('6 أيام')
    expect(text.endsWith('https://example.test/studio/orders/1')).toBe(true)
  })

  it('writes the reminder with the hours left, and survives missing values', () => {
    expect(
      teamWhatsappText('staff_authorization_reminder', { orderNumber: 'X', hoursLeft: 47 }, null),
    ).toContain('47')
    expect(teamWhatsappText('staff_authorization_reminder', {}, null)).toContain('-')
  })
})
