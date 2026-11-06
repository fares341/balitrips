import { describe, expect, it, vi } from 'vitest'

// The listing module imports the database; these tests need only its pure parts.
vi.mock('@/db', () => ({ db: {} }))

import { LISTING_ACCESS, mayExportListing } from '@/lib/reports/listing'
import { can, ROLES } from '@/lib/auth/roles'

import {
  couponCodeFrom,
  isExcludedPath,
  mayShowOffer,
  OFFER_SNOOZE_DAYS,
  parseOfferMemory,
  reachedScrollTrigger,
  reminderChannel,
} from './rules'
import { parseLeadSettings } from './settings'

const DAY = 24 * 60 * 60 * 1000

describe('offer: once per visitor', () => {
  it('shows to a new visitor, then never again once shown', () => {
    expect(mayShowOffer({}, 1000)).toBe(true)
    expect(mayShowOffer({ shownAt: 1000 }, 1000 + 365 * DAY)).toBe(false)
  })
  it('stays away 14 days after a close, then may come back once', () => {
    const closedAt = 10 * DAY
    expect(mayShowOffer({ shownAt: closedAt, closedAt }, closedAt + 13 * DAY)).toBe(false)
    expect(mayShowOffer({ shownAt: closedAt, closedAt }, closedAt + OFFER_SNOOZE_DAYS * DAY)).toBe(
      true,
    )
  })
  it('never again after the form was sent', () => {
    expect(mayShowOffer({ shownAt: 1, closedAt: 1, doneAt: 2 }, 400 * DAY)).toBe(false)
  })
  it('treats broken storage as empty instead of crashing', () => {
    expect(parseOfferMemory('{not json')).toEqual({})
    expect(parseOfferMemory(null)).toEqual({})
    expect(parseOfferMemory('{"shownAt":"x","closedAt":5}')).toEqual({ closedAt: 5 })
  })
  it('never appears on checkout, cart, account, Studio or policy pages', () => {
    for (const path of [
      '/ar/checkout',
      '/en/checkout/confirmation/BT-1',
      '/cart',
      '/id/account/schedules',
      '/studio',
      '/ar/login',
      '/en/privacy',
    ]) {
      expect(isExcludedPath(path)).toBe(true)
    }
    for (const path of ['/', '/ar', '/en/activities/rafting', '/ar/itineraries']) {
      expect(isExcludedPath(path)).toBe(false)
    }
  })
  it('phone trigger fires at half the page', () => {
    expect(reachedScrollTrigger(400, 800, 2000)).toBe(false)
    expect(reachedScrollTrigger(600, 800, 2000)).toBe(true)
    expect(reachedScrollTrigger(0, 800, 700)).toBe(false)
  })
})

describe('reminder consent gating', () => {
  const base = { phone: '+966501234567', email: 'a@example.com' }
  it('sends nothing without consent', () => {
    expect(reminderChannel({ ...base, whatsappConsent: false, emailConsent: false })).toBe('none')
  })
  it('uses each channel only with its own consent', () => {
    expect(reminderChannel({ ...base, whatsappConsent: true, emailConsent: false })).toBe(
      'whatsapp',
    )
    expect(reminderChannel({ ...base, whatsappConsent: false, emailConsent: true })).toBe('email')
    expect(reminderChannel({ ...base, whatsappConsent: true, emailConsent: true })).toBe('both')
  })
  it('needs a usable address for the channel', () => {
    expect(
      reminderChannel({ phone: '0501234', email: null, whatsappConsent: true, emailConsent: true }),
    ).toBe('none')
    expect(
      reminderChannel({
        phone: null,
        email: '966501234567@phone.balitrips.invalid',
        whatsappConsent: true,
        emailConsent: true,
      }),
    ).toBe('none')
  })
})

describe('settings and codes', () => {
  it('is off by default, with the brief defaults', () => {
    const s = parseLeadSettings(undefined)
    expect(s.popupEnabled).toBe(false)
    expect(s.abandonedEnabled).toBe(false)
    expect(s.discountPercent).toBe(10)
    expect(s.delaySeconds).toBe(25)
    expect(s.abandonedDelayMinutes).toBe(60)
  })
  it('falls back to defaults on a malformed row', () => {
    expect(parseLeadSettings({ discountPercent: 'lots' }).discountPercent).toBe(10)
  })
  it('makes readable single-use codes', () => {
    expect(couponCodeFrom(new Uint8Array([0, 1, 2, 3, 4, 5]))).toMatch(/^BALI-[A-Z2-9]{6}$/)
  })
})

describe('permissions', () => {
  it('the leads PDF needs customers.export, like the customers PDF', () => {
    expect(LISTING_ACCESS.leads).toBe('customers.export')
    for (const role of ROLES) {
      expect(mayExportListing(role, 'leads')).toBe(
        can(role, 'admin.access') && can(role, 'customers.export'),
      )
    }
  })
  it('a customer can never export or see leads', () => {
    expect(mayExportListing('customer', 'leads')).toBe(false)
    expect(can('customer', 'customers.read')).toBe(false)
  })
})
