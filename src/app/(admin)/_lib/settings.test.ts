import { describe, expect, it } from 'vitest'

/**
 * Settings validation.
 *
 * The point of these tests is the WRITE path: `site_settings.value` is jsonb,
 * so the column enforces nothing and the Zod schema is the only thing between
 * an operator's typo and a fee that silently reverts to its default on the
 * next page render. Each case below is a mistake somebody will actually make.
 *
 * The module reaches `@/db`, which throws at import when `DATABASE_URL` is
 * unset. The connection is lazy — `postgres()` does not dial until a query
 * runs — so a placeholder is enough to import it, and nothing here touches
 * the network.
 */
process.env.DATABASE_URL ??= 'postgresql://placeholder@127.0.0.1:1/none'

const {
  contactSchema,
  currenciesSchema,
  feesSchema,
  parseSetting,
  policySchema,
  SETTING_DEFAULTS,
  SETTING_KEYS,
} = await import('./settings')

describe('currencies', () => {
  it('uppercases and accepts ISO 4217 codes', () => {
    const parsed = currenciesSchema.parse({
      baseCurrency: 'usd',
      presentmentCurrencies: ['usd', 'idr'],
      defaultPresentment: 'usd',
    })
    expect(parsed.baseCurrency).toBe('USD')
    expect(parsed.presentmentCurrencies).toEqual(['USD', 'IDR'])
  })

  it('rejects a currency that is not three letters', () => {
    expect(() =>
      currenciesSchema.parse({
        baseCurrency: 'DOLLAR',
        presentmentCurrencies: ['USD'],
        defaultPresentment: 'USD',
      }),
    ).toThrow()
  })

  it('rejects an empty presentment list', () => {
    expect(() =>
      currenciesSchema.parse({
        baseCurrency: 'USD',
        presentmentCurrencies: [],
        defaultPresentment: 'USD',
      }),
    ).toThrow()
  })
})

describe('fees', () => {
  it('accepts basis points and integer minor units', () => {
    const parsed = feesSchema.parse({
      serviceFeeBps: 250,
      bookingFeeMinor: 500,
      paymentSurchargeBps: 0,
      feeCurrency: 'USD',
    })
    expect(parsed.serviceFeeBps).toBe(250)
  })

  it('refuses a fractional minor unit — there are no half cents', () => {
    expect(() =>
      feesSchema.parse({
        serviceFeeBps: 250,
        bookingFeeMinor: 12.5,
        paymentSurchargeBps: 0,
        feeCurrency: 'USD',
      }),
    ).toThrow()
  })

  it('refuses a negative fee', () => {
    expect(() =>
      feesSchema.parse({
        serviceFeeBps: -1,
        bookingFeeMinor: 0,
        paymentSurchargeBps: 0,
        feeCurrency: 'USD',
      }),
    ).toThrow()
  })

  it('refuses more than 100% — a typo of 2500 for 25% would be a 25x overcharge', () => {
    expect(() =>
      feesSchema.parse({
        serviceFeeBps: 10_001,
        bookingFeeMinor: 0,
        paymentSurchargeBps: 0,
        feeCurrency: 'USD',
      }),
    ).toThrow()
  })
})

describe('contact', () => {
  it('accepts a bare E.164 number', () => {
    const parsed = contactSchema.parse({
      whatsappNumber: '6281234567890',
      whatsappDisplay: '+62 812 3456 7890',
      supportEmail: 'hello@example.com',
    })
    expect(parsed.whatsappNumber).toBe('6281234567890')
  })

  it('refuses a number that still carries punctuation', () => {
    // `wa.me/<number>` 404s on anything but digits, so a stored "+62 812…"
    // would produce a dead link on every page of the site.
    expect(() =>
      contactSchema.parse({
        whatsappNumber: '+62 812 3456 7890',
        whatsappDisplay: '+62 812 3456 7890',
        supportEmail: 'hello@example.com',
      }),
    ).toThrow()
  })

  it('refuses a malformed support address', () => {
    expect(() =>
      contactSchema.parse({
        whatsappNumber: '6281234567890',
        whatsappDisplay: '+62 812 3456 7890',
        supportEmail: 'not-an-address',
      }),
    ).toThrow()
  })
})

describe('policy', () => {
  it('fills untranslated locales with an empty string rather than dropping them', () => {
    const parsed = policySchema.parse({ updated: '2026-08-13', body: { en: 'Body.' } })
    expect(parsed.body.ar).toBe('')
    expect(parsed.body.id).toBe('')
  })

  it('refuses an effective date that is not YYYY-MM-DD', () => {
    expect(() => policySchema.parse({ updated: '13/08/2026', body: { en: 'Body.' } })).toThrow()
  })
})

describe('defaults', () => {
  it('every shipped default satisfies its own schema', () => {
    // A default that fails validation would make the whole settings layer
    // unusable: `readSettings()` falls back to it, and the config form would
    // then refuse to save the value it just rendered.
    for (const key of SETTING_KEYS) {
      expect(() => parseSetting(key, SETTING_DEFAULTS[key])).not.toThrow()
    }
  })

  it('ships a default presentment currency that is actually on offer', () => {
    expect(SETTING_DEFAULTS.currencies.presentmentCurrencies).toContain(
      SETTING_DEFAULTS.currencies.defaultPresentment,
    )
  })

  it('ships zero fees, so enabling one is always a deliberate act', () => {
    expect(SETTING_DEFAULTS.fees.serviceFeeBps).toBe(0)
    expect(SETTING_DEFAULTS.fees.bookingFeeMinor).toBe(0)
    expect(SETTING_DEFAULTS.fees.paymentSurchargeBps).toBe(0)
  })
})
