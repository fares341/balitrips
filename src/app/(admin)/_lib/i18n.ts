import { cookies } from 'next/headers'

import {
  ADMIN_LOCALE_COOKIE,
  DEFAULT_ADMIN_LOCALE,
  intlLocale,
  isAdminLocale,
  translator,
  type AdminLocale,
  type Translate,
} from '../_i18n'

/** The Studio language: the `studio_lang` cookie (see DEFAULT/INITIAL_ADMIN_LOCALE). */
export async function getAdminLocale(): Promise<AdminLocale> {
  const value = (await cookies()).get(ADMIN_LOCALE_COOKIE)?.value
  return isAdminLocale(value) ? value : DEFAULT_ADMIN_LOCALE
}

export interface AdminI18n {
  locale: AdminLocale
  dir: 'rtl' | 'ltr'
  /** For Intl.DateTimeFormat / NumberFormat / toLocaleString. */
  intl: string
  t: Translate
}

/**
 * Server Components and server actions:
 *   const { t, intl } = await getAdminI18n()
 *   t("<area>.<name>") — with {placeholders}: t(key, { amount })
 */
export async function getAdminI18n(): Promise<AdminI18n> {
  const locale = await getAdminLocale()
  return {
    locale,
    dir: locale === 'ar' ? 'rtl' : 'ltr',
    intl: intlLocale(locale),
    t: translator(locale),
  }
}
