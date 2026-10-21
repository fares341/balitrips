'use server'

/**
 * «أبلغني عند التوفر» on an unavailable activity: save the request, and the
 * signed-in visitor's contact for prefilling the form. The contact is used for
 * this one alert only (src/lib/notify/availability.ts).
 */

import { headers } from 'next/headers'

import { isLocale, type Locale } from '@/i18n/config'
import { isPlaceholderEmail } from '@/lib/auth/phone'
import { getUser } from '@/lib/auth/session'
import { normaliseAlertContact, subscribeAvailabilityAlert } from '@/lib/notify/availability'
import { consumeRateLimits } from '@/lib/rate-limit'
import { clientIp } from '@/lib/security/ip'

export type AlertResult =
  | { ok: true }
  | {
      ok: false
      error: 'contact_required' | 'email_invalid' | 'phone_invalid' | 'rate' | 'failed'
    }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function subscribeAlertAction(input: {
  activityId: string
  email: string
  phone: string
  locale: string
}): Promise<AlertResult> {
  if (!UUID.test(String(input.activityId))) return { ok: false, error: 'failed' }
  const contact = normaliseAlertContact(
    String(input.email ?? '').slice(0, 300),
    String(input.phone ?? '').slice(0, 40),
  )
  if ('error' in contact) return { ok: false, error: contact.error }

  const user = await getUser().catch(() => null)
  const limit = await consumeRateLimits('availabilityAlert', [
    clientIp(await headers()) ?? 'unknown',
    user?.id,
  ])
  if (!limit.allowed) return { ok: false, error: 'rate' }

  const locale: Locale = isLocale(String(input.locale)) ? (input.locale as Locale) : 'ar'
  try {
    const saved = await subscribeAvailabilityAlert({
      activityId: input.activityId,
      contact,
      locale,
      userId: user?.id ?? null,
    })
    return saved ? { ok: true } : { ok: false, error: 'failed' }
  } catch (error) {
    console.error('[availability] subscribe failed', error)
    return { ok: false, error: 'failed' }
  }
}

/** The signed-in visitor's email and phone, to prefill the form (or blanks). */
export async function alertPrefillAction(): Promise<{ email: string; phone: string }> {
  const user = await getUser().catch(() => null)
  if (!user) return { email: '', phone: '' }
  return {
    email: isPlaceholderEmail(user.email) ? '' : user.email,
    phone: user.phone ?? '',
  }
}
