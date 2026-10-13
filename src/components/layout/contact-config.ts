/**
 * Public contact details, read from the build environment.
 *
 * `NEXT_PUBLIC_*` values are inlined at build time, so these are plain
 * constants on both the server and the client. Kept in one module so the
 * floating WhatsApp button and the "Ask an expert" blocks cannot disagree
 * about the number.
 *
 * No 'use client' — data only.
 */

const WA_MIN_DIGITS = 8
const WA_MAX_DIGITS = 15

/**
 * The WhatsApp number as `wa.me` wants it: digits only, no `+`.
 *
 * Null when `NEXT_PUBLIC_WHATSAPP_NUMBER` is unset or not a plausible E.164
 * number — callers hide their WhatsApp entry rather than link to a stranger.
 */
export const WHATSAPP_DIGITS: string | null = (() => {
  const digits = (process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? '').replace(/\D/g, '')
  return digits.length >= WA_MIN_DIGITS && digits.length <= WA_MAX_DIGITS ? digits : null
})()

/** How the number is printed; falls back to `+<digits>`. */
export const WHATSAPP_DISPLAY: string | null =
  process.env.NEXT_PUBLIC_WHATSAPP_DISPLAY?.trim() ||
  (WHATSAPP_DIGITS === null ? null : `+${WHATSAPP_DIGITS}`)

/** Same source and fallback as /contact. */
export const CONTACT_EMAIL: string = process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? 'hello@balitrips.com'

/** `https://wa.me/<digits>`, optionally with a prefilled message. */
export function whatsappLink(message?: string): string | null {
  if (WHATSAPP_DIGITS === null) return null
  const base = `https://wa.me/${WHATSAPP_DIGITS}`
  return message ? `${base}?text=${encodeURIComponent(message)}` : base
}
