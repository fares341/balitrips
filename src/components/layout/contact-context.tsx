'use client'

/**
 * Client access to the contact details the layout read from Studio settings.
 * Falls back to `FALLBACK_CONTACT` outside the provider (tests, isolated
 * renders), so a component never has to handle "no context".
 */

import { createContext, useContext } from 'react'

import { FALLBACK_CONTACT, whatsappHref, type ContactInfo } from './contact-config'

const ContactContext = createContext<ContactInfo>(FALLBACK_CONTACT)

export function ContactProvider({
  value,
  children,
}: {
  value: ContactInfo
  children: React.ReactNode
}) {
  return <ContactContext.Provider value={value}>{children}</ContactContext.Provider>
}

export function useContact(): ContactInfo {
  return useContext(ContactContext)
}

/** `wa.me` link for the configured number, or null when WhatsApp is off. */
export function useWhatsappLink(message?: string): string | null {
  return whatsappHref(useContact().whatsappDigits, message)
}
