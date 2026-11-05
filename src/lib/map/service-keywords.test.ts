import { describe, expect, it } from 'vitest'

import { serviceKind } from './service-keywords'

describe('serviceKind', () => {
  it.each([
    [{ en: 'Karisma Barber Keluarga' }, 'barber'],
    [{ en: 'Bliss Barber Jimbaran' }, 'barber'],
    [{ en: 'HQ Cuts & Ink Barber Tattoo' }, 'barber'],
    [{ en: 'Old Town Barbershop' }, 'barber'],
    [{ ar: 'حلاق السعادة' }, 'barber'],
    [{ en: 'Easy Day Laundry Pererenan' }, 'laundry'],
    [{ en: 'Laundry Projects Seminyak' }, 'laundry'],
    [{ id: 'Binatu Bersih' }, 'laundry'],
    [{ en: 'Sparkle Dry Clean' }, 'laundry'],
    [{ ar: 'مغسلة اللوتس' }, 'laundry'],
  ])('%j → %s', (name, kind) => {
    expect(serviceKind(name)).toBe(kind)
  })

  it('uses the description when the name says nothing', () => {
    expect(serviceKind({ en: 'Romat' }, { en: 'Laundry and ironing service in Canggu' })).toBe(
      'laundry',
    )
    expect(serviceKind({ en: 'Romat' }, { en: 'Modern barber for men' })).toBe('barber')
  })

  it('the name wins over the description', () => {
    expect(serviceKind({ en: 'Karisma Barber' }, { en: 'barber & laundry service' })).toBe('barber')
  })

  it.each([
    'Bali Collection',
    'Level 21 Mall',
    'Seminyak Village',
    'Living World',
    'Beachwalk Shopping Center',
    'Discovery Shopping Mall',
    'Mal Bali Galeria',
    'Seminyak Square',
    'Park23 Entertainment Center',
  ])('no false positive on %s', (name) => {
    expect(
      serviceKind({ en: name }, { en: `${name} — shopping, dining and cinema in Bali.` }),
    ).toBeNull()
  })
})
