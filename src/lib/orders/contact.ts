/**
 * Lead-traveller contact details collected in checkout step 1.
 *
 * Shared by the client (errors under each field before moving on) and the
 * server action (which trusts nothing the browser checked). Pure.
 */

/** Dialling codes offered in the selector: the Gulf first, then Bali's neighbours. */
export const DIAL_CODES = [
  '+966',
  '+971',
  '+965',
  '+974',
  '+973',
  '+968',
  '+20',
  '+962',
  '+62',
  '+60',
  '+65',
  '+90',
  '+44',
  '+1',
] as const

export type ContactField = 'name' | 'email' | 'phone' | 'notes'

export interface ContactInput {
  name: string
  email: string
  dialCode: string
  phone: string
  notes: string
}

export interface CleanContact {
  name: string
  email: string
  /** E.164-style: dial code + national digits, no spaces. */
  phone: string
  notes: string | null
}

export const NOTES_MAX = 500
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

/** National number: digits only, leading zero dropped (the dial code replaces it). */
export function nationalDigits(phone: string): string {
  const digits = phone.replace(/[\s\-().]/g, '')
  if (!/^\d*$/.test(digits)) return ''
  return digits.replace(/^0+/, '')
}

export function validateContact(
  input: ContactInput,
):
  | { ok: true; value: CleanContact }
  | { ok: false; errors: Partial<Record<ContactField, string>> } {
  const errors: Partial<Record<ContactField, string>> = {}
  const name = input.name.trim().replace(/\s+/g, ' ')
  const email = input.email.trim().toLowerCase()
  const digits = nationalDigits(input.phone)
  const notes = input.notes.trim()

  if (name.length < 3 || name.length > 120) errors.name = 'co_e_name'
  if (!EMAIL.test(email) || email.length > 200) errors.email = 'co_e_email'
  if (!(DIAL_CODES as readonly string[]).includes(input.dialCode)) errors.phone = 'co_e_phone'
  else if (digits.length < 6 || digits.length > 13) errors.phone = 'co_e_phone'
  if (notes.length > NOTES_MAX) errors.notes = 'co_e_notes'

  if (Object.keys(errors).length > 0) return { ok: false, errors }
  return {
    ok: true,
    value: { name, email, phone: `${input.dialCode}${digits}`, notes: notes === '' ? null : notes },
  }
}

/** Split a stored "+9665…" back into the selector and the national part. */
export function splitPhone(phone: string | null): { dialCode: string; phone: string } {
  if (phone === null || phone === '') return { dialCode: DIAL_CODES[0], phone: '' }
  const compact = phone.replace(/\s/g, '')
  const code = [...DIAL_CODES]
    .sort((a, b) => b.length - a.length)
    .find((c) => compact.startsWith(c))
  if (code === undefined) return { dialCode: DIAL_CODES[0], phone: compact.replace(/^\+/, '') }
  return { dialCode: code, phone: compact.slice(code.length) }
}
