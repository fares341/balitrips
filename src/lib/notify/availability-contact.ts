/** «أبلغني عند التوفر»: contact validation (pure — no database). */

import { isPlaceholderEmail } from '@/lib/auth/phone'

import { toWhatsappNumber } from './whatsapp'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export interface AlertContact {
  email: string | null
  phone: string | null
  key: string
}

/**
 * Normalised contact, or an error code. Email lower-cased; phone to E.164
 * (must be written with the country code, as WhatsApp needs it).
 */
export function normaliseAlertContact(
  rawEmail: string | null | undefined,
  rawPhone: string | null | undefined,
): AlertContact | { error: 'contact_required' | 'email_invalid' | 'phone_invalid' } {
  const emailIn = (rawEmail ?? '').trim().toLowerCase()
  const phoneIn = (rawPhone ?? '').trim()
  if (!emailIn && !phoneIn) return { error: 'contact_required' }
  let email: string | null = null
  if (emailIn) {
    if (emailIn.length > 254 || !EMAIL_RE.test(emailIn) || isPlaceholderEmail(emailIn)) {
      return { error: 'email_invalid' }
    }
    email = emailIn
  }
  let phone: string | null = null
  if (phoneIn) {
    phone = toWhatsappNumber(
      phoneIn.startsWith('+') || phoneIn.startsWith('00') ? phoneIn : `+${phoneIn}`,
    )
    if (!phone) return { error: 'phone_invalid' }
  }
  const key = [email ? `e:${email}` : '', phone ? `p:${phone}` : ''].filter(Boolean).join('|')
  return { email, phone, key }
}
