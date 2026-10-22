/**
 * Public contact details.
 *
 * The source of truth is Studio → Configuration → Contact (`site_settings`
 * key `contact`). Server code reads it with `getContact()` (contact-server.ts)
 * and the layout hands the same value to client components through
 * `ContactProvider` (contact-context.tsx), so the floating WhatsApp button,
 * the footer, /contact and every "ask an expert" block use ONE number.
 *
 * This module holds the shipped fallback (used until a row is saved, and when
 * the database cannot be read) and the pure helpers. The `NEXT_PUBLIC_*`
 * variables still override the fallback for a deployment that sets them.
 *
 * No 'use client' — data only.
 */

export type ContactInfo = {
  /** E.164 digits without `+`, as `wa.me` wants them. Null hides WhatsApp entries. */
  whatsappDigits: string | null
  /** How the number is printed. */
  whatsappDisplay: string | null
  email: string
}

const WA_MIN_DIGITS = 8
const WA_MAX_DIGITS = 15

/** The number the site has always linked to (wa.me/966548816380). */
export const DEFAULT_WHATSAPP_NUMBER = '966548816380'
export const DEFAULT_WHATSAPP_DISPLAY = '+966 54 881 6380'
export const DEFAULT_CONTACT_EMAIL = 'hello@balitrips.co'

export function normaliseWhatsapp(raw: string | null | undefined): string | null {
  const digits = (raw ?? '').replace(/\D/g, '')
  return digits.length >= WA_MIN_DIGITS && digits.length <= WA_MAX_DIGITS ? digits : null
}

const envDigits = normaliseWhatsapp(process.env.NEXT_PUBLIC_WHATSAPP_NUMBER)

/** Fallback contact: environment first, then the shipped defaults. */
export const FALLBACK_CONTACT: ContactInfo = {
  whatsappDigits: envDigits ?? DEFAULT_WHATSAPP_NUMBER,
  whatsappDisplay:
    process.env.NEXT_PUBLIC_WHATSAPP_DISPLAY?.trim() ||
    (envDigits === null ? DEFAULT_WHATSAPP_DISPLAY : `+${envDigits}`),
  email: process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() || DEFAULT_CONTACT_EMAIL,
}

/** `https://wa.me/<digits>`, optionally with a prefilled message. */
export function whatsappHref(digits: string | null, message?: string): string | null {
  if (digits === null) return null
  const base = `https://wa.me/${digits}`
  return message ? `${base}?text=${encodeURIComponent(message)}` : base
}
