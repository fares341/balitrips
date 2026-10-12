import { describe, expect, it } from 'vitest'

import { COUNTRY_CODES, countryOptions } from './countries'
import {
  fieldErrors,
  forgotPasswordSchema,
  MAX_PHONE_LENGTH,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
} from './schemas'

/**
 * These cover the cases the handoff silently accepted. Every one of them
 * signed a visitor in as "Traveler <you@email.com>" in the prototype, because
 * `submitIn`/`submitUp` were `preventDefault()` plus an unconditional success.
 */

function errorsFor(schema: { safeParse: (input: unknown) => unknown }, input: unknown) {
  const result = schema.safeParse(input) as
    | { success: true }
    | { success: false; error: Parameters<typeof fieldErrors>[0] }
  if (result.success) return null
  return fieldErrors(result.error)
}

describe('signInSchema', () => {
  it('rejects the empty form the handoff accepted', () => {
    expect(errorsFor(signInSchema, { email: '', password: '', rememberMe: true })).toEqual({
      email: 'co_err_required',
      password: 'co_err_required',
    })
  })

  it('reports something that is neither an email nor an international phone', () => {
    expect(
      errorsFor(signInSchema, { email: 'not-an-email', password: 'hunter22', rememberMe: true }),
    ).toEqual({ email: 'auth_err_identifier' })
    expect(
      errorsFor(signInSchema, { email: 'bad@', password: 'hunter22', rememberMe: true }),
    ).toEqual({ email: 'auth_err_identifier' })
  })

  it('accepts an international mobile number instead of an email (spec 3.2)', () => {
    expect(
      errorsFor(signInSchema, { email: '+971 50 123 4567', password: 'x', rememberMe: true }),
    ).toBe(null)
    expect(
      errorsFor(signInSchema, { email: '0501234567', password: 'x', rememberMe: true }),
    ).toEqual({ email: 'auth_err_identifier' })
  })

  it('does not apply the minimum length to an existing password', () => {
    // An account created before the 8-character rule must still be able to
    // sign in; the server is what decides whether the password is right.
    expect(errorsFor(signInSchema, { email: 'a@b.co', password: 'short', rememberMe: false })).toBe(
      null,
    )
  })

  it('trims surrounding whitespace off the address', () => {
    const parsed = signInSchema.parse({ email: '  a@b.co ', password: 'x', rememberMe: true })
    expect(parsed.email).toBe('a@b.co')
  })
})

describe('signUpSchema', () => {
  const valid = {
    name: 'Maya Ardiansyah',
    email: 'maya@example.com',
    phone: '+62 812 3456 789',
    country: 'ID',
    password: 'correct-horse',
    password2: 'correct-horse',
  }

  it('accepts a complete form', () => {
    expect(errorsFor(signUpSchema, valid)).toBe(null)
  })

  it('requires the confirmation to match, and blames the confirmation box', () => {
    expect(errorsFor(signUpSchema, { ...valid, password2: 'correct-hors' })).toEqual({
      password2: 'auth_err_pw_match',
    })
  })

  it('enforces the 8-character minimum', () => {
    expect(
      errorsFor(signUpSchema, { ...valid, password: 'short12', password2: 'short12' }),
    ).toEqual({ password: 'auth_err_pw_short' })
  })

  it('rejects a country that is not a two-letter code', () => {
    // The handoff's placeholder was literally "UAE", which is three characters
    // into a varchar(2) column.
    expect(errorsFor(signUpSchema, { ...valid, country: 'UAE' })).toEqual({
      country: 'auth_country_ph',
    })
  })

  it('requires the phone (spec 3.1) but keeps country optional', () => {
    expect(errorsFor(signUpSchema, { ...valid, country: '' })).toBe(null)
    expect(errorsFor(signUpSchema, { ...valid, phone: '' })).toEqual({ phone: 'co_err_required' })
  })

  it('rejects a phone that is not international', () => {
    expect(errorsFor(signUpSchema, { ...valid, phone: 'call me' })).toEqual({
      phone: 'auth_err_phone_intl',
    })
    expect(errorsFor(signUpSchema, { ...valid, phone: '0812 3456 789' })).toEqual({
      phone: 'auth_err_phone_intl',
    })
  })

  it('accepts a preferred language and rejects an unknown one', () => {
    expect(errorsFor(signUpSchema, { ...valid, locale: 'ar' })).toBe(null)
    expect(errorsFor(signUpSchema, { ...valid, locale: 'fr' })).not.toBe(null)
  })

  it('rejects a phone number longer than the column', () => {
    const tooLong = `+${'1'.repeat(MAX_PHONE_LENGTH)}`
    expect(errorsFor(signUpSchema, { ...valid, phone: tooLong })).toEqual({ phone: 'co_err_long' })
  })

  it('reports only the first problem per field', () => {
    const errors = errorsFor(signUpSchema, { ...valid, name: '', email: '' })
    expect(errors).toEqual({ name: 'co_err_required', email: 'co_err_required' })
  })
})

describe('forgotPasswordSchema', () => {
  it('validates the address before anything is sent', () => {
    expect(errorsFor(forgotPasswordSchema, { email: 'nope' })).toEqual({ email: 'co_err_email' })
    expect(errorsFor(forgotPasswordSchema, { email: 'a@b.co' })).toBe(null)
  })
})

describe('resetPasswordSchema', () => {
  it('requires both boxes to agree', () => {
    expect(
      errorsFor(resetPasswordSchema, { password: 'abcdefgh', password2: 'abcdefghi' }),
    ).toEqual({ password2: 'auth_err_pw_match' })
  })

  it('accepts a matching pair at the minimum length', () => {
    expect(errorsFor(resetPasswordSchema, { password: 'abcdefgh', password2: 'abcdefgh' })).toBe(
      null,
    )
  })
})

describe('countryOptions', () => {
  it('only offers codes the varchar(2) column can hold', () => {
    expect(COUNTRY_CODES.every((code) => /^[A-Z]{2}$/.test(code))).toBe(true)
  })

  it('has no duplicates', () => {
    expect(new Set(COUNTRY_CODES).size).toBe(COUNTRY_CODES.length)
  })

  it('labels and sorts for the requested locale', () => {
    const english = countryOptions('en')
    expect(english.length).toBe(COUNTRY_CODES.length)

    const indonesia = english.find((option) => option.code === 'ID')
    expect(indonesia?.label).toBe('Indonesia')

    // Sorted by the locale's own collation, not by code order.
    const collator = new Intl.Collator('en')
    for (let index = 1; index < english.length; index += 1) {
      const previous = english[index - 1]
      const current = english[index]
      if (previous === undefined || current === undefined) continue
      expect(collator.compare(previous.label, current.label)).toBeLessThanOrEqual(0)
    }
  })

  it('produces localized labels for Arabic', () => {
    const arabic = countryOptions('ar')
    const indonesia = arabic.find((option) => option.code === 'ID')
    expect(indonesia?.label).not.toBe('Indonesia')
    expect(indonesia?.label.length).toBeGreaterThan(0)
  })
})
