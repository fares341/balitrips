import { describe, expect, it } from 'vitest'

import { guessCountry, isValidE164, phoneLookupCandidates, toE164, withCountry } from './phone'

describe('phone number by country', () => {
  it('local formats become +E.164 for the chosen country', () => {
    expect(toE164('0501234567', 'SA')).toBe('+966501234567')
    expect(toE164('50 123 4567', 'SA')).toBe('+966501234567')
    expect(toE164('01012345678', 'EG')).toBe('+201012345678')
    expect(toE164('081234567890', 'ID')).toBe('+6281234567890')
    expect(toE164('0501234567', 'AE')).toBe('+971501234567')
    expect(toE164('015112345678', 'DE')).toBe('+4915112345678')
  })
  it('Arabic digits work', () => {
    expect(toE164('٠٥٠١٢٣٤٥٦٧', 'SA')).toBe('+966501234567')
  })
  it('+ / 00 / code without + win over the picker', () => {
    expect(toE164('+201012345678', 'SA')).toBe('+201012345678')
    expect(toE164('00201012345678', 'SA')).toBe('+201012345678')
    expect(toE164('966501234567', 'SA')).toBe('+966501234567')
  })
  it('wrong length for the country is rejected', () => {
    expect(toE164('05012345', 'SA')).toBeNull()
    expect(toE164('abc', 'SA')).toBeNull()
    expect(isValidE164('+966501234567')).toBe(true)
    expect(toE164('+9660501234567', 'SA')).toBe('+966501234567')
  })
  it('sign-in box keeps emails and completes phones', () => {
    expect(withCountry(' sara@mail.com ', 'SA')).toBe('sara@mail.com')
    expect(withCountry('0501234567', 'SA')).toBe('+966501234567')
  })
  it('finds accounts stored with an extra local 0', () => {
    expect(phoneLookupCandidates('+966501234567')).toContain('+9660501234567')
    expect(phoneLookupCandidates('+9660501234567')).toContain('+966501234567')
  })
  it('guesses the country from the browser region', () => {
    expect(guessCountry('ar', ['ar-EG'])).toBe('EG')
    expect(guessCountry('id', ['id'])).toBe('ID')
    expect(guessCountry('ar', ['ar'])).toBe('SA')
  })
})

describe('digits count per country', () => {
  it('blocks typing past the longest mobile number', async () => {
    const { isTooLong, exampleLocal } = await import('./phone')
    expect(isTooLong('0501234567', 'SA')).toBe(false)
    expect(isTooLong('01012345678', 'EG')).toBe(false)
    expect(isTooLong('010123456789', 'EG')).toBe(true)
    expect(isTooLong('+9665012345678', 'SA')).toBe(false)
    expect(exampleLocal('SA')).toMatch(/\d/)
  })
  it('landlines and short numbers are rejected (WhatsApp needs a mobile)', () => {
    expect(toE164('0112345678', 'SA')).toBeNull()
    expect(toE164('050123456', 'SA')).toBeNull()
  })
})

describe('number typed like the placeholder', () => {
  it('accepts a leading bracket', () => {
    expect(toE164('(201) 555-0123', 'US')).toBe('+12015550123')
  })
})
