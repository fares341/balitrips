import { describe, expect, it } from 'vitest'

import { skipReasonFor } from './automations'
import { inboundTexts, normaliseReply, parseStopCommand, stopConfirmation } from './stop'

describe('parseStopCommand', () => {
  it.each([
    'STOP',
    'stop',
    ' Stop! ',
    'unsubscribe',
    'إيقاف',
    'ايقاف',
    'إِيقَاف',
    'إلغاء',
    'الغاء',
    'الـغـاء',
    'توقف',
    'توقّف',
    'Stop 🛑',
  ])('%s → stop', (text) => {
    expect(parseStopCommand(text)).toBe('stop')
  })

  it.each(['START', 'start', 'اشتراك', 'إشتراك', ' Start. '])('%s → start', (text) => {
    expect(parseStopCommand(text)).toBe('start')
  })

  it.each([
    "don't stop the tour",
    'please stop sending',
    'hello',
    '',
    'stopwatch',
    'متى توقف الحافلة',
  ])('%s → nothing', (text) => {
    expect(parseStopCommand(text)).toBeNull()
  })

  it('normalises alef forms and diacritics', () => {
    expect(normaliseReply('إِلْغَاء')).toBe(normaliseReply('الغاء'))
  })

  it('confirms in the customer language', () => {
    expect(stopConfirmation('stop', 'ar')).toContain('اشتراك')
    expect(stopConfirmation('start', 'en')).toContain('STOP')
    expect(stopConfirmation('stop', 'xx')).toContain('START')
  })
})

describe('gating: an opted-out number gets nothing', () => {
  it('blocks marketing and transactional automations alike', () => {
    expect(skipReasonFor('lead_offer_code', { consent: true, optedOut: true }, '9665')).toBe(
      'opted_out',
    )
    expect(skipReasonFor('booking_confirmed', { consent: true, optedOut: true }, '9665')).toBe(
      'opted_out',
    )
    expect(skipReasonFor('lead_offer_code', { consent: true, optedOut: false }, '9665')).toBeNull()
  })
})

describe('inboundTexts', () => {
  it('reads Meta Cloud API events', () => {
    const payload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  { from: '966500000001', id: 'wamid.1', type: 'text', text: { body: 'STOP' } },
                  { from: '966500000002', id: 'wamid.2', type: 'image' },
                ],
              },
            },
          ],
        },
      ],
    }
    expect(inboundTexts(payload)).toEqual([{ from: '966500000001', text: 'STOP', id: 'wamid.1' }])
  })

  it('reads flat provider payloads', () => {
    expect(inboundTexts({ mobile: '+966 500 000 003', message: 'إيقاف', id: 'm3' })).toEqual([
      { from: '966500000003', text: 'إيقاف', id: 'm3' },
    ])
    expect(inboundTexts({ data: { from: '966500000004', text: { body: 'start' } } })).toEqual([
      { from: '966500000004', text: 'start', id: null },
    ])
    expect(inboundTexts('nope')).toEqual([])
    expect(inboundTexts({ from: '12', text: 'stop' })).toEqual([])
  })
})
