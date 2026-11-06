'use server'

/**
 * «خصم أول حجز» — the soft opt-in offer. The visitor gives a name and a
 * WhatsApp number (e-mail optional) and gets a single-use code on screen.
 * Consent to offers is a separate, unticked box: without it the code is still
 * shown, but nothing promotional is ever sent.
 */

import { cookies, headers } from 'next/headers'
import { getTranslations } from 'next-intl/server'

import { isLocale, type Locale } from '@/i18n/config'
import { DIAL_CODES } from '@/lib/auth/phone'
import { getUser } from '@/lib/auth/session'
import { CART_TOKEN_COOKIE } from '@/lib/cart'
import { ensureLeadCoupon, upsertLead } from '@/lib/leads/capture'
import { readLeadSettings } from '@/lib/leads/settings'
import { normaliseAlertContact } from '@/lib/notify/availability-contact'
import { consumeRateLimits } from '@/lib/rate-limit'
import { clientIp, requestCountry } from '@/lib/security/ip'

export interface OfferConfig {
  enabled: boolean
  percent: number
  delaySeconds: number
  headline: string
  /** Dial code (digits) guessed from the visitor's country. */
  dial: string
}

export async function leadOfferConfigAction(rawLocale: string): Promise<OfferConfig> {
  const locale: Locale = isLocale(rawLocale) ? rawLocale : 'ar'
  const settings = await readLeadSettings().catch(() => null)
  const user = await getUser().catch(() => null)
  const country = requestCountry(await headers())
  const dial = DIAL_CODES.find((c) => c.iso === country)?.dial ?? (locale === 'id' ? '62' : '966')
  return {
    // Signed-in customers with a phone already gave us their details.
    enabled: Boolean(settings?.popupEnabled) && !(user && user.phone),
    percent: settings?.discountPercent ?? 10,
    delaySeconds: settings?.delaySeconds ?? 25,
    headline: settings?.headline[locale]?.trim() ?? '',
    dial,
  }
}

export type OfferResult =
  | { ok: true; code: string; validTo: string | null; sentWhatsapp: boolean; sentEmail: boolean }
  | { ok: false; error: 'name' | 'phone_invalid' | 'email_invalid' | 'rate' | 'off' | 'failed' }

export async function claimLeadOfferAction(input: {
  name: string
  dial: string
  phone: string
  email: string
  consent: boolean
  locale: string
  /** Honeypot: a person never fills it. */
  website?: string
}): Promise<OfferResult> {
  const locale: Locale = isLocale(String(input.locale)) ? (input.locale as Locale) : 'ar'
  const settings = await readLeadSettings()
  if (!settings.popupEnabled) return { ok: false, error: 'off' }
  if (input.website) return { ok: false, error: 'failed' }

  const name = String(input.name ?? '')
    .trim()
    .slice(0, 128)
  if (name.length < 2) return { ok: false, error: 'name' }
  const digits = String(input.phone ?? '')
    .replace(/\D/g, '')
    .replace(/^0+/, '')
  const dial = String(input.dial ?? '').replace(/\D/g, '')
  if (!DIAL_CODES.some((c) => c.dial === dial) || digits.length < 6 || digits.length > 13) {
    return { ok: false, error: 'phone_invalid' }
  }
  const contact = normaliseAlertContact(
    String(input.email ?? '').slice(0, 300),
    `+${dial}${digits}`,
  )
  if ('error' in contact) {
    return {
      ok: false,
      error: contact.error === 'email_invalid' ? 'email_invalid' : 'phone_invalid',
    }
  }

  const head = await headers()
  const user = await getUser().catch(() => null)
  const limit = await consumeRateLimits('leadOffer', [clientIp(head) ?? 'unknown'])
  if (!limit.allowed) return { ok: false, error: 'rate' }

  try {
    const t = await getTranslations({ locale })
    const consent = input.consent === true
    const store = await cookies()
    const lead = await upsertLead({
      source: 'popup',
      name,
      phone: `+${contact.phone}`,
      email: contact.email,
      locale,
      country: requestCountry(head),
      userId: user?.id ?? null,
      cartToken: store.get(CART_TOKEN_COOKIE)?.value ?? null,
      whatsappConsent: consent,
      emailConsent: consent && contact.email !== null,
      consentText: consent ? t('lead_consent') : null,
    })
    if (!lead) return { ok: false, error: 'failed' }
    const coupon = await ensureLeadCoupon(lead, settings)
    if (!coupon) return { ok: false, error: 'failed' }

    const { absoluteUrl } = await import('@/app/[locale]/_meta')
    let sentWhatsapp = false
    if (consent) {
      const { triggerContactAutomation } = await import('@/lib/whatsapp/dispatch')
      sentWhatsapp = await triggerContactAutomation(
        'lead_offer_code',
        `lead_offer_code:${lead.id}`,
        { userId: lead.userId, phone: lead.phone, consent: true, locale, name },
        {
          name,
          code: coupon.code,
          percent: String(settings.discountPercent),
          link: absoluteUrl('/cart', locale),
        },
      )
    }
    let sentEmail = false
    if (contact.email) {
      // The visitor asked for this code — sending it is the request, not marketing.
      const { emailGuest } = await import('@/lib/notify/guest')
      sentEmail = await emailGuest({
        to: contact.email,
        locale,
        type: 'lead_code',
        params: { code: coupon.code, percent: String(settings.discountPercent) },
        name,
        href: '/cart',
      })
    }
    return {
      ok: true,
      code: coupon.code,
      validTo: coupon.validTo ? coupon.validTo.toISOString().slice(0, 10) : null,
      sentWhatsapp,
      sentEmail,
    }
  } catch (error) {
    console.error('[leads] offer claim failed', error)
    return { ok: false, error: 'failed' }
  }
}
