import { describe, expect, it } from 'vitest'

import { contactPhone, phoneDefaults, validateContact } from './contact'

const base = {
  name: 'Sara Ahmed',
  email: 'Sara@Mail.com ',
  phoneCountry: 'SA',
  phone: '051 234 5678',
  notes: '',
}

describe('validateContact', () => {
  it('accepts and normalises a valid contact', () => {
    const r = validateContact(base)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.name).toBe('Sara Ahmed')
      expect(r.value.email).toBe('sara@mail.com')
      expect(r.value.phone).toBe('+966512345678')
      expect(r.value.notes).toBeNull()
    }
  })

  it('reports every bad field, keyed for the message', () => {
    const r = validateContact({
      name: 'S',
      email: 'sara@mail',
      phoneCountry: 'SA',
      phone: '12',
      notes: 'x'.repeat(501),
    })
    expect(r.ok).toBe(false)
    if (!r.ok)
      expect(r.errors).toEqual({
        name: 'co_e_name',
        email: 'co_e_email',
        phone: 'co_e_phone',
        notes: 'co_e_notes',
      })
  })

  it('says a missing phone is missing, not wrong', () => {
    const r = validateContact({ ...base, phone: '  ' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors).toEqual({ phone: 'co_e_phone_empty' })
  })

  it('rejects letters in the phone number', () => {
    expect(validateContact({ ...base, phone: '5x1234567' }).ok).toBe(false)
  })
})

describe('checkout phone: the same rules as registration', () => {
  const e164 = (phone: string, phoneCountry: string) => contactPhone({ phone, phoneCountry })

  it('takes a local number in any country, not a short list of codes (audit H3)', () => {
    expect(e164('0501234567', 'SA')).toBe('+966501234567')
    expect(e164('1512 3456789', 'DE')).toBe('+4915123456789')
    expect(e164('06 12 34 56 78', 'FR')).toBe('+33612345678')
    expect(e164('0612345678', 'MA')).toBe('+212612345678')
    expect(e164('0790 123 4567', 'IQ')).toBe('+9647901234567')
    expect(e164('0812-3456-789', 'ID')).toBe('+628123456789')
  })

  it('accepts a number typed with its own code, whatever the picker says (audit H3)', () => {
    expect(e164('+49 1512 3456789', 'SA')).toBe('+4915123456789')
    expect(e164('00491512 3456789', 'SA')).toBe('+4915123456789')
    expect(e164('966501234567', 'SA')).toBe('+966501234567')
  })

  it('accepts Arabic-Indic and Persian digits (audit M7)', () => {
    expect(e164('٠٥٠١٢٣٤٥٦٧', 'SA')).toBe('+966501234567')
    expect(e164('۰۵۰۱۲۳۴۵۶۷', 'SA')).toBe('+966501234567')
  })

  it('refuses landlines, wrong-country and wrong-length numbers (audit H4)', () => {
    expect(e164('0112345678', 'SA')).toBeNull() // Riyadh landline
    expect(e164('020 7946 0958', 'GB')).toBeNull() // London landline
    expect(e164('7400123456', 'SA')).toBeNull() // UK mobile under +966
    expect(e164('050123456', 'SA')).toBeNull() // one digit short
    expect(e164('05012345678', 'SA')).toBeNull() // one digit long
    expect(e164('123456', 'SA')).toBeNull()
    expect(e164('', 'SA')).toBeNull()
  })

  it('needs a country for a local number', () => {
    expect(e164('0501234567', '')).toBeNull()
    expect(e164('0501234567', 'XX')).toBeNull()
    expect(e164('+966501234567', '')).toBe('+966501234567')
  })

  it('still reads the old dial-code field from a tab opened before the change', () => {
    expect(contactPhone({ phone: '050 123 4567', phoneCountry: '', dialCode: '+966' })).toBe(
      '+966501234567',
    )
    // …under the new rules: the old form let a landline through.
    expect(contactPhone({ phone: '0112345678', phoneCountry: '', dialCode: '+966' })).toBeNull()
    expect(contactPhone({ phone: '501234567', phoneCountry: '', dialCode: '+999' })).toBeNull()
  })
})

describe('phoneDefaults', () => {
  it('shows a saved number in its own country, as its owner writes it', () => {
    expect(phoneDefaults('+966501234567')).toEqual({ country: 'SA', phone: '050 123 4567' })
    expect(phoneDefaults('+971 50 123 4567').country).toBe('AE')
    expect(phoneDefaults('+4915123456789').country).toBe('DE')
  })

  it('round-trips: the prefilled value validates to the saved number', () => {
    for (const saved of ['+966501234567', '+971501234567', '+4915123456789', '+628123456789']) {
      const { country, phone } = phoneDefaults(saved)
      expect(contactPhone({ phone, phoneCountry: country ?? '' })).toBe(saved)
    }
  })

  it('keeps a number saved under the old rules visible instead of dropping it', () => {
    // A local zero kept after the code (accepted before): read as the real number.
    expect(phoneDefaults('+9660501234567')).toEqual({ country: 'SA', phone: '050 123 4567' })
    expect(phoneDefaults('+966112345678')).toEqual({ country: null, phone: '+966112345678' })
  })

  it('is empty when nothing is saved', () => {
    expect(phoneDefaults(null)).toEqual({ country: null, phone: '' })
    expect(phoneDefaults('')).toEqual({ country: null, phone: '' })
  })
})
