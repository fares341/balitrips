import { createHash } from 'node:crypto'

/**
 * Hashing for the ad platforms' server APIs (Meta Conversions API, TikTok
 * Events API). Both specify: normalise, then SHA-256, lowercase hex.
 *
 * Used ONLY for a visitor who accepted marketing cookies; never for anyone
 * else, and the plain value is never sent.
 */

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

/** Email: trim, lowercase. Not an email → null. */
export function normalizeEmail(email: string | null | undefined): string | null {
  if (typeof email !== 'string') return null
  const value = email.trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : null
}

/** Phone: digits only with the country code, no `+` or leading zeros. */
export function normalizePhone(phone: string | null | undefined): string | null {
  if (typeof phone !== 'string') return null
  const digits = phone.replace(/\D/g, '').replace(/^0+/, '')
  return digits.length >= 8 && digits.length <= 15 ? digits : null
}

export function hashedEmail(email: string | null | undefined): string | null {
  const value = normalizeEmail(email)
  return value === null ? null : sha256Hex(value)
}

export function hashedPhone(phone: string | null | undefined): string | null {
  const value = normalizePhone(phone)
  return value === null ? null : sha256Hex(value)
}
