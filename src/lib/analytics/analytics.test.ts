import { describe, expect, it } from 'vitest'

import { metaPayload, tiktokPayload } from './capi-payload'
import { eventsForClick, eventsForPath } from './client'
import {
  allowsAnalytics,
  allowsMarketing,
  consentCode,
  parseConsent,
  readCookie,
  serializeConsent,
} from './consent'
import { isUuid, serverEventId } from './event-id'
import { browserMaySend, cleanPath, cleanProps, EVENT_NAMES, isEventName } from './events'
import { hashedEmail, normalizeEmail, normalizePhone, sha256Hex } from './hash'
import { plannedTags, toMajor } from './pixels'
import { publicTrackingConfig, MARKETING_DEFAULTS } from './settings'
import { buildCampaignUrl, decodeTouch, encodeTouch, touchFromLanding } from './utm'

const CONFIG = { ga4: 'G-ABC1234', gtm: 'GTM-XYZ12', meta: '1234567890', tiktok: 'CABCDEFGHIJK12' }

describe('event catalogue', () => {
  it('holds exactly the agreed events', () => {
    expect(EVENT_NAMES).toHaveLength(30)
    expect(new Set(EVENT_NAMES).size).toBe(30)
    for (const name of [
      'page_view',
      'view_vip_map',
      'map_to_activity_click',
      'support_ticket_created',
    ]) {
      expect(isEventName(name)).toBe(true)
    }
    expect(isEventName('click')).toBe(false)
  })

  it('lets a browser send behaviour, never money events (purchase only mirrored)', () => {
    expect(browserMaySend('page_view')).toBe(true)
    expect(browserMaySend('purchase')).toBe(true)
    expect(browserMaySend('refund')).toBe(false)
    expect(browserMaySend('payment_success')).toBe(false)
    expect(browserMaySend('booking_confirmed')).toBe(false)
  })

  it('drops props that are not allowed — no location, no personal data', () => {
    expect(
      cleanProps({ lat: -8.6, lon: 115.2, email: 'a@b.c', filter: 'category', day: 2 }),
    ).toEqual({ filter: 'category', day: 2 })
    expect(cleanProps({ lat: 1 })).toBeNull()
    expect(cleanProps('x')).toBeNull()
  })

  it('keeps only the path of a URL', () => {
    expect(cleanPath('/ar/activities/batur?email=a@b.c#x')).toBe('/ar/activities/batur')
    expect(cleanPath('//evil.example/x')).toBeNull()
    expect(cleanPath('https://x')).toBeNull()
  })
})

describe('dedupe ids', () => {
  it('is deterministic per event and key, and a valid UUID', () => {
    const a = serverEventId('purchase', '6f1c2c0e-7a8b-4c1d-9e0f-123456789abc')
    const b = serverEventId('purchase', '6f1c2c0e-7a8b-4c1d-9e0f-123456789abc')
    expect(a).toBe(b)
    expect(isUuid(a)).toBe(true)
    expect(a[14]).toBe('5')
    expect(['8', '9', 'a', 'b']).toContain(a[19])
  })

  it('differs between events and between keys', () => {
    const order = 'order-1'
    expect(serverEventId('purchase', order)).not.toBe(serverEventId('payment_success', order))
    expect(serverEventId('purchase', order)).not.toBe(serverEventId('purchase', 'order-2'))
  })

  it('gives the browser pixel and the server API the same purchase id', () => {
    const id = serverEventId('purchase', 'order-9')
    const payload = metaPayload({
      id: 'row',
      eventId: id,
      createdAt: new Date('2026-10-01T00:00:00Z'),
      valueMinor: 12345,
      currency: 'USD',
      anonId: 'anon-1',
      orderId: 'order-9',
      email: null,
      phone: null,
    })
    expect(payload.event_id).toBe(id)
    expect(payload.custom_data).toEqual({ currency: 'USD', value: 123.45 })
  })
})

describe('consent', () => {
  it('round-trips the cookie', () => {
    const value = serializeConsent({ analytics: true, marketing: false, at: 1_790_000_000 })
    expect(value).toBe('1.a1.m0.1790000000')
    expect(parseConsent(value)).toEqual({ analytics: true, marketing: false, at: 1_790_000_000 })
  })

  it('treats a missing or broken cookie as "no consent"', () => {
    expect(parseConsent(null)).toBeNull()
    expect(parseConsent('yes')).toBeNull()
    expect(parseConsent('1.a2.m1.5')).toBeNull()
    expect(allowsAnalytics(null)).toBe(false)
    expect(allowsMarketing(parseConsent('garbage'))).toBe(false)
  })

  it('reads one cookie out of a header', () => {
    expect(readCookie('a=1; bt_consent=1.a1.m1.5; b=2', 'bt_consent')).toBe('1.a1.m1.5')
    expect(readCookie('a=1', 'bt_consent')).toBeNull()
  })

  it('codes the choice for the order', () => {
    expect(consentCode(null)).toBe('')
    expect(consentCode({ analytics: true, marketing: true, at: 0 })).toBe('am')
  })
})

describe('consent gating of third-party tags', () => {
  it('loads no script tag at all without consent', () => {
    expect(plannedTags(null, CONFIG)).toEqual([])
    expect(plannedTags({ analytics: false, marketing: false, at: 0 }, CONFIG)).toEqual([])
  })

  it('loads GA4 only with statistics consent', () => {
    const tags = plannedTags({ analytics: true, marketing: false, at: 0 }, CONFIG)
    expect(tags.map((t) => t.tool)).toEqual(['ga4'])
  })

  it('loads GTM, Meta and TikTok only with marketing consent', () => {
    const tags = plannedTags({ analytics: false, marketing: true, at: 0 }, CONFIG)
    expect(tags.map((t) => t.tool)).toEqual(['gtm', 'meta', 'tiktok'])
  })

  it('loads nothing the owner has not switched on', () => {
    const config = publicTrackingConfig(MARKETING_DEFAULTS)
    expect(config).toEqual({ ga4: null, gtm: null, meta: null, tiktok: null })
    expect(plannedTags({ analytics: true, marketing: true, at: 0 }, config)).toEqual([])
  })
})

describe('campaigns (UTM)', () => {
  it('reads UTM tags, cleaned', () => {
    expect(
      touchFromLanding(
        '?utm_source=Instagram&utm_medium=Paid Social&utm_campaign=Ramadan<1>',
        '',
        'balitrips.com',
      ),
    ).toEqual({
      source: 'instagram',
      medium: 'paid_social',
      campaign: 'ramadan1',
    })
  })

  it('falls back to the referring site, ignoring our own', () => {
    expect(touchFromLanding('', 'https://www.google.com/search?q=x', 'balitrips.com')).toEqual({
      source: 'google',
      medium: 'organic',
      campaign: null,
    })
    expect(touchFromLanding('', 'https://l.instagram.com/', 'balitrips.com')?.source).toBe(
      'instagram',
    )
    expect(touchFromLanding('', 'https://balitrips.com/ar', 'balitrips.com')).toBeNull()
    expect(touchFromLanding('', '', 'balitrips.com')).toBeNull()
  })

  it('round-trips a touch through its cookie form', () => {
    const touch = { source: 'tiktok', medium: 'cpc', campaign: 'summer' }
    expect(decodeTouch(encodeTouch(touch))).toEqual(touch)
    expect(decodeTouch('')).toBeNull()
  })

  it('builds campaign links', () => {
    expect(
      buildCampaignUrl('https://balitrips.com/ar/itineraries/x?utm_source=old', {
        source: 'Instagram',
        medium: 'social',
        campaign: 'ramadan 2026',
      }),
    ).toBe(
      'https://balitrips.com/ar/itineraries/x?utm_source=instagram&utm_medium=social&utm_campaign=ramadan_2026',
    )
    expect(
      buildCampaignUrl('javascript:alert(1)', { source: 'x', medium: '', campaign: '' }),
    ).toBeNull()
    expect(buildCampaignUrl('https://a.b', { source: '', medium: '', campaign: '' })).toBeNull()
  })
})

describe('hashing for server APIs', () => {
  it('normalises before hashing', () => {
    expect(normalizeEmail('  Foo@Example.COM ')).toBe('foo@example.com')
    expect(normalizeEmail('not-an-email')).toBeNull()
    expect(normalizePhone('+62 812-3456-7890')).toBe('6281234567890')
    expect(hashedEmail('Foo@Example.com')).toBe(sha256Hex('foo@example.com'))
  })

  it('matches a known SHA-256 vector', () => {
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })

  it('never puts a plain email in a payload', () => {
    const payload = tiktokPayload({
      id: 'r',
      eventId: 'e',
      createdAt: new Date(0),
      valueMinor: 1000,
      currency: 'IDR',
      anonId: null,
      orderId: null,
      email: 'Person@Mail.com',
      phone: null,
    })
    expect(JSON.stringify(payload)).not.toContain('Person@Mail.com')
    expect(JSON.stringify(payload)).not.toContain('person@mail.com')
    expect(payload.user.email).toBe(sha256Hex('person@mail.com'))
    expect(toMajor(1000, 'IDR')).toBe(10)
  })
})

describe('events from the page address', () => {
  it('recognises product pages', () => {
    expect(eventsForPath('/ar/activities/mount-batur', '')).toEqual([
      { name: 'view_item', itemKind: 'activity', itemRef: 'mount-batur' },
    ])
    expect(eventsForPath('/en/itineraries/7-days', '').map((e) => e.name)).toEqual([
      'view_item',
      'itinerary_view',
    ])
    expect(eventsForPath('/ar/checkout', '').map((e) => e.name)).toEqual(['begin_checkout'])
  })

  it('records the map day view and filters, never a location', () => {
    const events = eventsForPath('/ar/map', '?itinerary=bali-7&day=2&cat=beach&near=-8.6,115.2')
    expect(events.map((e) => e.name)).toEqual(['view_map', 'itinerary_day_view', 'select_item'])
    expect(JSON.stringify(events)).not.toContain('115.2')
  })

  it('classifies clicks', () => {
    const origin = 'https://balitrips.com'
    expect(eventsForClick('https://wa.me/62811', '/ar', origin).map((e) => e.name)).toEqual([
      'whatsapp_click',
    ])
    expect(eventsForClick('/ar/activities/batur', '/ar/map', origin).map((e) => e.name)).toEqual([
      'map_to_activity_click',
      'select_item',
    ])
    expect(eventsForClick('/ar/plans', '/ar/map', origin).map((e) => e.name)).toEqual([
      'vip_upgrade_click',
    ])
    expect(eventsForClick('https://other.example/x', '/ar', origin)).toEqual([])
  })
})
