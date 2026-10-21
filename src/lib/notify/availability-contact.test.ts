import { describe, expect, it } from 'vitest'

import { normaliseAlertContact } from './availability-contact'

describe('normaliseAlertContact', () => {
  it('needs an email or a phone', () => {
    expect(normaliseAlertContact('', ' ')).toEqual({ error: 'contact_required' })
  })
  it('lower-cases the email and builds a stable key', () => {
    expect(normaliseAlertContact(' Ana@Example.COM ', '')).toEqual({
      email: 'ana@example.com',
      phone: null,
      key: 'e:ana@example.com',
    })
  })
  it('normalises the phone to E.164 digits (same key however it is typed)', () => {
    const a = normaliseAlertContact('', '+62 812-3456-7890')
    const b = normaliseAlertContact('', '0062 81234567890')
    const c = normaliseAlertContact('', '62 812 3456 7890')
    expect(a).toEqual({ email: null, phone: '6281234567890', key: 'p:6281234567890' })
    expect(b).toEqual(a)
    expect(c).toEqual(a)
  })
  it('keeps both channels in the key', () => {
    const both = normaliseAlertContact('a@b.co', '+966512345678')
    expect('key' in both && both.key).toBe('e:a@b.co|p:966512345678')
  })
  it('rejects a bad email or phone', () => {
    expect(normaliseAlertContact('nope', '')).toEqual({ error: 'email_invalid' })
    expect(normaliseAlertContact('', '123')).toEqual({ error: 'phone_invalid' })
  })
})
