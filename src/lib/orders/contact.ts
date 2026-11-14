/**
 * Lead-traveller contact details collected in checkout step 1.
 *
 * Shared by the client (errors under each field before moving on) and the
 * server action (which trusts nothing the browser checked). Pure.
 *
 * The phone follows the same rules as registration (`@/lib/auth/phone`):
 * every country, mobile numbers only, the exact digit count and prefixes of
 * that country. It is where the schedule and the confirmation are sent on
 * WhatsApp, so a landline or a number one digit short is refused here rather
 * than discovered after payment. Stored as before: `+` and digits (E.164).
 */

import { parsePhoneNumberFromString } from 'libphonenumber-js/mobile'

import { countryOfE164, isCountry, isValidE164, toAsciiDigits, toE164 } from '@/lib/auth/phone'

export type ContactField = 'name' | 'email' | 'phone' | 'notes'

export interface ContactInput {
  name: string
  email: string
  /** ISO country of the picker (`SA`), which a local number is read against. */
  phoneCountry: string
  /** As typed: local (0501234567), with the code (+966…, 00966…), any digits script. */
  phone: string
  notes: string
  /**
   * Pre-Nov-2026 form field (`+966`). Only read when `phoneCountry` is
   * missing, so a checkout tab left open across the deploy still submits.
   */
  dialCode?: string
}

export interface CleanContact {
  name: string
  email: string
  /** E.164: `+` then country code and national number, no spaces. */
  phone: string
  notes: string | null
}

export const NOTES_MAX = 500
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

/** The number as +E.164 when it is a real mobile number, else null. */
export function contactPhone(input: Pick<ContactInput, 'phone' | 'phoneCountry' | 'dialCode'>) {
  const typed = input.phone.trim()
  if (typed === '') return null
  if (isCountry(input.phoneCountry)) return checked(toE164(typed, input.phoneCountry))
  // Old form: a dial code beside the national digits.
  const dial = (input.dialCode ?? '').trim()
  if (/^\+\d{1,4}$/.test(dial)) {
    const national = toAsciiDigits(typed)
      .replace(/[\s\-().]/g, '')
      .replace(/^0+/, '')
    if (/^\d+$/.test(national)) return checked(toE164(`${dial}${national}`, ''))
  }
  // No country at all: only a number that names its own (+… / 00…).
  return checked(toE164(typed, ''))
}

function checked(e164: string | null): string | null {
  return e164 !== null && isValidE164(e164) ? e164 : null
}

export function validateContact(
  input: ContactInput,
):
  { ok: true; value: CleanContact } | { ok: false; errors: Partial<Record<ContactField, string>> } {
  const errors: Partial<Record<ContactField, string>> = {}
  const name = input.name.trim().replace(/\s+/g, ' ')
  const email = input.email.trim().toLowerCase()
  const phone = contactPhone(input)
  const notes = input.notes.trim()

  if (name.length < 3 || name.length > 120) errors.name = 'co_e_name'
  if (!EMAIL.test(email) || email.length > 200) errors.email = 'co_e_email'
  if (phone === null) errors.phone = input.phone.trim() === '' ? 'co_e_phone_empty' : 'co_e_phone'
  if (notes.length > NOTES_MAX) errors.notes = 'co_e_notes'

  if (phone === null || Object.keys(errors).length > 0) return { ok: false, errors }
  return { ok: true, value: { name, email, phone, notes: notes === '' ? null : notes } }
}

/**
 * A saved phone (`users.phone`) as the checkout field shows it: its country
 * for the picker and the number in that country's own format.
 *
 * A number saved before per-country validation may not be a valid mobile
 * number (a local zero after the code, a landline). It is shown as it is,
 * with no country, and the field tells the traveller what to correct —
 * better than silently dropping the number they gave us.
 */
export function phoneDefaults(stored: string | null | undefined): {
  country: string | null
  phone: string
} {
  const compact = (stored ?? '').replace(/\s/g, '')
  if (compact === '') return { country: null, phone: '' }
  const country = isValidE164(compact) ? countryOfE164(compact) : undefined
  if (country === undefined) return { country: null, phone: compact }
  return {
    country,
    phone: parsePhoneNumberFromString(compact)?.formatNational() ?? compact,
  }
}
