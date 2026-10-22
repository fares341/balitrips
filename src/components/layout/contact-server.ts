/**
 * Server-side read of the contact details (Studio → Configuration → Contact).
 *
 * Never throws: when the settings table cannot be read (a build without a
 * database, a transient outage) the shipped fallback is used, so the footer
 * and the WhatsApp button keep working.
 */

import 'server-only'

import { readSetting } from '@/app/(admin)/_lib/settings'

import {
  FALLBACK_CONTACT,
  normaliseWhatsapp,
  whatsappHref,
  type ContactInfo,
} from './contact-config'

export async function getContact(): Promise<ContactInfo> {
  try {
    const contact = await readSetting('contact')
    const digits = normaliseWhatsapp(contact.whatsappNumber)
    return {
      whatsappDigits: digits,
      whatsappDisplay: digits === null ? null : contact.whatsappDisplay || `+${digits}`,
      email: contact.supportEmail || FALLBACK_CONTACT.email,
    }
  } catch {
    return FALLBACK_CONTACT
  }
}

export async function getWhatsappLink(message?: string): Promise<string | null> {
  return whatsappHref((await getContact()).whatsappDigits, message)
}
