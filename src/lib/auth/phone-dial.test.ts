import { describe, expect, it } from 'vitest'

import { formatIntl, isPhoneLike, withDialCode } from './phone'

describe('sign-in box: email or phone with the country code', () => {
  it('letters or @ = email, sent as typed', () => {
    expect(withDialCode('  sara@mail.com ', '966')).toBe('sara@mail.com')
    expect(isPhoneLike('sara')).toBe(false)
    expect(withDialCode('sara', '966')).toBe('sara')
  })
  it('a local number gets the chosen country code (leading 0 dropped)', () => {
    expect(withDialCode('0501234567', '966')).toBe('+966501234567')
    expect(withDialCode('50 123 4567', '966')).toBe('+966501234567')
    expect(withDialCode('081234567890', '62')).toBe('+6281234567890')
  })
  it('+ or 00 means the code is already there', () => {
    expect(withDialCode('+971 50 123 4567', '966')).toBe('+971501234567')
    expect(withDialCode('00971501234567', '966')).toBe('+971501234567')
  })
  it('code typed without + is not doubled', () => {
    expect(withDialCode('966501234567', '966')).toBe('+966501234567')
  })
  it('too short stays invalid (the form shows the message)', () => {
    expect(withDialCode('123', '966').startsWith('+')).toBe(false)
  })
  it('shows the number grouped', () => {
    expect(formatIntl('+966501234567', '966')).toBe('+966 50 123 4567')
  })
})
